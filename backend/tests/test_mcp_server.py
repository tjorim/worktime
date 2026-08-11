"""Tests for the Worktime FastMCP server wrapper."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from fastmcp.server.auth import AccessToken, MultiAuth
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.mcp_server import (
    MCP_TOOL_CAPABILITIES,
    DbIntegrationClientVerifier,
    McpAuthError,
    ToolEffect,
    WorktimeMcpBackend,
    _build_auth_provider,
    create_mcp_server,
    tool_annotations,
)
from app.schemas import GanttTaskCreate, LabelCreate, TaskCreate, TimeOffEntryCreate, UserCreate
from app.services import db_service, integration_client_service


def _token_for_user(user_id: int, *, is_admin: bool = False) -> AccessToken:
    roles = ["admin"] if is_admin else []
    return AccessToken(
        token=f"test-token-{user_id}",
        client_id=f"user-{user_id}",
        scopes=["worktime:mcp"],
        claims={
            "worktime_user_id": user_id,
            "worktime_is_admin": is_admin,
            "sub": f"test-user:{user_id}",
            "realm_access": {"roles": roles},
        },
    )


def _make_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


def test_build_auth_provider_accepts_client_credentials_without_user_scopes(monkeypatch) -> None:
    monkeypatch.setenv("WORKTIME_MCP_BASE_URL", "https://api.example/mcp")
    monkeypatch.setenv("WORKTIME_MCP_KEYCLOAK_REALM_URL", "https://auth.example/realms/worktime")
    monkeypatch.setattr("app.mcp_server.settings.OIDC_AUDIENCE", "worktime")

    with patch("app.mcp_server.KeycloakAuthProvider") as provider:
        auth = _build_auth_provider()

    # Always wrapped in MultiAuth: the DB-backed managed-integration-client
    # verifier runs unconditionally alongside Keycloak.
    assert isinstance(auth, MultiAuth)
    assert auth.server is provider.return_value
    assert len(auth.verifiers) == 1
    assert isinstance(auth.verifiers[0], DbIntegrationClientVerifier)
    provider.assert_called_once_with(
        realm_url="https://auth.example/realms/worktime",
        base_url="https://api.example/mcp",
        required_scopes=[],
        audience="worktime",
    )


async def test_create_mcp_server_registers_expected_tools(test_db: AsyncEngine) -> None:
    server = create_mcp_server(session_factory=_make_factory(test_db))
    tools = await server.local_provider.list_tools()
    tool_names = {tool.name for tool in tools}

    assert tool_names == {
        "whoami",
        "get_current_status",
        "get_next_shift",
        "get_team_status",
        "get_next_shifts_for_team",
        "get_time_off_summary",
        "get_work_location_summary",
        "get_time_tracking_summary",
        "list_labels",
        "delete_label",
        "get_gantt_tasks",
        "get_sync_status",
        "start_time_entry",
        "stop_time_entry",
        "create_time_tracking_task",
        "update_time_tracking_task",
        "delete_time_tracking_task",
        "set_work_location",
        "delete_work_location",
        "create_time_off_event",
        "update_time_off_event",
        "delete_time_off_event",
        "create_gantt_task",
        "update_gantt_task",
        "delete_gantt_task",
    }


async def test_search_transform_replaces_large_initial_catalog() -> None:
    server = create_mcp_server(session_factory=MagicMock())

    assert {tool.name for tool in await server.list_tools()} == {
        "whoami",
        "search_tools",
        "call_tool",
    }


async def test_search_tools_finds_time_summary() -> None:
    server = create_mcp_server(session_factory=MagicMock())
    result = await server.call_tool(
        "search_tools", {"query": "summarize tracked working time"}
    )

    assert result.structured_content is not None
    names = [item["name"] for item in result.structured_content["result"]]
    assert "get_time_tracking_summary" in names


def test_search_serializer_preserves_schema_and_capabilities() -> None:
    from app.mcp_server import _search_serializer

    tool = MagicMock(name="tool")
    tool.name = "get_time_tracking_summary"
    tool.description = "Summarize tracked time"
    tool.parameters = {"type": "object", "properties": {}}
    result = _search_serializer([tool])[0]

    assert result["name"] == tool.name
    assert result["input_schema"] == tool.parameters
    assert result["required_tier"] == "owner"
    assert result["effect"] == "read"


async def test_capability_manifest_cannot_drift_from_registered_tools(test_db: AsyncEngine) -> None:
    """MCP_TOOL_CAPABILITIES is the single source of truth create_mcp_server()
    registers tools from — this asserts that guarantee holds, and also
    that every capability entry has a sane effect/tier."""
    server = create_mcp_server(session_factory=_make_factory(test_db))
    tools = await server.local_provider.list_tools()
    tool_names = {tool.name for tool in tools}

    assert tool_names == set(MCP_TOOL_CAPABILITIES)
    for name, capability in MCP_TOOL_CAPABILITIES.items():
        assert capability.required_tier in ("owner", "admin"), name
        # No tool today accepts a target user id, so none should claim
        # admin_write or an "admin" tier — this is a current-state fact this
        # test pins down so a future admin-scoped tool has to update it
        # deliberately rather than silently mis-tagging itself.
        assert capability.required_tier == "owner", name


async def test_registered_tools_advertise_explicit_safety_annotations() -> None:
    server = create_mcp_server(session_factory=MagicMock())
    tools = await server.local_provider.list_tools()

    for tool in tools:
        annotations = tool.annotations
        capability = MCP_TOOL_CAPABILITIES[tool.name]
        assert annotations is not None
        assert annotations.read_only_hint is (capability.effect is ToolEffect.READ)
        assert annotations.open_world_hint is False
        if capability.effect is ToolEffect.READ:
            assert annotations.destructive_hint is False
            assert annotations.idempotent_hint is True


def test_write_annotations_distinguish_creation_from_destructive_changes() -> None:
    assert tool_annotations("create_gantt_task").destructive_hint is False
    assert tool_annotations("update_gantt_task").destructive_hint is True
    assert tool_annotations("delete_gantt_task").destructive_hint is True
    assert tool_annotations("future_tool_without_policy").destructive_hint is True


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

    whoami_payload = await backend.whoami()
    # Explicit range: the fixed 2026-05-01 task date would fall outside the
    # no-args default 30-day lookback window once "now" (real wall-clock
    # time in CI) moves past it — see test_get_time_tracking_summary_default_window
    # for coverage of that default.
    summary_payload = await backend.get_time_tracking_summary(
        start_at=datetime(2026, 4, 1, tzinfo=UTC),
        end_at=datetime(2026, 6, 1, tzinfo=UTC),
    )

    assert whoami_payload["user_id"] == user.id
    assert whoami_payload["username"] == "mcp-user"
    assert summary_payload["task_count"] == 1
    assert summary_payload["tracked_seconds"] == 5400
    assert summary_payload["tasks"][0]["text"] == "Task from MCP"
    assert summary_payload["default_range_applied"] is False


async def test_get_time_tracking_summary_default_window(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Omitting both start_at and end_at defaults to a trailing 30-day window.

    A task inside the window is included; one 60 days back (well outside
    the 30-day default) is not — bounding the response to a recent slice
    instead of the user's entire history.
    """
    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)
    now = datetime.now(UTC)

    async with session_factory() as session:
        user = await db_service.create_user(
            session, UserCreate(username="default-window-user", display_name="Default Window")
        )
        await db_service.create_task(
            session,
            user.id,
            TaskCreate(
                text="Recent task",
                start_time=now - timedelta(days=1),
                stop_time=now - timedelta(days=1) + timedelta(hours=1),
            ),
        )
        await db_service.create_task(
            session,
            user.id,
            TaskCreate(
                text="Old task",
                start_time=now - timedelta(days=60),
                stop_time=now - timedelta(days=60) + timedelta(hours=1),
            ),
        )

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(user.id))

    summary_payload = await backend.get_time_tracking_summary()

    assert summary_payload["default_range_applied"] is True
    assert summary_payload["task_count"] == 1
    assert summary_payload["tasks"][0]["text"] == "Recent task"


