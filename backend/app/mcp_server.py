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

import asyncio
import logging
import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import date, datetime
from enum import StrEnum
from typing import Any

from fastmcp import FastMCP
from fastmcp.server.auth import AccessToken, MultiAuth
from fastmcp.server.auth.auth import TokenVerifier
from fastmcp.server.auth.providers.keycloak import KeycloakAuthProvider
from fastmcp.server.dependencies import get_access_token
from mcp.types import ToolAnnotations
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import settings
from app.database.engine import get_session_factory
from app.mcp import gantt, identity, schedule, time_off, time_tracking, work_location
from app.mcp.context import (
    McpAuthError,
    McpPermissionError,
    McpRateLimitError,
    WorktimeMcpContext,
)
from app.mcp.context import (
    map_domain_errors as _map_domain_errors,
)
from app.schemas import EntryFlag, EntryKind, EntryType
from app.services import integration_client_service
from app.services.db_service import get_user

logger = logging.getLogger(__name__)

__all__ = [
    "McpAuthError",
    "McpPermissionError",
    "McpRateLimitError",
    "WorktimeMcpContext",
    "WorktimeMcpBackend",
    "create_mcp_server",
]


class DbIntegrationClientVerifier(TokenVerifier):
    """Verify managed, database-backed integration-client keys (issue #1054).

    Looks the presented key's HMAC hash up in ``integration_clients`` instead
    of a static in-memory map, so credentials can be created, rotated, and
    revoked at runtime without a process restart. Inactive/revoked/unknown
    keys verify as ``None`` (auth failure), matching ``TokenVerifier``'s
    contract. Records best-effort ``last_used_at`` telemetry on success.
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
            try:
                await integration_client_service.enforce_integration_client_rate_limit(session, client.id)
                await integration_client_service.record_integration_client_usage(session, client)
            except integration_client_service.RateLimitExceededError:
                return None
            except SQLAlchemyError:
                logger.warning("Failed to record integration client usage or rate limit", exc_info=True)

        return AccessToken(
            token=token,
            client_id=f"integration-client-{client.id}",
            scopes=list(client.scopes),
            claims={
                "worktime_user_id": client.user_id,
                "worktime_is_admin": integration_client_service.ADMIN_SCOPE in client.scopes,
                "sub": f"integration-client:{client.id}",
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
    "delete_label": ToolCapability(ToolEffect.PERSONAL_WRITE, "owner"),
    "get_gantt_tasks": ToolCapability(ToolEffect.READ, "owner"),
    "get_sync_status": ToolCapability(ToolEffect.READ, "owner"),
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
}


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
        instructions="Worktime assistant tools — read and personal write access",
        auth=_build_auth_provider(factory),
    )

    for tool_name in MCP_TOOL_CAPABILITIES:
        server.tool(name=tool_name, annotations=tool_annotations(tool_name))(getattr(backend, tool_name))

    return server


async def _run_stdio() -> None:
    server = create_mcp_server()
    await server.run_stdio_async()


def main() -> None:
    """Run the Worktime MCP server over stdio."""
    asyncio.run(_run_stdio())


if __name__ == "__main__":
    main()
