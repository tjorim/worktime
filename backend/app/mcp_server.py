"""FastMCP server exposing Worktime tools (read and personal write)."""

from __future__ import annotations

import asyncio
import os
from collections import Counter
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any

from fastmcp import FastMCP
from fastmcp.server.auth import AccessToken, MultiAuth
from fastmcp.server.auth.auth import TokenVerifier
from fastmcp.server.auth.providers.keycloak import KeycloakAuthProvider
from fastmcp.server.dependencies import get_access_token
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.audit import logger as audit
from app.config import settings
from app.database.engine import get_session_factory
from app.routers.auth import AuthenticatedPrincipal
from app.schemas import (
    EntryFlag,
    EntryKind,
    EntryType,
    GanttTaskCreate,
    GanttTaskRead,
    GanttTaskUpdate,
    TaskCreate,
    TaskRead,
    TaskUpdate,
    TimeOffEntryCreate,
    TimeOffEntryRead,
    TimeOffEntryUpdate,
    WorkLocationCreate,
    WorkLocationRead,
)
from app.services.db_service import (
    ConflictError,
    NotFoundError,
    create_gantt_task,
    create_or_update_time_off_entry,
    create_or_update_work_location,
    create_task,
    delete_gantt_task,
    delete_label,
    delete_task,
    delete_time_off_entry,
    delete_work_location,
    get_gantt_task,
    get_running_task,
    get_task,
    get_time_off_entry,
    get_user,
    list_gantt_tasks,
    list_labels_for_user,
    list_tasks,
    list_time_off_entries,
    list_work_locations,
    update_gantt_task,
    update_task,
    update_time_off_entry,
)
from app.services.read_models_service import build_dashboard_read_model, compute_next_shifts_for_team
from app.services.sync_service import get_sync_status


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
    required_scopes = [scope.strip() for scope in required_scopes_env.split(",") if scope.strip()] or ["openid", "offline_access"]
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

    @asynccontextmanager
    async def _tool_context(self) -> AsyncGenerator[tuple[WorktimeMcpContext, AsyncSession], None]:
        db = self.session_factory()
        try:
            context = await self.resolve_context(db)
            yield context, db
        finally:
            await db.close()

    async def whoami(self) -> dict[str, Any]:
        async with self._tool_context() as (context, _db):
            return {
                "user_id": context.user_id,
                "username": context.username,
                "display_name": context.display_name,
                "is_admin": context.is_admin,
                "subject": context.subject,
                "auth_type": context.auth_type,
                "scopes": context.scopes,
            }

    async def get_current_status(self) -> dict[str, Any]:
        today = datetime.now(UTC).date()
        now_utc = datetime.now(UTC)
        async with self._tool_context() as (context, db):
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

    async def get_next_shift(self) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            principal = AuthenticatedPrincipal(user_id=context.user_id, is_admin=context.is_admin)
            dashboard = await build_dashboard_read_model(session=db, principal=principal, next_shift_limit=1)
            as_of = dashboard.next_shifts.as_of
            items = dashboard.next_shifts.items
            if not items:
                return {"as_of": _to_iso_datetime(as_of), "next_shift": None}
            item = items[0]
            return {
                "as_of": _to_iso_datetime(as_of),
                "next_shift": {
                    "team_number": item.team_number,
                    "date": _to_iso_date(item.date),
                    "shift_code": item.shift_code,
                    "shift": item.shift.model_dump(mode="json"),
                },
            }

    async def get_team_status(self) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            principal = AuthenticatedPrincipal(user_id=context.user_id, is_admin=context.is_admin)
            dashboard = await build_dashboard_read_model(session=db, principal=principal, next_shift_limit=1)
            return {
                "as_of": _to_iso_datetime(dashboard.team_status.as_of),
                "schedule_type": dashboard.work_context.schedule_type,
                "items": [
                    {
                        "team_number": item.team_number,
                        "date": _to_iso_date(item.date),
                        "shift_day": _to_iso_date(item.shift_day),
                        "shift_code": item.shift_code,
                        "shift": item.shift.model_dump(mode="json"),
                        "is_currently_working": item.is_currently_working,
                    }
                    for item in dashboard.team_status.items
                ],
            }

    async def get_next_shifts_for_team(
        self,
        team_number: int,
        limit: int = 5,
    ) -> dict[str, Any]:
        if limit < 1:
            raise ValueError("limit must be at least 1")
        limit = min(limit, 50)
        async with self._tool_context() as (context, db):
            principal = AuthenticatedPrincipal(user_id=context.user_id, is_admin=context.is_admin)
            dashboard = await build_dashboard_read_model(session=db, principal=principal, next_shift_limit=1)
            schedule_type = dashboard.work_context.schedule_type
            if schedule_type is None:
                return {
                    "as_of": _to_iso_datetime(dashboard.as_of),
                    "schedule_type": None,
                    "team_number": team_number,
                    "items": [],
                }
            items = compute_next_shifts_for_team(
                schedule_type,
                team_number,
                as_of=dashboard.as_of,
                limit=limit,
            )
            return {
                "as_of": _to_iso_datetime(dashboard.as_of),
                "schedule_type": schedule_type,
                "team_number": team_number,
                "items": [
                    {
                        "team_number": item.team_number,
                        "date": _to_iso_date(item.date),
                        "shift_code": item.shift_code,
                        "shift": item.shift.model_dump(mode="json"),
                    }
                    for item in items
                ],
            }

    async def get_time_off_summary(
        self,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> dict[str, Any]:
        start = start_date or datetime.now(UTC).date()
        end = end_date or start
        async with self._tool_context() as (context, db):
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

    async def get_work_location_summary(
        self,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> dict[str, Any]:
        start = start_date or datetime.now(UTC).date()
        end = end_date or start
        async with self._tool_context() as (context, db):
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

    async def get_time_tracking_summary(
        self,
        start_at: datetime | None = None,
        end_at: datetime | None = None,
    ) -> dict[str, Any]:
        now_utc = datetime.now(UTC)
        async with self._tool_context() as (context, db):
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

    async def list_labels(self) -> dict[str, Any]:
        """List the authenticated user's active time-tracking labels."""
        async with self._tool_context() as (context, db):
            labels = await list_labels_for_user(db, context.user_id)
            return {
                "labels": [
                    {
                        "id": label.id,
                        "name": label.name,
                        "color": label.color,
                    }
                    for label in labels
                ]
            }

    async def delete_label(self, label_id: str) -> dict[str, Any]:
        """Delete a time-tracking label owned by the authenticated user.

        Raises an error if the label is currently referenced by any tasks or
        templates.  Returns a confirmation payload on success.
        """
        async with self._tool_context() as (context, db):
            try:
                await delete_label(db, context.user_id, label_id)
            except ConflictError as exc:
                raise ValueError(str(exc)) from exc
            audit.append(
                target=f"user:{context.user_id}:label:{label_id}",
                action="delete_label",
                details="via MCP",
            )
            return {"deleted": True, "label_id": label_id, "user_id": context.user_id}

    async def get_gantt_tasks(
        self,
        active_on: date | None = None,
        task_id: str | None = None,
    ) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
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

    async def get_sync_status(self) -> dict[str, Any]:
        async with self._tool_context() as (context, db):
            payload = await get_sync_status(db, context.user_id)
            return payload.model_dump(mode="json")

    # ------------------------------------------------------------------
    # Personal write tools
    # ------------------------------------------------------------------

    async def start_time_entry(
        self,
        text: str,
        start_time: datetime | None = None,
        label_id: str | None = None,
    ) -> dict[str, Any]:
        """Start a new running time entry for the authenticated user.

        Side effects: creates a new TimeTrackingTask row with no stop_time.
        Only one running task per user is allowed; the call will fail if one
        already exists.  Returns the created task resource.
        """
        async with self._tool_context() as (context, db):
            effective_start = start_time or datetime.now(UTC)
            payload = TaskCreate(
                text=text,
                label_id=label_id,
                start_time=effective_start,
                stop_time=None,
                includes_break=False,
            )
            task = await create_task(db, context.user_id, payload)
            audit.append(
                target=f"user:{context.user_id}:task:{task.id}",
                action="start_time_entry",
                details=f"text={text!r} via MCP",
            )
            return TaskRead.model_validate(task, from_attributes=True).model_dump(mode="json")

    async def stop_time_entry(
        self,
        stop_time: datetime | None = None,
    ) -> dict[str, Any]:
        """Stop the currently running time entry for the authenticated user.

        Side effects: sets stop_time on the active (open) task.
        Returns the updated task resource, or raises NotFoundError when no
        running task exists.
        """
        async with self._tool_context() as (context, db):
            running = await get_running_task(db, context.user_id)
            if running is None:
                raise NotFoundError("no running task found")
            effective_stop = stop_time or datetime.now(UTC)
            payload = TaskUpdate(stop_time=effective_stop)
            task = await update_task(db, context.user_id, running.id, payload)
            audit.append(
                target=f"user:{context.user_id}:task:{task.id}",
                action="stop_time_entry",
                details=f"stop_time={_to_iso_datetime(effective_stop)!r} via MCP",
            )
            return TaskRead.model_validate(task, from_attributes=True).model_dump(mode="json")

    async def create_time_tracking_task(
        self,
        text: str,
        start_time: datetime,
        stop_time: datetime | None = None,
        includes_break: bool = False,
        label_id: str | None = None,
    ) -> dict[str, Any]:
        """Create a time-tracking task for the authenticated user.

        Side effects: inserts a new TimeTrackingTask row.  When stop_time is
        omitted the task is left open (running); only one open task is allowed
        per user.  Returns the created task resource.
        """
        async with self._tool_context() as (context, db):
            payload = TaskCreate(
                text=text,
                label_id=label_id,
                start_time=start_time,
                stop_time=stop_time,
                includes_break=includes_break,
            )
            task = await create_task(db, context.user_id, payload)
            audit.append(
                target=f"user:{context.user_id}:task:{task.id}",
                action="create_time_tracking_task",
                details=f"text={text!r} via MCP",
            )
            return TaskRead.model_validate(task, from_attributes=True).model_dump(mode="json")

    async def update_time_tracking_task(
        self,
        task_id: str,
        text: str | None = None,
        start_time: datetime | None = None,
        stop_time: datetime | None = None,
        includes_break: bool | None = None,
        label_id: str | None = None,
    ) -> dict[str, Any]:
        """Update a time-tracking task owned by the authenticated user.

        Omit any parameter to leave it unchanged. Tasks always require a label;
        label_id cannot be cleared.

        Side effects: updates the specified TimeTrackingTask row.  Authorization
        is enforced — the task must belong to the caller.  Returns the updated
        task resource.
        """
        async with self._tool_context() as (context, db):
            # Verify ownership before updating
            await get_task(db, context.user_id, task_id)
            update_data: dict[str, Any] = {}
            if text is not None:
                update_data["text"] = text
            if label_id is not None:
                update_data["label_id"] = label_id
            if start_time is not None:
                update_data["start_time"] = start_time
            if stop_time is not None:
                update_data["stop_time"] = stop_time
            if includes_break is not None:
                update_data["includes_break"] = includes_break

            payload = TaskUpdate(**update_data)
            task = await update_task(db, context.user_id, task_id, payload)
            audit.append(
                target=f"user:{context.user_id}:task:{task_id}",
                action="update_time_tracking_task",
                details="via MCP",
            )
            return TaskRead.model_validate(task, from_attributes=True).model_dump(mode="json")

    async def delete_time_tracking_task(
        self,
        task_id: str,
    ) -> dict[str, Any]:
        """Delete a time-tracking task owned by the authenticated user.

        Side effects: removes the TimeTrackingTask row from the database.  The
        task must belong to the caller.  Returns a confirmation payload.
        """
        async with self._tool_context() as (context, db):
            await delete_task(db, context.user_id, task_id)
            audit.append(
                target=f"user:{context.user_id}:task:{task_id}",
                action="delete_time_tracking_task",
                details="via MCP",
            )
            return {"deleted": True, "task_id": task_id, "user_id": context.user_id}

    async def set_work_location(
        self,
        value_date: date,
        country_code: str,
        label: str | None = None,
    ) -> dict[str, Any]:
        """Set (create or replace) the work location for a given date.

        Side effects: upserts a WorkLocation row for (user_id, date).  Returns
        the created or updated work-location resource.
        """
        async with self._tool_context() as (context, db):
            payload = WorkLocationCreate(date=value_date, country_code=country_code, label=label)
            location = await create_or_update_work_location(db, context.user_id, payload)
            audit.append(
                target=f"user:{context.user_id}:work_location:{value_date.isoformat()}",
                action="set_work_location",
                details=f"country_code={country_code!r} via MCP",
            )
            return WorkLocationRead.model_validate(location, from_attributes=True).model_dump(mode="json")

    async def delete_work_location(
        self,
        value_date: date,
    ) -> dict[str, Any]:
        """Delete the work location entry for a given date.

        Side effects: removes the WorkLocation row for (user_id, date).  Returns
        a confirmation payload.
        """
        async with self._tool_context() as (context, db):
            await delete_work_location(db, context.user_id, value_date)
            audit.append(
                target=f"user:{context.user_id}:work_location:{value_date.isoformat()}",
                action="delete_work_location",
                details="via MCP",
            )
            return {"deleted": True, "date": value_date.isoformat(), "user_id": context.user_id}

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
        """Create (or upsert) a personal time-off event.

        Side effects: inserts or updates a TimeOffEntry row.  If entry_id is
        provided the call is idempotent — re-sending the same payload restores
        a previously deleted entry.  Returns the created or updated entry.
        """
        async with self._tool_context() as (context, db):
            payload = TimeOffEntryCreate(
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
            entry, created = await create_or_update_time_off_entry(db, context.user_id, payload)
            action = "create_time_off_event" if created else "upsert_time_off_event"
            audit.append(
                target=f"user:{context.user_id}:time_off:{entry.entry_id}",
                action=action,
                details=f"entry_type={entry_type!r} entry_kind={entry_kind!r} via MCP",
            )
            return TimeOffEntryRead.model_validate(entry, from_attributes=True).model_dump(mode="json")

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
        """Update an existing personal time-off event.

        Side effects: updates the specified TimeOffEntry row.  The entry must
        belong to the authenticated user.  Returns the updated entry.
        """
        async with self._tool_context() as (context, db):
            # Verify ownership before updating
            await get_time_off_entry(db, context.user_id, entry_id)
            update_data: dict[str, Any] = {}
            if entry_kind is not None:
                update_data["entry_kind"] = entry_kind
            if entry_type is not None:
                update_data["entry_type"] = entry_type
            if entry_flag is not None:
                update_data["entry_flag"] = entry_flag
            if date is not None:
                update_data["date"] = date
            if start_date is not None:
                update_data["start_date"] = start_date
            if end_date is not None:
                update_data["end_date"] = end_date
            if weekday is not None:
                update_data["weekday"] = weekday
            if note is not None:
                update_data["note"] = None if note == "" else note

            payload = TimeOffEntryUpdate(**update_data)
            entry = await update_time_off_entry(db, context.user_id, entry_id, payload)
            audit.append(
                target=f"user:{context.user_id}:time_off:{entry_id}",
                action="update_time_off_event",
                details="via MCP",
            )
            return TimeOffEntryRead.model_validate(entry, from_attributes=True).model_dump(mode="json")

    async def delete_time_off_event(
        self,
        entry_id: str,
    ) -> dict[str, Any]:
        """Soft-delete a personal time-off event.

        Side effects: sets deleted_at on the TimeOffEntry row so the deletion
        propagates through the sync layer.  The entry must belong to the
        authenticated user.  Returns a confirmation payload.
        """
        async with self._tool_context() as (context, db):
            # Verify ownership before deleting
            await get_time_off_entry(db, context.user_id, entry_id)
            await delete_time_off_entry(db, context.user_id, entry_id)
            audit.append(
                target=f"user:{context.user_id}:time_off:{entry_id}",
                action="delete_time_off_event",
                details="via MCP",
            )
            return {"deleted": True, "entry_id": entry_id, "user_id": context.user_id}

    async def create_gantt_task(
        self,
        name: str,
        start_date: date,
        end_date: date,
        progress: int = 0,
        dependencies: str | None = None,
        notes: str | None = None,
    ) -> dict[str, Any]:
        """Create a personal Gantt task.

        Side effects: inserts a new GanttTask row.  Returns the created task.
        """
        async with self._tool_context() as (context, db):
            payload = GanttTaskCreate(
                name=name,
                start_date=start_date,
                end_date=end_date,
                progress=progress,
                dependencies=dependencies,
                notes=notes,
            )
            task = await create_gantt_task(db, context.user_id, payload)
            audit.append(
                target=f"user:{context.user_id}:gantt:{task.id}",
                action="create_gantt_task",
                details=f"name={name!r} via MCP",
            )
            return GanttTaskRead.model_validate(task, from_attributes=True).model_dump(mode="json")

    async def update_gantt_task(
        self,
        task_id: str,
        name: str | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
        progress: int | None = None,
        dependencies: str | None = None,
        notes: str | None = None,
    ) -> dict[str, Any]:
        """Update a personal Gantt task.

        Side effects: updates the specified GanttTask row.  The task must
        belong to the authenticated user.  Returns the updated task.
        """
        async with self._tool_context() as (context, db):
            # Verify ownership before updating
            await get_gantt_task(db, context.user_id, task_id)
            update_data: dict[str, Any] = {}
            if name is not None:
                update_data["name"] = name
            if start_date is not None:
                update_data["start_date"] = start_date
            if end_date is not None:
                update_data["end_date"] = end_date
            if progress is not None:
                update_data["progress"] = progress
            if dependencies is not None:
                update_data["dependencies"] = None if dependencies == "" else dependencies
            if notes is not None:
                update_data["notes"] = None if notes == "" else notes

            payload = GanttTaskUpdate(**update_data)
            task = await update_gantt_task(db, context.user_id, task_id, payload)
            audit.append(
                target=f"user:{context.user_id}:gantt:{task_id}",
                action="update_gantt_task",
                details="via MCP",
            )
            return GanttTaskRead.model_validate(task, from_attributes=True).model_dump(mode="json")

    async def delete_gantt_task(
        self,
        task_id: str,
    ) -> dict[str, Any]:
        """Delete a personal Gantt task.

        Side effects: removes the GanttTask row from the database.  The task
        must belong to the authenticated user.  Returns a confirmation payload.
        """
        async with self._tool_context() as (context, db):
            # Verify ownership before deleting
            await get_gantt_task(db, context.user_id, task_id)
            await delete_gantt_task(db, context.user_id, task_id)
            audit.append(
                target=f"user:{context.user_id}:gantt:{task_id}",
                action="delete_gantt_task",
                details="via MCP",
            )
            return {"deleted": True, "task_id": task_id, "user_id": context.user_id}


def create_mcp_server(
    session_factory: async_sessionmaker[AsyncSession] | None = None,
) -> FastMCP:
    """Create and configure the Worktime FastMCP server."""
    backend = WorktimeMcpBackend(session_factory or get_session_factory())
    server = FastMCP(
        "worktime",
        instructions="Worktime assistant tools — read and personal write access",
        auth=_build_auth_provider(),
    )

    server.tool(name="whoami")(backend.whoami)
    server.tool(name="get_current_status")(backend.get_current_status)
    server.tool(name="get_next_shift")(backend.get_next_shift)
    server.tool(name="get_team_status")(backend.get_team_status)
    server.tool(name="get_next_shifts_for_team")(backend.get_next_shifts_for_team)
    server.tool(name="get_time_off_summary")(backend.get_time_off_summary)
    server.tool(name="get_work_location_summary")(backend.get_work_location_summary)
    server.tool(name="get_time_tracking_summary")(backend.get_time_tracking_summary)
    server.tool(name="list_labels")(backend.list_labels)
    server.tool(name="delete_label")(backend.delete_label)
    server.tool(name="get_gantt_tasks")(backend.get_gantt_tasks)
    server.tool(name="get_sync_status")(backend.get_sync_status)
    server.tool(name="start_time_entry")(backend.start_time_entry)
    server.tool(name="stop_time_entry")(backend.stop_time_entry)
    server.tool(name="create_time_tracking_task")(backend.create_time_tracking_task)
    server.tool(name="update_time_tracking_task")(backend.update_time_tracking_task)
    server.tool(name="delete_time_tracking_task")(backend.delete_time_tracking_task)
    server.tool(name="set_work_location")(backend.set_work_location)
    server.tool(name="delete_work_location")(backend.delete_work_location)
    server.tool(name="create_time_off_event")(backend.create_time_off_event)
    server.tool(name="update_time_off_event")(backend.update_time_off_event)
    server.tool(name="delete_time_off_event")(backend.delete_time_off_event)
    server.tool(name="create_gantt_task")(backend.create_gantt_task)
    server.tool(name="update_gantt_task")(backend.update_gantt_task)
    server.tool(name="delete_gantt_task")(backend.delete_gantt_task)
    return server


async def _run_stdio() -> None:
    server = create_mcp_server()
    await server.run_stdio_async()


def main() -> None:
    """Run the Worktime MCP server over stdio."""
    asyncio.run(_run_stdio())


if __name__ == "__main__":
    main()
