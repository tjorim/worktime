"""FastMCP server exposing Worktime tools (read and personal write).

This module is the thin assembler: imports, the ``WorktimeMcpContext``
principal (re-exported from ``app.mcp.context``), auth-provider building
(Keycloak + managed integration clients), and tool registration
(``create_mcp_server``). Actual tool logic lives in the domain modules under
``app.mcp`` (identity, schedule, time_tracking, work_location, time_off,
gantt) as plain async functions this module's ``WorktimeMcpBackend`` methods
delegate to — mirroring champagnefestival's ``app/mcp/`` package shape.
"""

from __future__ import annotations

import logging
import os
from collections.abc import AsyncGenerator, Sequence
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import date, datetime
from enum import StrEnum
from typing import Any

from fastmcp import FastMCP
from fastmcp.server.auth import AccessToken, AuthCheck, AuthContext, MultiAuth, TokenVerifier
from fastmcp.server.auth.providers.keycloak import KeycloakAuthProvider
from fastmcp.server.dependencies import get_access_token
from fastmcp.server.http import StarletteWithLifespan
from fastmcp.server.transforms.search import BM25SearchTransform
from fastmcp.tools.base import Tool
from mcp.types import ToolAnnotations
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.middleware import Middleware as ASGIMiddleware
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.config import settings
from app.database.engine import get_session_factory
from app.mcp import account, gantt, holidays, identity, schedule, time_off, time_tracking, work_location
from app.mcp.context import (
    McpAuthError,
    McpPermissionError,
    McpRateLimitError,
    WorktimeMcpContext,
)
from app.mcp.context import (
    map_domain_errors as _map_domain_errors,
)
from app.schemas import EntryFlag, EntryKind, EntryType, IntegrationClientScope
from app.services import integration_client_service
from app.services.db_service import get_user
from app.version import APP_VERSION

logger = logging.getLogger(__name__)


def _search_serializer(tools: Sequence[Tool]) -> list[dict[str, Any]]:
    """Preserve callable schemas and Worktime capability metadata in search results."""
    return [
        {
            "name": tool.name,
            "description": tool.description or "",
            "input_schema": tool.parameters,
            "required_tier": MCP_TOOL_CAPABILITIES[tool.name].required_tier,
            "effect": MCP_TOOL_CAPABILITIES[tool.name].effect.value,
        }
        for tool in tools
    ]


__all__ = [
    "McpAuthError",
    "McpPermissionError",
    "McpRateLimitError",
    "WorktimeMcpContext",
    "WorktimeMcpBackend",
    "IntegrationClientRateLimitMiddleware",
    "create_mcp_server",
    "create_mcp_http_app",
]


class DbIntegrationClientVerifier(TokenVerifier):
    """Verify managed, database-backed integration-client keys (issue #1054).

    Looks the presented key's HMAC hash up in ``integration_clients`` instead
    of a static in-memory map, so credentials can be created, rotated, and
    revoked at runtime without a process restart. Inactive/revoked/unknown
    keys verify as ``None`` (auth failure), matching ``TokenVerifier``'s
    contract. Records best-effort ``last_used_at`` telemetry on success.

    Rate limiting is deliberately *not* enforced here (issue #1106): FastMCP's
    ``MultiAuth`` treats any exception a verifier raises from ``verify_token``
    as a non-match and tries the next source, so a client over its limit would
    have surfaced as "401 invalid credentials" instead of 429 either way.
    ``IntegrationClientRateLimitMiddleware`` enforces it after auth resolves.
    """

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def verify_token(self, token: str) -> AccessToken | None:
        if not token.startswith(integration_client_service.KEY_PREFIX):
            return None

        async with self._session_factory() as session:
            client = await integration_client_service.get_active_integration_client_by_key(session, token)
            if client is None:
                return None
            if integration_client_service.MCP_SCOPE not in client.scopes:
                return None
            try:
                await integration_client_service.record_integration_client_usage(session, client)
            except SQLAlchemyError:
                logger.warning("Failed to record integration client usage", exc_info=True)

        return AccessToken(
            token=token,
            client_id=f"integration-client-{client.id}",
            scopes=list(client.scopes),
            claims={
                "worktime_user_id": client.user_id,
                "worktime_is_admin": integration_client_service.ADMIN_SCOPE in client.scopes,
                "sub": f"integration-client:{client.id}",
                "auth_source": "integration",
                "integration_client_id": client.id,
                "auth_type": "integration_client",
                "worktime_integration_client_id": client.id,
                "worktime_integration_client_name": client.name,
                "worktime_integration_client_scopes": list(client.scopes),
                "worktime_integration_client_rate_limit_per_minute": client.rate_limit_per_minute,
            },
        )


