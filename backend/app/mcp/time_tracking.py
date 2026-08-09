"""Time-tracking domain: summary, labels, and personal task write tools."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import logger as audit
from app.mcp.context import WorktimeMcpContext, actor_from_context
from app.mcp.formatting import to_iso_datetime
from app.schemas import TaskCreate, TaskRead, TaskUpdate
from app.services.db_service import (
    NotFoundError,
    create_task,
    delete_label,
    delete_task,
    get_running_task,
    get_task,
    list_labels_for_user,
    list_tasks,
    update_task,
)

# Default lookback window for get_time_tracking_summary when the caller omits
# both start_at and end_at — bounds the response to a reasonable size instead
# of returning the user's entire tracked-task history into the model's
# context on every unfiltered call.
DEFAULT_SUMMARY_WINDOW = timedelta(days=30)


async def get_time_tracking_summary(
    context: WorktimeMcpContext,
    db: AsyncSession,
    start_at: datetime | None = None,
    end_at: datetime | None = None,
) -> dict[str, Any]:
    """Summarize time-tracking tasks for the authenticated user.

    When both start_at and end_at are omitted, defaults to the trailing
    30 days rather than the user's entire history, so a plain call stays
    bounded. Pass explicit dates for a wider or narrower range.
    """
    now_utc = datetime.now(UTC)
    default_range_applied = start_at is None and end_at is None
    effective_end = end_at or now_utc
    effective_start = start_at or (effective_end - DEFAULT_SUMMARY_WINDOW)

    tasks = await list_tasks(db, user_id=context.user_id, start_date=effective_start, end_date=effective_end)
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
        TaskRead.model_validate(running, from_attributes=True).model_dump(mode="json") if running is not None else None
    )

    return {
        "user_id": context.user_id,
        "start_at": to_iso_datetime(effective_start),
        "end_at": to_iso_datetime(effective_end),
        "default_range_applied": default_range_applied,
        "task_count": len(payload_tasks),
        "tracked_seconds": total_seconds,
        "running_task": running_payload,
        "tasks": payload_tasks,
    }


async def list_labels(context: WorktimeMcpContext, db: AsyncSession) -> dict[str, Any]:
    """List the authenticated user's active time-tracking labels."""
    labels = await list_labels_for_user(db, context.user_id)
    return {"labels": [{"id": label.id, "name": label.name, "color": label.color} for label in labels]}


async def delete_label_tool(context: WorktimeMcpContext, db: AsyncSession, label_id: str) -> dict[str, Any]:
    """Delete a time-tracking label owned by the authenticated user.

    Raises an error if the label is currently referenced by any tasks or
    templates. Returns a confirmation payload on success.
    """
    await delete_label(db, context.user_id, label_id, actor=actor_from_context(context))
    audit.append(
        target=f"user:{context.user_id}:label:{label_id}",
        action="delete_label",
        details="via MCP",
    )
    return {"deleted": True, "label_id": label_id, "user_id": context.user_id}


async def start_time_entry(
    context: WorktimeMcpContext,
    db: AsyncSession,
    text: str,
    start_time: datetime | None = None,
    label_id: str | None = None,
) -> dict[str, Any]:
    """Start a new running time entry for the authenticated user.

    Side effects: creates a new TimeTrackingTask row with no stop_time. Only
    one running task per user is allowed; the call will fail if one already
    exists. Returns the created task resource.
    """
    effective_start = start_time or datetime.now(UTC)
    payload = TaskCreate(
        text=text,
        label_id=label_id,
        start_time=effective_start,
        stop_time=None,
        includes_break=False,
    )
    task = await create_task(db, context.user_id, payload, actor=actor_from_context(context))
    audit.append(
        target=f"user:{context.user_id}:task:{task.id}",
        action="start_time_entry",
        details="via MCP",
    )
    return TaskRead.model_validate(task, from_attributes=True).model_dump(mode="json")


