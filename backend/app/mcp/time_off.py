"""Time-off domain: summary and personal write tools."""

from __future__ import annotations

from collections import Counter
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import logger as audit
from app.mcp.context import WorktimeMcpContext, actor_from_context
from app.schemas import EntryFlag, EntryKind, EntryType, TimeOffEntryCreate, TimeOffEntryRead, TimeOffEntryUpdate
from app.services.db_service import (
    create_or_update_time_off_entry,
    delete_time_off_entry,
    get_time_off_entry,
    list_time_off_entries,
    update_time_off_entry,
)


async def get_time_off_summary(
    context: WorktimeMcpContext,
    db: AsyncSession,
    start_date: date | None = None,
    end_date: date | None = None,
) -> dict[str, Any]:
    start = start_date or datetime.now(UTC).date()
    end = end_date or start
    entries = await list_time_off_entries(db, user_id=context.user_id, start_date=start, end_date=end)
    payload_entries = [
        TimeOffEntryRead.model_validate(entry, from_attributes=True).model_dump(mode="json") for entry in entries
    ]

    by_type = Counter(entry["entry_type"] for entry in payload_entries)
    by_kind = Counter(entry["entry_kind"] for entry in payload_entries)

    return {
        "user_id": context.user_id,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "total_entries": len(payload_entries),
        "counts_by_type": dict(by_type),
        "counts_by_kind": dict(by_kind),
        "entries": payload_entries,
    }


async def create_time_off_event(
    context: WorktimeMcpContext,
    db: AsyncSession,
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

    Side effects: inserts or updates a TimeOffEntry row. If entry_id is
    provided the call is idempotent — re-sending the same payload restores a
    previously deleted entry. Returns the created or updated entry.
    """
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
    entry, created = await create_or_update_time_off_entry(
        db, context.user_id, payload, actor=actor_from_context(context)
    )
    action = "create_time_off_event" if created else "upsert_time_off_event"
    audit.append(
        target=f"user:{context.user_id}:time_off:{entry.entry_id}",
        action=action,
        details="via MCP",
    )
    return TimeOffEntryRead.model_validate(entry, from_attributes=True).model_dump(mode="json")


async def update_time_off_event(
    context: WorktimeMcpContext,
    db: AsyncSession,
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

    Side effects: updates the specified TimeOffEntry row. The entry must
    belong to the authenticated user. Returns the updated entry.
    """
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
    entry = await update_time_off_entry(db, context.user_id, entry_id, payload, actor=actor_from_context(context))
    audit.append(
        target=f"user:{context.user_id}:time_off:{entry_id}",
        action="update_time_off_event",
        details="via MCP",
    )
    return TimeOffEntryRead.model_validate(entry, from_attributes=True).model_dump(mode="json")


async def delete_time_off_event(context: WorktimeMcpContext, db: AsyncSession, entry_id: str) -> dict[str, Any]:
    """Soft-delete a personal time-off event.

    Side effects: sets deleted_at on the TimeOffEntry row so the deletion
    propagates through the sync layer. The entry must belong to the
    authenticated user. Returns a confirmation payload.
    """
    # Verify ownership before deleting
    await get_time_off_entry(db, context.user_id, entry_id)
    await delete_time_off_entry(db, context.user_id, entry_id, actor=actor_from_context(context))
    audit.append(
        target=f"user:{context.user_id}:time_off:{entry_id}",
        action="delete_time_off_event",
        details="via MCP",
    )
    return {"deleted": True, "entry_id": entry_id, "user_id": context.user_id}