def _build_auth_provider(
    session_factory: async_sessionmaker[AsyncSession] | None = None,
) -> KeycloakAuthProvider | MultiAuth:
    """Build the FastMCP auth provider from Keycloak and managed clients."""
    base_url = os.environ.get("WORKTIME_MCP_BASE_URL", "http://localhost:8000/mcp")
    realm_url = os.environ.get("WORKTIME_MCP_KEYCLOAK_REALM_URL", settings.OIDC_ISSUER_URL)
    audience = settings.OIDC_AUDIENCE or None

    keycloak = KeycloakAuthProvider(
        realm_url=realm_url,
        base_url=base_url,
        required_scopes=[],
        audience=audience,
    )

    verifier = DbIntegrationClientVerifier(session_factory or get_session_factory())
    return MultiAuth(server=keycloak, verifiers=[verifier])


class IntegrationClientRateLimitMiddleware:
    """Reject over-limit managed-integration-client requests with 429 (issue #1106).

    FastMCP wires this ASGI middleware in right after its own auth middleware
    (``AuthenticationMiddleware`` + ``AuthContextMiddleware``) and before
    ``RequireAuthMiddleware``'s 401 gate — see ``create_mcp_http_app`` below —
    so ``get_access_token()`` already reflects a successfully verified token
    by the time this runs, and a 429 here short-circuits before the request
    ever reaches ``RequireAuthMiddleware`` or the MCP session handling.
    Requests with no integration-client claim (OIDC users, unauthenticated
    requests) pass straight through — rate limiting only applies to managed
    integration clients, matching ``enforce_integration_client_rate_limit``.
    """

    def __init__(self, app: ASGIApp, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._app = app
        self._session_factory = session_factory

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return

        access_token = get_access_token()
        client_id = (access_token.claims or {}).get("integration_client_id") if access_token else None
        if client_id is None:
            await self._app(scope, receive, send)
            return

        async with self._session_factory() as session:
            try:
                await integration_client_service.enforce_integration_client_rate_limit(session, client_id)
            except integration_client_service.RateLimitExceededError as exc:
                response = JSONResponse(
                    {"error": "rate_limited", "error_description": str(exc)},
                    status_code=429,
                    headers={"Retry-After": str(exc.retry_after_seconds)},
                )
                await response(scope, receive, send)
                return
            except SQLAlchemyError:
                logger.warning("Failed to enforce integration client rate limit", exc_info=True)

        await self._app(scope, receive, send)


class WorktimeMcpBackend:
    """MCP backend wrapper reusing Worktime services (read and personal write)."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self.session_factory = session_factory

    async def resolve_context(self, db: AsyncSession) -> WorktimeMcpContext:
        access_token = get_access_token()
        if access_token is None:
            raise McpAuthError("Authentication required")

        claims = dict(access_token.claims or {})
        raw_user_id = claims.get("worktime_user_id")
        subject = claims.get("sub")
        auth_type = str(claims.get("auth_type") or "oidc")
        preferred_username = claims.get("preferred_username")
        is_service_account = isinstance(preferred_username, str) and preferred_username.startswith("service-account-")

        if raw_user_id is not None:
            try:
                user_id = int(raw_user_id)
            except (TypeError, ValueError) as exc:
                raise McpAuthError("Invalid authenticated user context") from exc
            if is_service_account:
                auth_type = "keycloak_service"
        elif subject and not is_service_account:
            from app.config.oidc_config import get_or_create_local_user

            user = await get_or_create_local_user(str(subject), claims, db)
            user_id = user.id
        else:
            raise McpAuthError(
                "Keycloak service accounts require a worktime_user_id protocol mapper"
                if is_service_account
                else "Missing token subject"
            )

        user = await get_user(db, user_id)
        realm_access = claims.get("realm_access")
        roles = realm_access.get("roles", []) if isinstance(realm_access, dict) else []
        is_admin = bool(claims.get("worktime_is_admin")) or (isinstance(roles, list) and "admin" in roles)

        return WorktimeMcpContext(
            user_id=user.id,
            username=user.username,
            display_name=user.display_name,
            is_admin=is_admin,
            subject=str(subject) if subject is not None else None,
            claims=claims,
            scopes=list(access_token.scopes),
            auth_type=auth_type,
        )

    @asynccontextmanager
    async def _tool_context(self) -> AsyncGenerator[tuple[WorktimeMcpContext, AsyncSession], None]:
        db = self.session_factory()
        try:
            context = await self.resolve_context(db)
            yield context, db
        finally:
            await db.close()

    # ------------------------------------------------------------------
    # Identity
    # ------------------------------------------------------------------

    async def whoami(self) -> dict[str, Any]:
        async with self._tool_context() as (context, _db):
            return await identity.whoami(context)

    # ------------------------------------------------------------------
    # Schedule (read-only)
    # ------------------------------------------------------------------

    async def get_current_status(self) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await schedule.get_current_status(context, db)

    async def get_next_shift(self) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await schedule.get_next_shift(context, db)

    async def get_team_status(self) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await schedule.get_team_status(context, db)

    async def get_next_shifts_for_team(self, team_number: int, limit: int = 5) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await schedule.get_next_shifts_for_team(context, db, team_number, limit)

    async def get_sync_status(self) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await schedule.get_sync_status(context, db)

    async def get_public_holidays(self, year: int, country: str = "NL") -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await holidays.get_public_holidays(context, db, year, country)

    async def get_school_holidays(self, year: int, country: str = "NL") -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await holidays.get_school_holidays(context, db, year, country)

    async def get_paydates(self, year: int, country: str = "NL") -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await holidays.get_paydates(context, db, year, country)

    # ------------------------------------------------------------------
    # Time tracking
    # ------------------------------------------------------------------

    async def get_time_tracking_summary(
        self,
        start_at: datetime | None = None,
        end_at: datetime | None = None,
    ) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await time_tracking.get_time_tracking_summary(context, db, start_at, end_at)

    async def list_labels(self) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await time_tracking.list_labels(context, db)

    @_map_domain_errors
    async def create_label(self, name: str, color: str) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await time_tracking.create_label_tool(context, db, name, color)

    @_map_domain_errors
    async def update_label(self, label_id: str, name: str | None = None, color: str | None = None) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await time_tracking.update_label_tool(context, db, label_id, name, color)

    @_map_domain_errors
    async def delete_label(self, label_id: str) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await time_tracking.delete_label_tool(context, db, label_id)

    @_map_domain_errors
    async def start_time_entry(
        self,
        text: str,
        start_time: datetime | None = None,
        label_id: str | None = None,
    ) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await time_tracking.start_time_entry(context, db, text, start_time, label_id)

    @_map_domain_errors
    async def stop_time_entry(self, stop_time: datetime | None = None) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await time_tracking.stop_time_entry(context, db, stop_time)

    @_map_domain_errors
    async def create_time_tracking_task(
        self,
        text: str,
        start_time: datetime,
        stop_time: datetime | None = None,
        includes_break: bool = False,
        label_id: str | None = None,
    ) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await time_tracking.create_time_tracking_task(
                context, db, text, start_time, stop_time, includes_break, label_id
            )

    @_map_domain_errors
    async def update_time_tracking_task(
        self,
        task_id: str,
        text: str | None = None,
        start_time: datetime | None = None,
        stop_time: datetime | None = None,
        includes_break: bool | None = None,
        label_id: str | None = None,
        clear_stop_time: bool = False,
        clear_label_id: bool = False,
    ) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await time_tracking.update_time_tracking_task(
                context,
                db,
                task_id,
                text,
                start_time,
                stop_time,
                includes_break,
                label_id,
                clear_stop_time,
                clear_label_id,
            )

    @_map_domain_errors
    async def delete_time_tracking_task(self, task_id: str) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await time_tracking.delete_time_tracking_task(context, db, task_id)

    # ------------------------------------------------------------------
    # Work location
    # ------------------------------------------------------------------

    async def get_work_location_summary(
        self,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await work_location.get_work_location_summary(context, db, start_date, end_date)

    @_map_domain_errors
    async def set_work_location(
        self,
        value_date: date,
        country_code: str,
        label: str | None = None,
    ) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await work_location.set_work_location(context, db, value_date, country_code, label)

    @_map_domain_errors
    async def delete_work_location(self, value_date: date) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await work_location.delete_work_location_tool(context, db, value_date)

    # ------------------------------------------------------------------
    # Time off
    # ------------------------------------------------------------------

    async def get_time_off_summary(
        self,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await time_off.get_time_off_summary(context, db, start_date, end_date)

    @_map_domain_errors
    async def create_time_off_event(
        self,
        entry_kind: EntryKind,
        entry_type: EntryType,
        entry_flag: EntryFlag = "full_day",
        date: date | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
        weekday: int | None = None,
        note: str | None = None,
        entry_id: str | None = None,
    ) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await time_off.create_time_off_event(
                context,
                db,
                entry_kind=entry_kind,
                entry_type=entry_type,
                entry_flag=entry_flag,
                date=date,
                start_date=start_date,
                end_date=end_date,
                weekday=weekday,
                note=note,
                entry_id=entry_id,
            )

    @_map_domain_errors
    async def update_time_off_event(
        self,
        entry_id: str,
        entry_kind: EntryKind | None = None,
        entry_type: EntryType | None = None,
        entry_flag: EntryFlag | None = None,
        date: date | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
        weekday: int | None = None,
        note: str | None = None,
    ) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await time_off.update_time_off_event(
                context,
                db,
                entry_id=entry_id,
                entry_kind=entry_kind,
                entry_type=entry_type,
                entry_flag=entry_flag,
                date=date,
                start_date=start_date,
                end_date=end_date,
                weekday=weekday,
                note=note,
            )

    @_map_domain_errors
    async def delete_time_off_event(self, entry_id: str) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await time_off.delete_time_off_event(context, db, entry_id)

    # ------------------------------------------------------------------
    # Gantt
    # ------------------------------------------------------------------

    async def get_gantt_tasks(
        self,
        active_on: date | None = None,
        task_id: str | None = None,
    ) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await gantt.get_gantt_tasks(context, db, active_on, task_id)

    @_map_domain_errors
    async def create_gantt_task(
        self,
        name: str,
        start_date: date,
        end_date: date,
        progress: int = 0,
        dependencies: str | None = None,
        notes: str | None = None,
        label_id: str | None = None,
    ) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await gantt.create_gantt_task(
                context, db, name, start_date, end_date, progress, dependencies, notes, label_id
            )

    @_map_domain_errors
    async def update_gantt_task(
        self,
        task_id: str,
        name: str | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
        progress: int | None = None,
        dependencies: str | None = None,
        notes: str | None = None,
        label_id: str | None = None,
        clear_label_id: bool = False,
    ) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await gantt.update_gantt_task(
                context,
                db,
                task_id=task_id,
                name=name,
                start_date=start_date,
                end_date=end_date,
                progress=progress,
                dependencies=dependencies,
                notes=notes,
                label_id=label_id,
                clear_label_id=clear_label_id,
            )

    @_map_domain_errors
    async def delete_gantt_task(self, task_id: str) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await gantt.delete_gantt_task(context, db, task_id)

    # ------------------------------------------------------------------
    # Account data and managed integrations
    # ------------------------------------------------------------------

    async def list_audit_entries(self, limit: int = 100, before_id: int | None = None) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await account.list_audit_entries_tool(context, db, limit, before_id)

    async def get_preferences(self) -> dict[str, Any] | None:
        async with self._tool_context() as (context, db):
            return await account.get_preferences(context, db)

    async def list_integration_clients(self) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await account.list_integration_clients(context, db)

    @_map_domain_errors
    async def create_integration_client(
        self,
        name: str,
        scopes: list[IntegrationClientScope] | None = None,
        rate_limit_per_minute: int = 120,
    ) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await account.create_integration_client_tool(context, db, name, scopes, rate_limit_per_minute)

    @_map_domain_errors
    async def rotate_integration_client(self, client_id: int) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await account.rotate_integration_client_tool(context, db, client_id)

    @_map_domain_errors
    async def revoke_integration_client(self, client_id: int) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            return await account.revoke_integration_client_tool(context, db, client_id)


# ---------------------------------------------------------------------------
# Capability manifest (issue #1054)
# ---------------------------------------------------------------------------


class ToolEffect(StrEnum):
    """Side-effect classification for capability discovery."""

    READ = "read"
    PERSONAL_WRITE = "personal_write"
    ADMIN_WRITE = "admin_write"


@dataclass(frozen=True)
class ToolCapability:
    effect: ToolEffect
    required_tier: str  # "owner" (caller's own data) or "admin"


# Single source of truth for both tool registration (create_mcp_server, below)
# and capability discovery (GET /api/mcp/capabilities, app.main). Because
# create_mcp_server() registers exactly the tools named here — no more, no
# less — the capability manifest structurally cannot drift from what's
# actually registered.
#
# Every current tool operates on the caller's own data (context.user_id);
# none accept a target user_id, so there is no admin_write tool today. That's
# a deliberate current-state fact, not a design ceiling — a future team-wide
# write tool would be tagged ADMIN_WRITE / "admin" here.
MCP_TOOL_CAPABILITIES: dict[str, ToolCapability] = {
    "whoami": ToolCapability(ToolEffect.READ, "owner"),
    "get_current_status": ToolCapability(ToolEffect.READ, "owner"),
    "get_next_shift": ToolCapability(ToolEffect.READ, "owner"),
    "get_team_status": ToolCapability(ToolEffect.READ, "owner"),
    "get_next_shifts_for_team": ToolCapability(ToolEffect.READ, "owner"),
    "get_time_off_summary": ToolCapability(ToolEffect.READ, "owner"),
    "get_work_location_summary": ToolCapability(ToolEffect.READ, "owner"),
    "get_time_tracking_summary": ToolCapability(ToolEffect.READ, "owner"),
    "list_labels": ToolCapability(ToolEffect.READ, "owner"),
    "create_label": ToolCapability(ToolEffect.PERSONAL_WRITE, "owner"),
    "update_label": ToolCapability(ToolEffect.PERSONAL_WRITE, "owner"),
    "delete_label": ToolCapability(ToolEffect.PERSONAL_WRITE, "owner"),
    "get_gantt_tasks": ToolCapability(ToolEffect.READ, "owner"),
    "get_sync_status": ToolCapability(ToolEffect.READ, "owner"),
    "get_public_holidays": ToolCapability(ToolEffect.READ, "owner"),
    "get_school_holidays": ToolCapability(ToolEffect.READ, "owner"),
    "get_paydates": ToolCapability(ToolEffect.READ, "owner"),
    "start_time_entry": ToolCapability(ToolEffect.PERSONAL_WRITE, "owner"),
    "stop_time_entry": ToolCapability(ToolEffect.PERSONAL_WRITE, "owner"),
    "create_time_tracking_task": ToolCapability(ToolEffect.PERSONAL_WRITE, "owner"),
    "update_time_tracking_task": ToolCapability(ToolEffect.PERSONAL_WRITE, "owner"),
    "delete_time_tracking_task": ToolCapability(ToolEffect.PERSONAL_WRITE, "owner"),
    "set_work_location": ToolCapability(ToolEffect.PERSONAL_WRITE, "owner"),
    "delete_work_location": ToolCapability(ToolEffect.PERSONAL_WRITE, "owner"),
    "create_time_off_event": ToolCapability(ToolEffect.PERSONAL_WRITE, "owner"),
    "update_time_off_event": ToolCapability(ToolEffect.PERSONAL_WRITE, "owner"),
    "delete_time_off_event": ToolCapability(ToolEffect.PERSONAL_WRITE, "owner"),
    "create_gantt_task": ToolCapability(ToolEffect.PERSONAL_WRITE, "owner"),
    "update_gantt_task": ToolCapability(ToolEffect.PERSONAL_WRITE, "owner"),
    "delete_gantt_task": ToolCapability(ToolEffect.PERSONAL_WRITE, "owner"),
    "list_audit_entries": ToolCapability(ToolEffect.READ, "owner"),
    "get_preferences": ToolCapability(ToolEffect.READ, "owner"),
    "list_integration_clients": ToolCapability(ToolEffect.READ, "owner"),
    "create_integration_client": ToolCapability(ToolEffect.PERSONAL_WRITE, "owner"),
    "rotate_integration_client": ToolCapability(ToolEffect.PERSONAL_WRITE, "owner"),
    "revoke_integration_client": ToolCapability(ToolEffect.PERSONAL_WRITE, "owner"),
}

_INTERACTIVE_ONLY_TOOLS = frozenset(
    {
        "list_integration_clients",
        "create_integration_client",
        "rotate_integration_client",
        "revoke_integration_client",
    }
)


def _require_interactive_auth(ctx: AuthContext) -> bool:
    if ctx.token is None or ctx.token.claims.get("auth_type", "oidc") != "oidc":
        return False
    username = ctx.token.claims.get("preferred_username")
    if isinstance(username, str) and username.startswith("service-account-"):
        return False
    interactive_client_ids = {
        client_id.strip() for client_id in settings.MCP_INTERACTIVE_CLIENT_IDS.split(",") if client_id.strip()
    }
    return ctx.token.claims.get("azp") in interactive_client_ids


def tool_auth(tool_name: str) -> AuthCheck | None:
    """Hide credential-management tools from managed/service credentials."""
    return _require_interactive_auth if tool_name in _INTERACTIVE_ONLY_TOOLS else None


def tool_annotations(tool_name: str) -> ToolAnnotations:
    """Return explicit MCP safety metadata for ChatGPT and other clients."""
    capability = MCP_TOOL_CAPABILITIES.get(tool_name)
    if capability is not None and capability.effect is ToolEffect.READ:
        return ToolAnnotations(
            read_only_hint=True,
            destructive_hint=False,
            idempotent_hint=True,
            open_world_hint=False,
        )

    return ToolAnnotations(
        read_only_hint=False,
        destructive_hint=not tool_name.startswith("create_"),
        open_world_hint=False,
    )


def create_mcp_server(
    session_factory: async_sessionmaker[AsyncSession] | None = None,
) -> FastMCP:
    """Create and configure the Worktime FastMCP server."""
    factory = session_factory or get_session_factory()
    backend = WorktimeMcpBackend(factory)
    server = FastMCP(
        "worktime",
        version=APP_VERSION,
        instructions="Worktime assistant tools — read and personal write access",
        auth=_build_auth_provider(factory),
        transforms=[
            BM25SearchTransform(
                max_results=10,
                always_visible=["whoami"],
                search_tool_name="search_tools",
                call_tool_name="call_tool",
                search_result_serializer=_search_serializer,
            )
        ],
    )

    for tool_name in MCP_TOOL_CAPABILITIES:
        server.tool(
            name=tool_name,
            annotations=tool_annotations(tool_name),
            auth=tool_auth(tool_name),
        )(getattr(backend, tool_name))

    return server


def create_mcp_http_app(
    session_factory: async_sessionmaker[AsyncSession] | None = None,
    **http_app_kwargs: Any,
) -> tuple[FastMCP, StarletteWithLifespan]:
    """Create the Worktime FastMCP server and its mountable Starlette HTTP app.

    Wires ``IntegrationClientRateLimitMiddleware`` in after FastMCP's own auth
    middleware, so it sees the resolved token but still runs ahead of
    ``RequireAuthMiddleware`` (issue #1106). Prefer this over calling
    ``create_mcp_server(...).http_app(...)`` directly so callers don't have to
    re-derive the middleware wiring.
    """
    factory = session_factory or get_session_factory()
    server = create_mcp_server(factory)
    middleware = [
        ASGIMiddleware(IntegrationClientRateLimitMiddleware, session_factory=factory),
        *http_app_kwargs.pop("middleware", []),
    ]
    app = server.http_app(middleware=middleware, **http_app_kwargs)
    return server, app


def main() -> None:
    """Reject stdio startup because Worktime tools require bearer auth."""
    raise SystemExit(
        "Worktime MCP requires authenticated HTTP transport; run the FastAPI "
        "application with WORKTIME_MCP_BASE_URL configured and connect to /mcp."
    )


if __name__ == "__main__":
    main()