async def stop_time_entry(
    context: WorktimeMcpContext,
    db: AsyncSession,
    stop_time: datetime | None = None,
) -> dict[str, Any]:
    """Stop the currently running time entry for the authenticated user.

    Side effects: sets stop_time on the active (open) task. Returns the
    updated task resource, or raises NotFoundError when no running task
    exists.
    """
    running = await get_running_task(db, context.user_id)
    if running is None:
        raise NotFoundError("no running task found")
    effective_stop = stop_time or datetime.now(UTC)
    payload = TaskUpdate(stop_time=effective_stop)
    task = await update_task(db, context.user_id, running.id, payload, actor=actor_from_context(context))
    audit.append(
        target=f"user:{context.user_id}:task:{task.id}",
        action="stop_time_entry",
        details=f"stop_time={to_iso_datetime(effective_stop)!r} via MCP",
    )
    return TaskRead.model_validate(task, from_attributes=True).model_dump(mode="json")


async def create_time_tracking_task(
    context: WorktimeMcpContext,
    db: AsyncSession,
    text: str,
    start_time: datetime,
    stop_time: datetime | None = None,
    includes_break: bool = False,
    label_id: str | None = None,
) -> dict[str, Any]:
    """Create a time-tracking task for the authenticated user.

    Side effects: inserts a new TimeTrackingTask row. When stop_time is
    omitted the task is left open (running); only one open task is allowed
    per user. Returns the created task resource.
    """
    payload = TaskCreate(
        text=text,
        label_id=label_id,
        start_time=start_time,
        stop_time=stop_time,
        includes_break=includes_break,
    )
    task = await create_task(db, context.user_id, payload, actor=actor_from_context(context))
    audit.append(
        target=f"user:{context.user_id}:task:{task.id}",
        action="create_time_tracking_task",
        details="via MCP",
    )
    return TaskRead.model_validate(task, from_attributes=True).model_dump(mode="json")


async def update_time_tracking_task(
    context: WorktimeMcpContext,
    db: AsyncSession,
    task_id: str,
    text: str | None = None,
    start_time: datetime | None = None,
    stop_time: datetime | None = None,
    includes_break: bool | None = None,
    label_id: str | None = None,
    clear_stop_time: bool = False,
    clear_label_id: bool = False,
) -> dict[str, Any]:
    """Update a time-tracking task owned by the authenticated user.

    Omit any parameter to leave it unchanged. Set clear_stop_time=True to
    reopen the task (make it running again) instead of passing a stop_time;
    set clear_label_id=True to unlink its label. Both take precedence over
    the corresponding value parameter when true.

    Side effects: updates the specified TimeTrackingTask row. Authorization
    is enforced — the task must belong to the caller. Reopening a task
    (clear_stop_time=True) fails if another task is already running. Returns
    the updated task resource.
    """
    # Verify ownership before updating
    await get_task(db, context.user_id, task_id)
    update_data: dict[str, Any] = {}
    if text is not None:
        update_data["text"] = text
    if clear_label_id:
        update_data["label_id"] = None
    elif label_id is not None:
        update_data["label_id"] = label_id
    if start_time is not None:
        update_data["start_time"] = start_time
    if clear_stop_time:
        update_data["stop_time"] = None
    elif stop_time is not None:
        update_data["stop_time"] = stop_time
    if includes_break is not None:
        update_data["includes_break"] = includes_break

    payload = TaskUpdate(**update_data)
    task = await update_task(db, context.user_id, task_id, payload, actor=actor_from_context(context))
    audit.append(
        target=f"user:{context.user_id}:task:{task_id}",
        action="update_time_tracking_task",
        details="via MCP",
    )
    return TaskRead.model_validate(task, from_attributes=True).model_dump(mode="json")


async def delete_time_tracking_task(context: WorktimeMcpContext, db: AsyncSession, task_id: str) -> dict[str, Any]:
    """Delete a time-tracking task owned by the authenticated user.

    Side effects: soft-deletes the TimeTrackingTask row (sets deleted_at so
    the deletion propagates through the sync layer to other devices; the row
    is not removed). The task must belong to the caller. Returns a
    confirmation payload.
    """
    await delete_task(db, context.user_id, task_id, actor=actor_from_context(context))
    audit.append(
        target=f"user:{context.user_id}:task:{task_id}",
        action="delete_time_tracking_task",
        details="via MCP",
    )
    return {"deleted": True, "task_id": task_id, "user_id": context.user_id}