async def test_list_labels_returns_active_labels_for_authenticated_user(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)

    async with session_factory() as session:
        user = await db_service.create_user(session, UserCreate(username="label-user", display_name="Label User"))
        other = await db_service.create_user(session, UserCreate(username="other-label-user", display_name="Other"))
        active = await db_service.create_label(session, user.id, LabelCreate(name="Client", color="#112233"))
        deleted = await db_service.create_label(session, user.id, LabelCreate(name="Deleted", color="#445566"))
        await db_service.create_label(session, other.id, LabelCreate(name="Private", color="#778899"))
        deleted.deleted_at = datetime.now(UTC)
        session.add(deleted)
        await session.commit()

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(user.id))

    payload = await backend.list_labels()

    assert payload == {"labels": [{"id": active.id, "name": "Client", "color": "#112233"}]}


async def test_delete_label_removes_label(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)

    async with session_factory() as session:
        user = await db_service.create_user(session, UserCreate(username="del-label-user", display_name="Del"))
        label = await db_service.create_label(session, user.id, LabelCreate(name="ToDelete", color="#aabbcc"))

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(user.id))

    payload = await backend.delete_label(label_id=label.id)

    assert payload == {"deleted": True, "label_id": label.id, "user_id": user.id}

    async with session_factory() as session:
        labels = await db_service.list_labels_for_user(session, user.id)
    assert not any(lb.id == label.id for lb in labels)


