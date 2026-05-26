"""Tests for the Worktime FastMCP server wrapper."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

import pytest
from fastmcp.server.auth import AccessToken
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.mcp_server import (
    McpAuthError,
    WorktimeMcpBackend,
    create_mcp_server,
)
from app.schemas import GanttTaskCreate, TaskCreate, TimeOffEntryCreate, UserCreate
from app.services import db_service


def _token_for_user(user_id: int, *, is_admin: bool = False) -> AccessToken:
    roles = ["admin"] if is_admin else []
    return AccessToken(
        token=f"test-token-{user_id}",
        client_id=f"user-{user_id}",
        scopes=["worktime:mcp"],
        claims={
            "worktime_user_id": user_id,
            "worktime_is_admin": is_admin,
            "sub": f"integration-key:{user_id}",
            "realm_access": {"roles": roles},
        },
    )


def _make_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


async def test_create_mcp_server_registers_expected_tools(test_db: AsyncEngine) -> None:
    server = create_mcp_server(session_factory=_make_factory(test_db))
    tools = await server.list_tools(run_middleware=False)
    tool_names = {tool.name for tool in tools}

    assert tool_names == {
        "whoami",
        "get_current_status",
        "get_next_shift",
        "get_time_off_summary",
        "get_work_location_summary",
        "get_time_tracking_summary",
        "get_gantt_tasks",
        "get_sync_status",
        "start_time_entry",
        "stop_time_entry",
        "create_time_tracking_task",
        "update_time_tracking_task",
        "set_work_location",
        "create_time_off_event",
        "update_time_off_event",
        "delete_time_off_event",
        "create_gantt_task",
        "update_gantt_task",
        "delete_gantt_task",
    }


async def test_whoami_and_time_tracking_summary_happy_path(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)

    async with session_factory() as session:
        user = await db_service.create_user(session, UserCreate(username="mcp-user", display_name="MCP User"))
        await db_service.create_task(
            session,
            user.id,
            TaskCreate(
                text="Task from MCP",
                start_time=datetime(2026, 5, 1, 9, 0, tzinfo=UTC),
                stop_time=datetime(2026, 5, 1, 10, 30, tzinfo=UTC),
                includes_break=False,
            ),
        )

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(user.id))

    whoami_payload = await backend.whoami(ctx=None)  # type: ignore[arg-type]
    summary_payload = await backend.get_time_tracking_summary(ctx=None)  # type: ignore[arg-type]

    assert whoami_payload["user_id"] == user.id
    assert whoami_payload["username"] == "mcp-user"
    assert summary_payload["task_count"] == 1
    assert summary_payload["tracked_seconds"] == 5400
    assert summary_payload["tasks"][0]["text"] == "Task from MCP"


async def test_resolve_context_requires_authenticated_token(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: None)

    async with session_factory() as session:
        with pytest.raises(McpAuthError, match="Authentication required"):
            await backend.resolve_context(session)


async def test_resolve_context_missing_user_raises_not_found(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)
    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(9999))

    async with session_factory() as session:
        with pytest.raises(db_service.NotFoundError, match="user not found"):
            await backend.resolve_context(session)


# ---------------------------------------------------------------------------
# Write tool tests
# ---------------------------------------------------------------------------


async def test_start_and_stop_time_entry(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Any,
) -> None:
    """start_time_entry creates a running task; stop_time_entry closes it."""
    import app.audit.logger as audit_module

    monkeypatch.setattr(audit_module, "AUDIT_LOG_DIR", tmp_path)
    monkeypatch.setattr(audit_module, "AUDIT_LOG_FILE", tmp_path / "audit.log")

    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)

    async with session_factory() as session:
        user = await db_service.create_user(session, UserCreate(username="start-stop", display_name="Start Stop"))

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(user.id))

    start_payload = await backend.start_time_entry(
        ctx=None,  # type: ignore[arg-type]
        text="Working on feature",
        start_time=datetime(2026, 5, 1, 9, 0, tzinfo=UTC),
    )
    assert start_payload["text"] == "Working on feature"
    assert start_payload["stop_time"] is None
    assert start_payload["user_id"] == user.id

    stop_payload = await backend.stop_time_entry(
        ctx=None,  # type: ignore[arg-type]
        stop_time=datetime(2026, 5, 1, 10, 30, tzinfo=UTC),
    )
    assert stop_payload["id"] == start_payload["id"]
    assert stop_payload["stop_time"] is not None


async def test_start_time_entry_blocks_second_running_task(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Any,
) -> None:
    """start_time_entry raises ConflictError when a running task already exists."""
    import app.audit.logger as audit_module

    monkeypatch.setattr(audit_module, "AUDIT_LOG_DIR", tmp_path)
    monkeypatch.setattr(audit_module, "AUDIT_LOG_FILE", tmp_path / "audit.log")

    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)

    async with session_factory() as session:
        user = await db_service.create_user(session, UserCreate(username="conflict-user", display_name="Conflict"))

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(user.id))

    await backend.start_time_entry(
        ctx=None,  # type: ignore[arg-type]
        text="First task",
        start_time=datetime(2026, 5, 1, 9, 0, tzinfo=UTC),
    )

    with pytest.raises(db_service.ConflictError):
        await backend.start_time_entry(
            ctx=None,  # type: ignore[arg-type]
            text="Second task",
            start_time=datetime(2026, 5, 1, 9, 30, tzinfo=UTC),
        )


async def test_stop_time_entry_no_running_task(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Any,
) -> None:
    """stop_time_entry raises NotFoundError when no running task exists."""
    import app.audit.logger as audit_module

    monkeypatch.setattr(audit_module, "AUDIT_LOG_DIR", tmp_path)
    monkeypatch.setattr(audit_module, "AUDIT_LOG_FILE", tmp_path / "audit.log")

    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)

    async with session_factory() as session:
        user = await db_service.create_user(session, UserCreate(username="no-running", display_name="No Running"))

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(user.id))

    with pytest.raises(db_service.NotFoundError, match="no running task"):
        await backend.stop_time_entry(ctx=None)  # type: ignore[arg-type]


async def test_create_time_tracking_task(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Any,
) -> None:
    """create_time_tracking_task creates a completed task and returns it."""
    import app.audit.logger as audit_module

    monkeypatch.setattr(audit_module, "AUDIT_LOG_DIR", tmp_path)
    monkeypatch.setattr(audit_module, "AUDIT_LOG_FILE", tmp_path / "audit.log")

    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)

    async with session_factory() as session:
        user = await db_service.create_user(session, UserCreate(username="create-task", display_name="Create Task"))

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(user.id))

    payload = await backend.create_time_tracking_task(
        ctx=None,  # type: ignore[arg-type]
        text="Completed task",
        start_time=datetime(2026, 5, 1, 9, 0, tzinfo=UTC),
        stop_time=datetime(2026, 5, 1, 11, 0, tzinfo=UTC),
        includes_break=True,
    )

    assert payload["text"] == "Completed task"
    assert payload["includes_break"] is True
    assert payload["stop_time"] is not None
    assert payload["user_id"] == user.id


async def test_update_time_tracking_task(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Any,
) -> None:
    """update_time_tracking_task updates the task and returns the new state."""
    import app.audit.logger as audit_module

    monkeypatch.setattr(audit_module, "AUDIT_LOG_DIR", tmp_path)
    monkeypatch.setattr(audit_module, "AUDIT_LOG_FILE", tmp_path / "audit.log")

    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)

    async with session_factory() as session:
        user = await db_service.create_user(session, UserCreate(username="update-task", display_name="Update Task"))
        task = await db_service.create_task(
            session,
            user.id,
            TaskCreate(
                text="Original text",
                start_time=datetime(2026, 5, 1, 9, 0, tzinfo=UTC),
                stop_time=datetime(2026, 5, 1, 10, 0, tzinfo=UTC),
            ),
        )

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(user.id))

    updated = await backend.update_time_tracking_task(
        ctx=None,  # type: ignore[arg-type]
        task_id=task.id,
        text="Updated text",
    )
    assert updated["text"] == "Updated text"
    assert updated["id"] == task.id


async def test_update_time_tracking_task_unauthorized(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Any,
) -> None:
    """update_time_tracking_task raises NotFoundError for another user's task."""
    import app.audit.logger as audit_module

    monkeypatch.setattr(audit_module, "AUDIT_LOG_DIR", tmp_path)
    monkeypatch.setattr(audit_module, "AUDIT_LOG_FILE", tmp_path / "audit.log")

    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)

    async with session_factory() as session:
        owner = await db_service.create_user(session, UserCreate(username="owner-user", display_name="Owner"))
        attacker = await db_service.create_user(session, UserCreate(username="attacker-user", display_name="Attacker"))
        task = await db_service.create_task(
            session,
            owner.id,
            TaskCreate(
                text="Owner task",
                start_time=datetime(2026, 5, 1, 9, 0, tzinfo=UTC),
                stop_time=datetime(2026, 5, 1, 10, 0, tzinfo=UTC),
            ),
        )

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(attacker.id))

    with pytest.raises(db_service.NotFoundError):
        await backend.update_time_tracking_task(
            ctx=None,  # type: ignore[arg-type]
            task_id=task.id,
            text="Hacked",
        )


