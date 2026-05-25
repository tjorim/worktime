"""FastMCP server exposing read-only Worktime tools."""

from __future__ import annotations

import asyncio
import os
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any

from fastmcp import Context, FastMCP
from fastmcp.server.auth import AccessToken, MultiAuth
from fastmcp.server.auth.providers.keycloak import KeycloakAuthProvider
from fastmcp.server.dependencies import get_access_token
from mcp.server.auth.provider import TokenVerifier
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import settings
from app.database.engine import get_session_factory
from app.schemas import GanttTaskRead, TaskRead, TimeOffEntryRead, WorkLocationRead
from app.services.db_service import (
    get_gantt_task,
    get_running_task,
    get_user,
    list_gantt_tasks,
    list_tasks,
    list_time_off_entries,
    list_work_locations,
)
from app.services.hday_parser import parse_text
from app.services.hday_service import HdayFileNotFoundError, read_hday_file
from app.services.sync_service import get_sync_status
from app.services.team_service import read_team_hday_files, read_team_info_with_sections


class McpAuthError(RuntimeError):
    """Raised when MCP authentication context is missing or invalid."""


class McpPermissionError(RuntimeError):
    """Raised when MCP caller is authenticated but not authorized."""


@dataclass(frozen=True)
class WorktimeMcpContext:
    user_id: int
    username: str
    display_name: str
    is_admin: bool
    subject: str | None
    claims: dict[str, Any]
    scopes: list[str]
    auth_type: str


class IntegrationKeyVerifier(TokenVerifier):
    """Accept static integration keys mapped to local users."""

    def __init__(self, key_mapping: dict[str, tuple[int, bool]]) -> None:
        self._key_mapping = key_mapping

    async def verify_token(self, token: str) -> AccessToken | None:
        mapping = self._key_mapping.get(token)
        if mapping is None:
            return None

        user_id, is_admin = mapping
        return AccessToken(
            token=token,
            client_id=f"integration-user-{user_id}",
            scopes=["worktime:mcp"],
            claims={
                "worktime_user_id": user_id,
                "worktime_is_admin": is_admin,
                "sub": f"integration-key:{user_id}",
                "auth_type": "integration_key",
            },
        )


def _parse_integration_key_mapping(value: str) -> dict[str, tuple[int, bool]]:
    """Parse WORKTIME_MCP_INTEGRATION_KEYS into a token->(user_id,is_admin) map.

    Format:
      token=user_id
      token=user_id:admin
      token=user_id:user
    Multiple entries are comma-separated.
    """
    mapping: dict[str, tuple[int, bool]] = {}
    for item in (part.strip() for part in value.split(",") if part.strip()):
        token, sep, raw_target = item.partition("=")
        if not sep:
            continue

        user_part, role_sep, role = raw_target.partition(":")
        try:
            user_id = int(user_part)
        except ValueError:
            continue

        is_admin = role_sep == ":" and role.strip().lower() == "admin"
        mapping[token.strip()] = (user_id, is_admin)
    return mapping


def _build_auth_provider() -> KeycloakAuthProvider | MultiAuth:
    """Build FastMCP auth provider with Keycloak plus optional integration keys."""
    base_url = os.environ.get("WORKTIME_MCP_BASE_URL", "http://localhost:8000/mcp")
    realm_url = os.environ.get("WORKTIME_MCP_KEYCLOAK_REALM_URL", settings.OIDC_ISSUER_URL)
    required_scopes_env = os.environ.get("WORKTIME_MCP_REQUIRED_SCOPES", "").strip()
    required_scopes = [scope.strip() for scope in required_scopes_env.split(",") if scope.strip()] or None
    audience = settings.OIDC_AUDIENCE or None

    keycloak = KeycloakAuthProvider(
        realm_url=realm_url,
        base_url=base_url,
        required_scopes=required_scopes,
        audience=audience,
    )

    integration_keys = _parse_integration_key_mapping(os.environ.get("WORKTIME_MCP_INTEGRATION_KEYS", ""))
    if not integration_keys:
        return keycloak

    return MultiAuth(server=keycloak, verifiers=[IntegrationKeyVerifier(integration_keys)])