async def test_delete_label_raises_when_label_in_use(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)

    async with session_factory() as session:
        user = await db_service.create_user(session, UserCreate(username="inuse-label-user", display_name="InUse"))
        label = await db_service.create_label(session, user.id, LabelCreate(name="InUse", color="#112233"))
        await db_service.create_task(
            session, user.id, TaskCreate(text="task", label_id=label.id, start_time=datetime.now(UTC))
        )

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(user.id))

    with pytest.raises(ValueError, match="in use"):
        await backend.delete_label(label_id=label.id)


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


async def test_keycloak_service_account_requires_user_protocol_mapper(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)
    token = AccessToken(
        token="service-token",
        client_id="worktime-mcp",
        scopes=["worktime:mcp"],
        claims={
            "sub": "service-subject",
            "preferred_username": "service-account-worktime-mcp",
            "azp": "worktime-mcp",
        },
    )
    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: token)

    async with session_factory() as session:
        with pytest.raises(McpAuthError, match="worktime_user_id protocol mapper"):
            await backend.resolve_context(session)


async def test_keycloak_service_account_uses_mapped_user(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)
    async with session_factory() as session:
        user = await db_service.create_user(
            session,
            UserCreate(username="mapped-service", display_name="Mapped Service"),
        )
    token = AccessToken(
        token="service-token",
        client_id="worktime-mcp",
        scopes=["worktime:mcp"],
        claims={
            "sub": "service-subject",
            "preferred_username": "service-account-worktime-mcp",
            "azp": "worktime-mcp",
            "worktime_user_id": user.id,
        },
    )
    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: token)

    async with session_factory() as session:
        context = await backend.resolve_context(session)

    assert context.user_id == user.id
    assert context.auth_type == "keycloak_service"


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
        text="Working on feature",
        start_time=datetime(2026, 5, 1, 9, 0, tzinfo=UTC),
    )
    assert start_payload["text"] == "Working on feature"
    assert start_payload["stop_time"] is None
    assert start_payload["user_id"] == user.id

    stop_payload = await backend.stop_time_entry(
        stop_time=datetime(2026, 5, 1, 10, 30, tzinfo=UTC),
    )
    assert stop_payload["id"] == start_payload["id"]
    assert stop_payload["stop_time"] is not None


async def test_start_time_entry_blocks_second_running_task(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Any,
) -> None:
    """start_time_entry raises ValueError (mapped from ConflictError) when a running task already exists."""
    import app.audit.logger as audit_module

    monkeypatch.setattr(audit_module, "AUDIT_LOG_DIR", tmp_path)
    monkeypatch.setattr(audit_module, "AUDIT_LOG_FILE", tmp_path / "audit.log")

    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)

    async with session_factory() as session:
        user = await db_service.create_user(session, UserCreate(username="conflict-user", display_name="Conflict"))

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(user.id))

    await backend.start_time_entry(
        text="First task",
        start_time=datetime(2026, 5, 1, 9, 0, tzinfo=UTC),
    )

    with pytest.raises(ValueError, match="only one running task"):
        await backend.start_time_entry(
            text="Second task",
            start_time=datetime(2026, 5, 1, 9, 30, tzinfo=UTC),
        )


async def test_stop_time_entry_no_running_task(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Any,
) -> None:
    """stop_time_entry raises ValueError (mapped from NotFoundError) when no running task exists."""
    import app.audit.logger as audit_module

    monkeypatch.setattr(audit_module, "AUDIT_LOG_DIR", tmp_path)
    monkeypatch.setattr(audit_module, "AUDIT_LOG_FILE", tmp_path / "audit.log")

    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)

    async with session_factory() as session:
        user = await db_service.create_user(session, UserCreate(username="no-running", display_name="No Running"))

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(user.id))

    with pytest.raises(ValueError, match="no running task"):
        await backend.stop_time_entry()


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
    """update_time_tracking_task raises ValueError (mapped from NotFoundError) for another user's task."""
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

    with pytest.raises(ValueError):
        await backend.update_time_tracking_task(
            task_id=task.id,
            text="Hacked",
        )