async def test_set_work_location(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Any,
) -> None:
    """set_work_location creates a work-location entry and returns it."""
    import app.audit.logger as audit_module

    monkeypatch.setattr(audit_module, "AUDIT_LOG_DIR", tmp_path)
    monkeypatch.setattr(audit_module, "AUDIT_LOG_FILE", tmp_path / "audit.log")

    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)

    async with session_factory() as session:
        user = await db_service.create_user(session, UserCreate(username="loc-user", display_name="Loc User"))

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(user.id))

    payload = await backend.set_work_location(
        ctx=None,  # type: ignore[arg-type]
        value_date=date(2026, 5, 1),
        country_code="BE",
        label="HQ",
    )
    assert payload["country_code"] == "BE"
    assert payload["label"] == "HQ"
    assert payload["user_id"] == user.id

    # Idempotent: calling again overwrites
    payload2 = await backend.set_work_location(
        ctx=None,  # type: ignore[arg-type]
        value_date=date(2026, 5, 1),
        country_code="NL",
    )
    assert payload2["country_code"] == "NL"


async def test_set_work_location_invalid_country(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Any,
) -> None:
    """set_work_location raises ValidationError for invalid country code."""
    import app.audit.logger as audit_module

    monkeypatch.setattr(audit_module, "AUDIT_LOG_DIR", tmp_path)
    monkeypatch.setattr(audit_module, "AUDIT_LOG_FILE", tmp_path / "audit.log")

    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)

    async with session_factory() as session:
        user = await db_service.create_user(session, UserCreate(username="inv-loc-user", display_name="Inv Loc"))

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(user.id))

    with pytest.raises(ValidationError):
        await backend.set_work_location(
            ctx=None,  # type: ignore[arg-type]
            value_date=date(2026, 5, 1),
            country_code="ZZ",
        )


