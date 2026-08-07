"""Schedule domain: current status, next shift, team status, sync status."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.context import WorktimeMcpContext
from app.mcp.formatting import to_iso_date, to_iso_datetime
from app.routers.auth import AuthenticatedPrincipal
from app.schemas import TaskRead, TimeOffEntryRead, WorkLocationRead
from app.services.db_service import get_running_task, list_time_off_entries, list_work_locations
from app.services.read_models_service import (
    build_dashboard_read_model,
    compute_next_shifts_for_team,
    get_schedule_type_for_user,
)
from app.services.sync_service import get_sync_status as get_sync_status_service


async def get_current_status(context: WorktimeMcpContext, db: AsyncSession) -> dict[str, Any]:
    today = datetime.now(UTC).date()
    now_utc = datetime.now(UTC)

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
        work_location = WorkLocationRead.model_validate(today_locations[-1], from_attributes=True).model_dump(
            mode="json"
        )

    time_off_entries = await list_time_off_entries(db, user_id=context.user_id, start_date=today, end_date=today)
    active_time_off = [
        TimeOffEntryRead.model_validate(entry, from_attributes=True).model_dump(mode="json")
        for entry in time_off_entries
    ]

    return {
        "date": to_iso_date(today),
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


async def get_next_shift(context: WorktimeMcpContext, db: AsyncSession) -> dict[str, Any]:
    principal = AuthenticatedPrincipal(user_id=context.user_id, is_admin=context.is_admin)
    dashboard = await build_dashboard_read_model(session=db, principal=principal, next_shift_limit=1)
    as_of = dashboard.next_shifts.as_of
    items = dashboard.next_shifts.items
    if not items:
        return {"as_of": to_iso_datetime(as_of), "next_shift": None}
    item = items[0]
    return {
        "as_of": to_iso_datetime(as_of),
        "next_shift": {
            "team_number": item.team_number,
            "date": to_iso_date(item.date),
            "shift_code": item.shift_code,
            "shift": item.shift.model_dump(mode="json"),
        },
    }


async def get_team_status(context: WorktimeMcpContext, db: AsyncSession) -> dict[str, Any]:
    principal = AuthenticatedPrincipal(user_id=context.user_id, is_admin=context.is_admin)
    dashboard = await build_dashboard_read_model(session=db, principal=principal, next_shift_limit=1)
    return {
        "as_of": to_iso_datetime(dashboard.team_status.as_of),
        "schedule_type": dashboard.work_context.schedule_type,
        "items": [
            {
                "team_number": item.team_number,
                "date": to_iso_date(item.date),
                "shift_day": to_iso_date(item.shift_day),
                "shift_code": item.shift_code,
                "shift": item.shift.model_dump(mode="json"),
                "is_currently_working": item.is_currently_working,
            }
            for item in dashboard.team_status.items
        ],
    }


async def get_next_shifts_for_team(
    context: WorktimeMcpContext,
    db: AsyncSession,
    team_number: int,
    limit: int = 5,
) -> dict[str, Any]:
    if limit < 1:
        raise ValueError("limit must be at least 1")
    limit = min(limit, 50)
    # Only the schedule type is needed here, so use the lightweight lookup
    # instead of build_dashboard_read_model(), which would also fetch the
    # user row, list time-off entries, and compute a team_status entry for
    # every team in the schedule.
    as_of = datetime.now(UTC)
    schedule_type = await get_schedule_type_for_user(db, context.user_id)
    if schedule_type is None:
        return {
            "as_of": to_iso_datetime(as_of),
            "schedule_type": None,
            "team_number": team_number,
            "items": [],
        }
    items = compute_next_shifts_for_team(
        schedule_type,
        team_number,
        as_of=as_of,
        limit=limit,
    )
    return {
        "as_of": to_iso_datetime(as_of),
        "schedule_type": schedule_type,
        "team_number": team_number,
        "items": [
            {
                "team_number": item.team_number,
                "date": to_iso_date(item.date),
                "shift_code": item.shift_code,
                "shift": item.shift.model_dump(mode="json"),
            }
            for item in items
        ],
    }


async def get_sync_status(context: WorktimeMcpContext, db: AsyncSession) -> dict[str, Any]:
    payload = await get_sync_status_service(db, context.user_id)
    return payload.model_dump(mode="json")