async def test_create_update_delete_time_tracking_task(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Any,
) -> None:
    """Full lifecycle: create, update, delete a time-tracking task."""
    import app.audit.logger as audit_module

    monkeypatch.setattr(audit_module, "AUDIT_LOG_DIR", tmp_path)
    monkeypatch.setattr(audit_module, "AUDIT_LOG_FILE", tmp_path / "audit.log")

    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)

    async with session_factory() as session:
        user = await db_service.create_user(
            session, UserCreate(username="lifecycle-task", display_name="Lifecycle Task")
        )

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(user.id))

    created = await backend.create_time_tracking_task(
        text="Task to delete",
        start_time=datetime(2026, 5, 1, 9, 0, tzinfo=UTC),
        stop_time=datetime(2026, 5, 1, 10, 0, tzinfo=UTC),
    )
    assert created["text"] == "Task to delete"
    task_id = created["id"]

    updated = await backend.update_time_tracking_task(
        task_id=task_id,
        text="Updated before delete",
    )
    assert updated["text"] == "Updated before delete"

    deleted = await backend.delete_time_tracking_task(
        task_id=task_id,
    )
    assert deleted["deleted"] is True
    assert deleted["task_id"] == task_id
    assert deleted["user_id"] == user.id


async def test_delete_time_tracking_task_unauthorized(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Any,
) -> None:
    """delete_time_tracking_task raises ValueError (mapped from NotFoundError) for another user's task."""
    import app.audit.logger as audit_module

    monkeypatch.setattr(audit_module, "AUDIT_LOG_DIR", tmp_path)
    monkeypatch.setattr(audit_module, "AUDIT_LOG_FILE", tmp_path / "audit.log")

    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)

    async with session_factory() as session:
        owner = await db_service.create_user(session, UserCreate(username="task-owner", display_name="Task Owner"))
        attacker = await db_service.create_user(
            session, UserCreate(username="task-attacker", display_name="Task Attacker")
        )
        task = await db_service.create_task(
            session,
            owner.id,
            TaskCreate(
                text="Owner's task",
                start_time=datetime(2026, 5, 1, 9, 0, tzinfo=UTC),
                stop_time=datetime(2026, 5, 1, 10, 0, tzinfo=UTC),
            ),
        )

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(attacker.id))

    with pytest.raises(ValueError):
        await backend.delete_time_tracking_task(task_id=task.id)


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
        value_date=date(2026, 5, 1),
        country_code="BE",
        label="HQ",
    )
    assert payload["country_code"] == "BE"
    assert payload["label"] == "HQ"
    assert payload["user_id"] == user.id

    # Idempotent: calling again overwrites
    payload2 = await backend.set_work_location(
        value_date=date(2026, 5, 1),
        country_code="NL",
    )
    assert payload2["country_code"] == "NL"


