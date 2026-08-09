"""Gantt domain: personal Gantt board reads and write tools."""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import logger as audit
from app.mcp.context import WorktimeMcpContext, actor_from_context
from app.mcp.formatting import to_iso_date
from app.schemas import GanttTaskCreate, GanttTaskRead, GanttTaskUpdate
from app.services.db_service import (
    create_gantt_task as create_gantt_task_service,
)
from app.services.db_service import (
    delete_gantt_task as delete_gantt_task_service,
)
from app.services.db_service import (
    get_gantt_task,
    list_gantt_tasks,
)
from app.services.db_service import (
    update_gantt_task as update_gantt_task_service,
)

# Hard cap on items returned by get_gantt_tasks. Personal Gantt boards are
# typically small (a handful of projects), so this is a defense-in-depth
# bound rather than an expected everyday limit.
MAX_GANTT_TASKS_RETURNED = 200


async def get_gantt_tasks(
    context: WorktimeMcpContext,
    db: AsyncSession,
    active_on: date | None = None,
    task_id: str | None = None,
) -> dict[str, Any]:
    if task_id:
        task = await get_gantt_task(db, context.user_id, task_id)
        payload_tasks = [GanttTaskRead.model_validate(task, from_attributes=True).model_dump(mode="json")]
        total_tasks = 1
        if active_on is not None:
            payload_tasks = [
                task for task in payload_tasks if task["start_date"] <= to_iso_date(active_on) <= task["end_date"]
            ]
            total_tasks = len(payload_tasks)
    else:
        # Bounded, paginated retrieval with DB-side active_on filtering and count
        tasks, total_tasks = await list_gantt_tasks(
            db, user_id=context.user_id, active_on=active_on, limit=MAX_GANTT_TASKS_RETURNED
        )  # type: ignore[assignment]
        payload_tasks = [
            GanttTaskRead.model_validate(task, from_attributes=True).model_dump(mode="json") for task in tasks
        ]

    truncated = total_tasks > MAX_GANTT_TASKS_RETURNED
    payload_tasks = payload_tasks[:MAX_GANTT_TASKS_RETURNED]

    return {
        "user_id": context.user_id,
        "active_on": to_iso_date(active_on) if active_on is not None else None,
        "total_tasks": total_tasks,
        "truncated": truncated,
        "tasks": payload_tasks,
    }


async def create_gantt_task(
    context: WorktimeMcpContext,
    db: AsyncSession,
    name: str,
    start_date: date,
    end_date: date,
    progress: int = 0,
    dependencies: str | None = None,
    notes: str | None = None,
    label_id: str | None = None,
) -> dict[str, Any]:
    """Create a personal Gantt task.

    Side effects: inserts a new GanttTask row. Returns the created task.
    """
    payload = GanttTaskCreate(
        name=name,
        start_date=start_date,
        end_date=end_date,
        progress=progress,
        dependencies=dependencies,
        notes=notes,
        label_id=label_id,
    )
    task = await create_gantt_task_service(db, context.user_id, payload, actor=actor_from_context(context))
    audit.append(
        target=f"user:{context.user_id}:gantt:{task.id}",
        action="create_gantt_task",
        details="via MCP",
    )
    return GanttTaskRead.model_validate(task, from_attributes=True).model_dump(mode="json")


async def update_gantt_task(
    context: WorktimeMcpContext,
    db: AsyncSession,
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
    """Update a personal Gantt task.

    Omit any parameter to leave it unchanged. Set clear_label_id=True to
    unlink its label; this takes precedence over label_id when true.

    Side effects: updates the specified GanttTask row. The task must belong
    to the authenticated user. Returns the updated task.
    """
    # Verify ownership before updating
    await get_gantt_task(db, context.user_id, task_id)
    update_data: dict[str, Any] = {}
    if name is not None:
        update_data["name"] = name
    if clear_label_id:
        update_data["label_id"] = None
    elif label_id is not None:
        update_data["label_id"] = label_id
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
    task = await update_gantt_task_service(db, context.user_id, task_id, payload, actor=actor_from_context(context))
    audit.append(
        target=f"user:{context.user_id}:gantt:{task_id}",
        action="update_gantt_task",
        details="via MCP",
    )
    return GanttTaskRead.model_validate(task, from_attributes=True).model_dump(mode="json")


async def delete_gantt_task(context: WorktimeMcpContext, db: AsyncSession, task_id: str) -> dict[str, Any]:
    """Delete a personal Gantt task.

    Side effects: soft-deletes the GanttTask row (sets deleted_at so the
    deletion propagates through the sync layer to other devices; the row is
    not removed) and unlinks any time-tracking tasks that referenced it. The
    task must belong to the authenticated user. Returns a confirmation
    payload.
    """
    # Verify ownership before deleting
    await get_gantt_task(db, context.user_id, task_id)
    await delete_gantt_task_service(db, context.user_id, task_id, actor=actor_from_context(context))
    audit.append(
        target=f"user:{context.user_id}:gantt:{task_id}",
        action="delete_gantt_task",
        details="via MCP",
    )
    return {"deleted": True, "task_id": task_id, "user_id": context.user_id}