def _to_iso_date(value: date) -> str:
    return value.isoformat()


def _to_iso_datetime(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat()


def _parse_hday_date(value: str) -> date | None:
    try:
        return datetime.strptime(value, "%Y/%m/%d").date()
    except ValueError:
        return None


def _hday_event_matches_day(event: dict[str, Any], day: date) -> bool:
    if event.get("type") == "weekly":
        return event.get("weekday") == day.isoweekday()
    if event.get("type") != "range":
        return False

    start = _parse_hday_date(str(event.get("start", "")))
    end = _parse_hday_date(str(event.get("end", "")))
    if start is None or end is None:
        return False
    return start <= day <= end


class WorktimeMcpBackend:
    """Read-only MCP backend wrapper reusing Worktime services."""

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

        if raw_user_id is not None:
            try:
                user_id = int(raw_user_id)
            except (TypeError, ValueError) as exc:
                raise McpAuthError("Invalid authenticated user context") from exc
        elif subject:
            from app.config.oidc_config import get_or_create_local_user

            user = await get_or_create_local_user(str(subject), claims, db)
            user_id = user.id
        else:
            raise McpAuthError("Missing token subject")

        user = await get_user(db, user_id)
        realm_access = claims.get("realm_access")
        roles = realm_access.get("roles", []) if isinstance(realm_access, dict) else []
        is_admin = bool(claims.get("worktime_is_admin")) or (
            isinstance(roles, list) and "admin" in roles
        )

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

    async def _resolve_tool_context(self) -> tuple[WorktimeMcpContext, AsyncSession]:
        db = self.session_factory()
        try:
            context = await self.resolve_context(db)
            return context, db
        except Exception:
            await db.close()
            raise

    async def whoami(self, ctx: Context) -> dict[str, Any]:
        _ = ctx
        context, db = await self._resolve_tool_context()
        try:
            return {
                "user_id": context.user_id,
                "username": context.username,
                "display_name": context.display_name,
                "is_admin": context.is_admin,
                "subject": context.subject,
                "auth_type": context.auth_type,
                "scopes": context.scopes,
            }
        finally:
            await db.close()

    async def get_current_status(self, ctx: Context) -> dict[str, Any]:
        _ = ctx
        context, db = await self._resolve_tool_context()
        today = date.today()
        now_utc = datetime.now(UTC)
        try:
            running_task = await get_running_task(db, context.user_id)
            running_task_payload = (
                TaskRead.model_validate(running_task, from_attributes=True).model_dump(mode="json")
                if running_task is not None
                else None
            )
            running_seconds = None
            if running_task is not None:
                start = running_task.start_time
                if start.tzinfo is None:
                    start = start.replace(tzinfo=UTC)
                running_seconds = max(0, int((now_utc - start.astimezone(UTC)).total_seconds()))

            work_location = None
            today_locations = await list_work_locations(db, user_id=context.user_id, start_date=today, end_date=today)
            if today_locations:
                work_location = WorkLocationRead.model_validate(
                    today_locations[-1], from_attributes=True
                ).model_dump(mode="json")

            time_off_entries = await list_time_off_entries(
                db, user_id=context.user_id, start_date=today, end_date=today
            )
            active_time_off = [
                TimeOffEntryRead.model_validate(entry, from_attributes=True).model_dump(mode="json")
                for entry in time_off_entries
            ]

            return {
                "date": _to_iso_date(today),
                "user": {
                    "user_id": context.user_id,
                    "username": context.username,
                    "display_name": context.display_name,
                },
                "running_task": running_task_payload,
                "running_task_seconds": running_seconds,
                "work_location": work_location,
                "active_time_off": active_time_off,
            }
        finally:
            await db.close()

    async def get_next_shift(self, ctx: Context) -> dict[str, Any]:
        _ = ctx
        context, db = await self._resolve_tool_context()
        today = date.today()
        try:
            tasks = await list_gantt_tasks(db, user_id=context.user_id)
            upcoming = next((task for task in tasks if task.end_date >= today), None)
            if upcoming is None:
                return {"date": _to_iso_date(today), "next_shift": None}

            task_payload = GanttTaskRead.model_validate(upcoming, from_attributes=True).model_dump(mode="json")
            return {"date": _to_iso_date(today), "next_shift": task_payload}
        finally:
            await db.close()

    async def get_team_status(self, ctx: Context, team_id: str) -> dict[str, Any]:
        _ = ctx
        context, db = await self._resolve_tool_context()
        try:
            team_name, sections, members = await asyncio.to_thread(read_team_info_with_sections, team_id)
            if not context.is_admin and context.username not in {member.username for member in members}:
                raise McpPermissionError("Not authorized for team data")

            member_data = await asyncio.to_thread(read_team_hday_files, members, True)
            today = date.today()
            available_files = sum(1 for member in member_data if member.etag is not None)
            active_today = 0
            for member in member_data:
                events = [event.model_dump(mode="json") for event in member.events]
                if any(_hday_event_matches_day(event, today) for event in events):
                    active_today += 1

            return {
                "team_id": team_id,
                "team_name": team_name,
                "date": _to_iso_date(today),
                "member_count": len(members),
                "available_hday_files": available_files,
                "members_with_active_events_today": active_today,
                "sections": [section.model_dump(mode="json") for section in sections],
            }
        finally:
            await db.close()

    async def get_time_off_summary(
        self,
        ctx: Context,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> dict[str, Any]:
        _ = ctx
        context, db = await self._resolve_tool_context()
        start = start_date or date.today()
        end = end_date or start
        try:
            entries = await list_time_off_entries(
                db, user_id=context.user_id, start_date=start, end_date=end
            )
            payload_entries = [
                TimeOffEntryRead.model_validate(entry, from_attributes=True).model_dump(mode="json")
                for entry in entries
            ]

            by_type = Counter(entry["entry_type"] for entry in payload_entries)
            by_kind = Counter(entry["entry_kind"] for entry in payload_entries)

            return {
                "user_id": context.user_id,
                "start_date": _to_iso_date(start),
                "end_date": _to_iso_date(end),
                "total_entries": len(payload_entries),
                "counts_by_type": dict(by_type),
                "counts_by_kind": dict(by_kind),
                "entries": payload_entries,
            }
        finally:
            await db.close()

    async def get_hday_events(
        self,
        ctx: Context,
        username: str | None = None,
    ) -> dict[str, Any]:
        _ = ctx
        context, db = await self._resolve_tool_context()
        requested_username = username or context.username
        try:
            if not context.is_admin and requested_username != context.username:
                raise McpPermissionError("Not authorized for requested user")

            try:
                raw_content, etag = await asyncio.to_thread(read_hday_file, requested_username)
            except HdayFileNotFoundError:
                return {
                    "username": requested_username,
                    "etag": None,
                    "events": [],
                    "raw": "",
                }

            events = [event.model_dump(mode="json") for event in parse_text(raw_content)]
            return {
                "username": requested_username,
                "etag": etag,
                "events": events,
                "raw": raw_content,
            }
        finally:
            await db.close()

    async def get_work_location_summary(
        self,
        ctx: Context,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> dict[str, Any]:
        _ = ctx
        context, db = await self._resolve_tool_context()
        start = start_date or date.today()
        end = end_date or start
        try:
            locations = await list_work_locations(db, user_id=context.user_id, start_date=start, end_date=end)
            payload_locations = [
                WorkLocationRead.model_validate(location, from_attributes=True).model_dump(mode="json")
                for location in locations
            ]
            by_country = Counter(location["country_code"] for location in payload_locations)

            return {
                "user_id": context.user_id,
                "start_date": _to_iso_date(start),
                "end_date": _to_iso_date(end),
                "total_days": len(payload_locations),
                "counts_by_country": dict(by_country),
                "locations": payload_locations,
            }
        finally:
            await db.close()

    async def get_time_tracking_summary(
        self,
        ctx: Context,
        start_at: datetime | None = None,
        end_at: datetime | None = None,
    ) -> dict[str, Any]:
        _ = ctx
        context, db = await self._resolve_tool_context()
        now_utc = datetime.now(UTC)
        try:
            tasks = await list_tasks(
                db,
                user_id=context.user_id,
                start_date=start_at,
                end_date=end_at,
            )
            payload_tasks = [TaskRead.model_validate(task, from_attributes=True).model_dump(mode="json") for task in tasks]
            total_seconds = 0
            for task in tasks:
                start = task.start_time
                if start.tzinfo is None:
                    start = start.replace(tzinfo=UTC)
                stop = task.stop_time or now_utc
                if stop.tzinfo is None:
                    stop = stop.replace(tzinfo=UTC)
                total_seconds += max(0, int((stop.astimezone(UTC) - start.astimezone(UTC)).total_seconds()))

            running = await get_running_task(db, context.user_id)
            running_payload = (
                TaskRead.model_validate(running, from_attributes=True).model_dump(mode="json")
                if running is not None
                else None
            )

            return {
                "user_id": context.user_id,
                "start_at": _to_iso_datetime(start_at) if start_at else None,
                "end_at": _to_iso_datetime(end_at) if end_at else None,
                "task_count": len(payload_tasks),
                "tracked_seconds": total_seconds,
                "running_task": running_payload,
                "tasks": payload_tasks,
            }
        finally:
            await db.close()

    async def get_gantt_tasks(
        self,
        ctx: Context,
        active_on: date | None = None,
        task_id: str | None = None,
    ) -> dict[str, Any]:
        _ = ctx
        context, db = await self._resolve_tool_context()
        try:
            if task_id:
                task = await get_gantt_task(db, context.user_id, task_id)
                payload_tasks = [GanttTaskRead.model_validate(task, from_attributes=True).model_dump(mode="json")]
            else:
                tasks = await list_gantt_tasks(db, user_id=context.user_id)
                payload_tasks = [
                    GanttTaskRead.model_validate(task, from_attributes=True).model_dump(mode="json")
                    for task in tasks
                ]

            if active_on is not None:
                payload_tasks = [
                    task
                    for task in payload_tasks
                    if task["start_date"] <= _to_iso_date(active_on) <= task["end_date"]
                ]

            return {
                "user_id": context.user_id,
                "active_on": _to_iso_date(active_on) if active_on is not None else None,
                "total_tasks": len(payload_tasks),
                "tasks": payload_tasks,
            }
        finally:
            await db.close()

    async def get_sync_status(self, ctx: Context) -> dict[str, Any]:
        _ = ctx
        context, db = await self._resolve_tool_context()
        try:
            payload = await get_sync_status(db, context.user_id)
            return payload.model_dump(mode="json")
        finally:
            await db.close()


def create_mcp_server(
    session_factory: async_sessionmaker[AsyncSession] | None = None,
) -> FastMCP:
    """Create and configure the Worktime FastMCP server."""
    backend = WorktimeMcpBackend(session_factory or get_session_factory())
    server = FastMCP(
        "worktime",
        instructions="Read-only Worktime assistant tools",
        auth=_build_auth_provider(),
    )

    server.tool(name="whoami")(backend.whoami)
    server.tool(name="get_current_status")(backend.get_current_status)
    server.tool(name="get_next_shift")(backend.get_next_shift)
    server.tool(name="get_team_status")(backend.get_team_status)
    server.tool(name="get_time_off_summary")(backend.get_time_off_summary)
    server.tool(name="get_hday_events")(backend.get_hday_events)
    server.tool(name="get_work_location_summary")(backend.get_work_location_summary)
    server.tool(name="get_time_tracking_summary")(backend.get_time_tracking_summary)
    server.tool(name="get_gantt_tasks")(backend.get_gantt_tasks)
    server.tool(name="get_sync_status")(backend.get_sync_status)
    return server


async def _run_stdio() -> None:
    server = create_mcp_server()
    await server.run_stdio_async()


def main() -> None:
    """Run the Worktime MCP server over stdio."""
    asyncio.run(_run_stdio())


if __name__ == "__main__":
    main()