async def test_create_update_delete_time_off_event(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Any,
) -> None:
    """Full lifecycle: create, update, delete a time-off event."""
    import app.audit.logger as audit_module

    monkeypatch.setattr(audit_module, "AUDIT_LOG_DIR", tmp_path)
    monkeypatch.setattr(audit_module, "AUDIT_LOG_FILE", tmp_path / "audit.log")

    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)

    async with session_factory() as session:
        user = await db_service.create_user(session, UserCreate(username="timeoff-user", display_name="Time Off"))

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(user.id))

    created = await backend.create_time_off_event(
        ctx=None,  # type: ignore[arg-type]
        entry_kind="date",
        entry_type="vacation",
        date=date(2026, 8, 1),
        note="Summer holiday",
    )
    assert created["entry_type"] == "vacation"
    assert created["user_id"] == user.id
    entry_id = created["entry_id"]

    updated = await backend.update_time_off_event(
        ctx=None,  # type: ignore[arg-type]
        entry_id=entry_id,
        note="Summer holiday (updated)",
    )
    assert updated["note"] == "Summer holiday (updated)"

    deleted = await backend.delete_time_off_event(
        ctx=None,  # type: ignore[arg-type]
        entry_id=entry_id,
    )
    assert deleted["deleted"] is True
    assert deleted["entry_id"] == entry_id


async def test_create_time_off_event_idempotent_with_entry_id(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Any,
) -> None:
    """create_time_off_event with a fixed entry_id is idempotent (upsert)."""
    import app.audit.logger as audit_module

    monkeypatch.setattr(audit_module, "AUDIT_LOG_DIR", tmp_path)
    monkeypatch.setattr(audit_module, "AUDIT_LOG_FILE", tmp_path / "audit.log")

    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)

    async with session_factory() as session:
        user = await db_service.create_user(
            session, UserCreate(username="idempotent-user", display_name="Idempotent")
        )

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(user.id))

    first = await backend.create_time_off_event(
        ctx=None,  # type: ignore[arg-type]
        entry_kind="date",
        entry_type="vacation",
        date=date(2026, 9, 1),
        entry_id="fixed-entry-id",
    )
    second = await backend.create_time_off_event(
        ctx=None,  # type: ignore[arg-type]
        entry_kind="date",
        entry_type="ill",
        date=date(2026, 9, 1),
        entry_id="fixed-entry-id",
    )
    assert first["entry_id"] == second["entry_id"] == "fixed-entry-id"
    assert second["entry_type"] == "ill"


async def test_delete_time_off_event_unauthorized(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Any,
) -> None:
    """delete_time_off_event raises NotFoundError for another user's entry."""
    import app.audit.logger as audit_module

    monkeypatch.setattr(audit_module, "AUDIT_LOG_DIR", tmp_path)
    monkeypatch.setattr(audit_module, "AUDIT_LOG_FILE", tmp_path / "audit.log")

    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)

    async with session_factory() as session:
        owner = await db_service.create_user(
            session, UserCreate(username="to-owner", display_name="TO Owner")
        )
        attacker = await db_service.create_user(
            session, UserCreate(username="to-attacker", display_name="TO Attacker")
        )
        entry, _ = await db_service.create_or_update_time_off_entry(
            session,
            owner.id,
            TimeOffEntryCreate(entry_kind="date", entry_type="vacation", date=date(2026, 7, 1)),
        )

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(attacker.id))

    with pytest.raises(db_service.NotFoundError):
        await backend.delete_time_off_event(ctx=None, entry_id=entry.entry_id)  # type: ignore[arg-type]