async def test_delete_work_location(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Any,
) -> None:
    """delete_work_location removes the entry and returns a confirmation."""
    import app.audit.logger as audit_module

    monkeypatch.setattr(audit_module, "AUDIT_LOG_DIR", tmp_path)
    monkeypatch.setattr(audit_module, "AUDIT_LOG_FILE", tmp_path / "audit.log")

    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)

    async with session_factory() as session:
        user = await db_service.create_user(session, UserCreate(username="del-loc-user", display_name="Del Loc User"))

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(user.id))

    await backend.set_work_location(
        value_date=date(2026, 5, 1),
        country_code="BE",
    )

    deleted = await backend.delete_work_location(
        value_date=date(2026, 5, 1),
    )
    assert deleted["deleted"] is True
    assert deleted["date"] == "2026-05-01"
    assert deleted["user_id"] == user.id

    with pytest.raises(ValueError):
        await backend.delete_work_location(
            value_date=date(2026, 5, 1),
        )


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
        entry_kind="date",
        entry_type="vacation",
        date=date(2026, 8, 1),
        note="Summer holiday",
    )
    assert created["entry_type"] == "vacation"
    assert created["user_id"] == user.id
    entry_id = created["entry_id"]

    updated = await backend.update_time_off_event(
        entry_id=entry_id,
        note="Summer holiday (updated)",
    )
    assert updated["note"] == "Summer holiday (updated)"

    deleted = await backend.delete_time_off_event(
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
        user = await db_service.create_user(session, UserCreate(username="idempotent-user", display_name="Idempotent"))

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(user.id))

    first = await backend.create_time_off_event(
        entry_kind="date",
        entry_type="vacation",
        date=date(2026, 9, 1),
        entry_id="fixed-entry-id",
    )
    second = await backend.create_time_off_event(
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
    """delete_time_off_event raises ValueError (mapped from NotFoundError) for another user's entry."""
    import app.audit.logger as audit_module

    monkeypatch.setattr(audit_module, "AUDIT_LOG_DIR", tmp_path)
    monkeypatch.setattr(audit_module, "AUDIT_LOG_FILE", tmp_path / "audit.log")

    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)

    async with session_factory() as session:
        owner = await db_service.create_user(session, UserCreate(username="to-owner", display_name="TO Owner"))
        attacker = await db_service.create_user(session, UserCreate(username="to-attacker", display_name="TO Attacker"))
        entry, _ = await db_service.create_or_update_time_off_entry(
            session,
            owner.id,
            TimeOffEntryCreate(entry_kind="date", entry_type="vacation", date=date(2026, 7, 1)),
        )

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(attacker.id))

    with pytest.raises(ValueError):
        await backend.delete_time_off_event(entry_id=entry.entry_id)


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
        user = await db_service.create_user(session, UserCreate(username="gantt-user", display_name="Gantt User"))

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(user.id))

    created = await backend.create_gantt_task(
        name="Sprint 1",
        start_date=date(2026, 6, 1),
        end_date=date(2026, 6, 14),
        progress=0,
    )
    assert created["name"] == "Sprint 1"
    assert created["user_id"] == user.id
    task_id = created["id"]

    updated = await backend.update_gantt_task(
        task_id=task_id,
        progress=50,
        notes="Halfway done",
    )
    assert updated["progress"] == 50
    assert updated["notes"] == "Halfway done"

    deleted = await backend.delete_gantt_task(
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
        user = await db_service.create_user(session, UserCreate(username="gantt-invalid", display_name="Gantt Invalid"))

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(user.id))

    with pytest.raises(ValidationError):
        await backend.create_gantt_task(
            name="Bad range",
            start_date=date(2026, 6, 14),
            end_date=date(2026, 6, 1),
        )


async def test_delete_gantt_task_unauthorized(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Any,
) -> None:
    """delete_gantt_task raises ValueError (mapped from NotFoundError) for another user's task."""
    import app.audit.logger as audit_module

    monkeypatch.setattr(audit_module, "AUDIT_LOG_DIR", tmp_path)
    monkeypatch.setattr(audit_module, "AUDIT_LOG_FILE", tmp_path / "audit.log")

    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)

    async with session_factory() as session:
        owner = await db_service.create_user(session, UserCreate(username="gantt-owner", display_name="Gantt Owner"))
        attacker = await db_service.create_user(
            session, UserCreate(username="gantt-attacker", display_name="Gantt Attacker")
        )
        gantt = await db_service.create_gantt_task(
            session,
            owner.id,
            GanttTaskCreate(name="Owner task", start_date=date(2026, 6, 1), end_date=date(2026, 6, 14)),
        )

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(attacker.id))

    with pytest.raises(ValueError):
        await backend.delete_gantt_task(task_id=gantt.id)


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
        user = await db_service.create_user(session, UserCreate(username="audit-user", display_name="Audit User"))

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(user.id))

    await backend.set_work_location(
        value_date=date(2026, 5, 1),
        country_code="DE",
    )
    # append() dispatches the file write to a background thread when called
    # from a running event loop (which this async test is) — wait for it
    # before asserting on file contents.
    await audit_module.flush()

    assert audit_file.exists()
    lines = [json.loads(line) for line in audit_file.read_text().splitlines() if line.strip()]
    assert len(lines) >= 1
    entry = lines[-1]
    assert entry["action"] == "set_work_location"
    assert f"user:{user.id}" in entry["target"]


