"""Work-location domain: per-day country summary and personal write tools."""

from __future__ import annotations

from collections import Counter
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import logger as audit
from app.mcp.context import WorktimeMcpContext, actor_from_context
from app.schemas import WorkLocationCreate, WorkLocationRead
from app.services.db_service import create_or_update_work_location, delete_work_location, list_work_locations


async def get_work_location_summary(
    context: WorktimeMcpContext,
    db: AsyncSession,
    start_date: date | None = None,
    end_date: date | None = None,
) -> dict[str, Any]:
    start = start_date or datetime.now(UTC).date()
    end = end_date or start
    locations = await list_work_locations(db, user_id=context.user_id, start_date=start, end_date=end)
    payload_locations = [
        WorkLocationRead.model_validate(location, from_attributes=True).model_dump(mode="json")
        for location in locations
    ]
    by_country = Counter(location["country_code"] for location in payload_locations)

    return {
        "user_id": context.user_id,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "total_days": len(payload_locations),
        "counts_by_country": dict(by_country),
        "locations": payload_locations,
    }


async def set_work_location(
    context: WorktimeMcpContext,
    db: AsyncSession,
    value_date: date,
    country_code: str,
    label: str | None = None,
) -> dict[str, Any]:
    """Set (create or replace) the work location for a given date.

    Side effects: upserts a WorkLocation row for (user_id, date). Returns the
    created or updated work-location resource.
    """
    payload = WorkLocationCreate(date=value_date, country_code=country_code, label=label)
    location = await create_or_update_work_location(db, context.user_id, payload, actor=actor_from_context(context))
    audit.append(
        target=f"user:{context.user_id}:work_location:{value_date.isoformat()}",
        action="set_work_location",
        details="via MCP",
    )
    return WorkLocationRead.model_validate(location, from_attributes=True).model_dump(mode="json")


async def delete_work_location_tool(context: WorktimeMcpContext, db: AsyncSession, value_date: date) -> dict[str, Any]:
    """Delete the work location entry for a given date.

    Side effects: soft-deletes the WorkLocation row for (user_id, date) (sets
    deleted_at so the deletion propagates through the sync layer to other
    devices; the row is not removed). Returns a confirmation payload.
    """
    await delete_work_location(db, context.user_id, value_date, actor=actor_from_context(context))
    audit.append(
        target=f"user:{context.user_id}:work_location:{value_date.isoformat()}",
        action="delete_work_location",
        details="via MCP",
    )
    return {"deleted": True, "date": value_date.isoformat(), "user_id": context.user_id}