async def test_create_update_delete_gantt_task(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Any,
) -> None:
    """Full lifecycle: create, update, delete a Gantt task."""
    import app.audit.logger as audit_module

    monkeypatch.setattr(audit_module, "AUDIT_LOG_DIR", tmp_path)
    monkeypatch.setattr(audit_module, "AUDIT_LOG_FILE", tmp_path / "audit.log")

    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)

    async with session_factory() as session:
        user = await db_service.create_user(
            session, UserCreate(username="gantt-user", display_name="Gantt User")
        )

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(user.id))

    created = await backend.create_gantt_task(
        ctx=None,  # type: ignore[arg-type]
        name="Sprint 1",
        start_date=date(2026, 6, 1),
        end_date=date(2026, 6, 14),
        progress=0,
    )
    assert created["name"] == "Sprint 1"
    assert created["user_id"] == user.id
    task_id = created["id"]

    updated = await backend.update_gantt_task(
        ctx=None,  # type: ignore[arg-type]
        task_id=task_id,
        progress=50,
        notes="Halfway done",
    )
    assert updated["progress"] == 50
    assert updated["notes"] == "Halfway done"

    deleted = await backend.delete_gantt_task(
        ctx=None,  # type: ignore[arg-type]
        task_id=task_id,
    )
    assert deleted["deleted"] is True
    assert deleted["task_id"] == task_id


async def test_create_gantt_task_invalid_date_range(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Any,
) -> None:
    """create_gantt_task raises an error when end_date < start_date."""
    import app.audit.logger as audit_module

    monkeypatch.setattr(audit_module, "AUDIT_LOG_DIR", tmp_path)
    monkeypatch.setattr(audit_module, "AUDIT_LOG_FILE", tmp_path / "audit.log")

    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)

    async with session_factory() as session:
        user = await db_service.create_user(
            session, UserCreate(username="gantt-invalid", display_name="Gantt Invalid")
        )

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(user.id))

    with pytest.raises(ValidationError):
        await backend.create_gantt_task(
            ctx=None,  # type: ignore[arg-type]
            name="Bad range",
            start_date=date(2026, 6, 14),
            end_date=date(2026, 6, 1),
        )


async def test_delete_gantt_task_unauthorized(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Any,
) -> None:
    """delete_gantt_task raises NotFoundError for another user's task."""
    import app.audit.logger as audit_module

    monkeypatch.setattr(audit_module, "AUDIT_LOG_DIR", tmp_path)
    monkeypatch.setattr(audit_module, "AUDIT_LOG_FILE", tmp_path / "audit.log")

    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)

    async with session_factory() as session:
        owner = await db_service.create_user(
            session, UserCreate(username="gantt-owner", display_name="Gantt Owner")
        )
        attacker = await db_service.create_user(
            session, UserCreate(username="gantt-attacker", display_name="Gantt Attacker")
        )
        gantt = await db_service.create_gantt_task(
            session,
            owner.id,
            GanttTaskCreate(name="Owner task", start_date=date(2026, 6, 1), end_date=date(2026, 6, 14)),
        )

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(attacker.id))

    with pytest.raises(db_service.NotFoundError):
        await backend.delete_gantt_task(ctx=None, task_id=gantt.id)  # type: ignore[arg-type]


async def test_write_tools_produce_audit_log_entries(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Any,
) -> None:
    """Write tools should append entries to the audit log."""
    import json

    import app.audit.logger as audit_module

    audit_file = tmp_path / "audit.log"
    monkeypatch.setattr(audit_module, "AUDIT_LOG_DIR", tmp_path)
    monkeypatch.setattr(audit_module, "AUDIT_LOG_FILE", audit_file)

    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)

    async with session_factory() as session:
        user = await db_service.create_user(
            session, UserCreate(username="audit-user", display_name="Audit User")
        )

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(user.id))

    await backend.set_work_location(
        ctx=None,  # type: ignore[arg-type]
        value_date=date(2026, 5, 1),
        country_code="DE",
    )

    assert audit_file.exists()
    lines = [json.loads(line) for line in audit_file.read_text().splitlines() if line.strip()]
    assert len(lines) >= 1
    entry = lines[-1]
    assert entry["action"] == "set_work_location"
    assert f"user:{user.id}" in entry["target"]