async def test_write_tools_produce_transactional_db_audit_entries(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Write tools stage a durable AuditEntry row in the same transaction as
    the mutation (issue #1054) — the authoritative record, distinct from the
    best-effort file logger covered above."""
    from sqlalchemy import select

    from app.database.models import AuditEntry

    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)

    async with session_factory() as session:
        user = await db_service.create_user(session, UserCreate(username="db-audit-user", display_name="DB Audit User"))

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(user.id))

    payload = await backend.set_work_location(value_date=date(2026, 5, 1), country_code="DE")

    async with session_factory() as session:
        result = await session.execute(select(AuditEntry).where(AuditEntry.resource_type == "work_location"))
        entries = list(result.scalars().all())

    assert len(entries) == 1
    entry = entries[0]
    assert entry.action == "create_or_update_work_location"
    assert entry.resource_id == "2026-05-01"
    assert entry.actor_user_id == user.id
    assert entry.auth_source == "oidc"
    assert payload["country_code"] == "DE"


async def test_whoami_includes_integration_client_identity_when_present(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """whoami surfaces the managed integration client's id/name/scopes — never
    raw key material, which the server never has after creation anyway."""
    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)

    async with session_factory() as session:
        user = await db_service.create_user(session, UserCreate(username="ic-whoami-user", display_name="IC Whoami"))

    token = AccessToken(
        token="wtic_sometoken",
        client_id="integration-client-7",
        scopes=["worktime:mcp"],
        claims={
            "worktime_user_id": user.id,
            "worktime_is_admin": False,
            "sub": "integration-client:7",
            "auth_type": "integration_client",
            "worktime_integration_client_id": 7,
            "worktime_integration_client_name": "home-assistant",
            "worktime_integration_client_scopes": ["worktime:mcp"],
            "worktime_integration_client_rate_limit_per_minute": 1000,
        },
    )
    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: token)

    payload = await backend.whoami()

    assert payload["auth_type"] == "integration_client"
    assert payload["integration_client"] == {
        "id": 7,
        "name": "home-assistant",
        "scopes": ["worktime:mcp"],
    }


async def test_whoami_omits_integration_client_for_regular_users(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)

    async with session_factory() as session:
        user = await db_service.create_user(session, UserCreate(username="plain-whoami-user", display_name="Plain"))

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(user.id))

    payload = await backend.whoami()

    assert payload["integration_client"] is None


async def test_db_integration_client_verifier_accepts_active_client(
    test_db: AsyncEngine,
) -> None:
    session_factory = _make_factory(test_db)

    async with session_factory() as session:
        user = await db_service.create_user(session, UserCreate(username="verifier-user", display_name="Verifier"))
        client, raw_key = await integration_client_service.create_integration_client(
            session, user.id, name="test-client"
        )

    verifier = DbIntegrationClientVerifier(session_factory)
    access_token = await verifier.verify_token(raw_key)

    assert access_token is not None
    assert access_token.scopes == [integration_client_service.MCP_SCOPE]
    assert access_token.claims["worktime_user_id"] == user.id
    assert access_token.claims["auth_source"] == "integration"
    assert access_token.claims["integration_client_id"] == client.id
    assert access_token.claims["worktime_integration_client_id"] == client.id
    assert access_token.claims["auth_type"] == "integration_client"
    assert access_token.claims["worktime_is_admin"] is False


async def test_db_integration_client_verifier_requires_mcp_scope(
    test_db: AsyncEngine,
) -> None:
    session_factory = _make_factory(test_db)

    async with session_factory() as session:
        user = await db_service.create_user(
            session, UserCreate(username="admin-only-client", display_name="Admin only")
        )
        _, raw_key = await integration_client_service.create_integration_client(
            session,
            user.id,
            name="admin-without-mcp",
            scopes=[integration_client_service.ADMIN_SCOPE],
        )

    verifier = DbIntegrationClientVerifier(session_factory)

    assert await verifier.verify_token(raw_key) is None


async def test_db_integration_client_verifier_rejects_unknown_and_revoked(
    test_db: AsyncEngine,
) -> None:
    session_factory = _make_factory(test_db)
    verifier = DbIntegrationClientVerifier(session_factory)

    assert await verifier.verify_token("wtic_unknown-key-value") is None
    # Not our prefix at all — must not be confused with an OIDC bearer token.
    assert await verifier.verify_token("some-other-bearer-token") is None

    async with session_factory() as session:
        user = await db_service.create_user(
            session, UserCreate(username="revoked-verifier-user", display_name="Revoked")
        )
        client, raw_key = await integration_client_service.create_integration_client(session, user.id, name="to-revoke")
        await integration_client_service.revoke_integration_client(session, user.id, client.id)

    assert await verifier.verify_token(raw_key) is None
