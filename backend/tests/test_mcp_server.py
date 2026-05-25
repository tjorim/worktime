"""Tests for the Worktime FastMCP server wrapper."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest
from fastmcp.server.auth import AccessToken
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.mcp_server import (
    McpAuthError,
    McpPermissionError,
    WorktimeMcpBackend,
    create_mcp_server,
)
from app.schemas import TaskCreate, UserCreate
from app.services import db_service
from app.services.team_service import TeamNotFoundError


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
        "get_team_status",
        "get_time_off_summary",
        "get_hday_events",
        "get_work_location_summary",
        "get_time_tracking_summary",
        "get_gantt_tasks",
        "get_sync_status",
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


async def test_get_team_status_unauthorized_for_non_member(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)
    async with session_factory() as session:
        user = await db_service.create_user(session, UserCreate(username="solo-user", display_name="Solo User"))

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(user.id))
    monkeypatch.setattr(
        "app.mcp_server.read_team_info_with_sections",
        lambda team_id: (
            "Example Team",
            [],
            [type("Member", (), {"username": "other-user", "display_name": "Other"})()],
        ),
    )
    monkeypatch.setattr("app.mcp_server.read_team_hday_files", lambda members, parse_events: [])

    with pytest.raises(McpPermissionError, match="Not authorized for team data"):
        await backend.get_team_status(ctx=None, team_id="team-a")  # type: ignore[arg-type]


async def test_get_team_status_missing_team_bubbles_up(
    test_db: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session_factory = _make_factory(test_db)
    backend = WorktimeMcpBackend(session_factory)
    async with session_factory() as session:
        user = await db_service.create_user(session, UserCreate(username="team-user", display_name="Team User"))

    monkeypatch.setattr("app.mcp_server.get_access_token", lambda: _token_for_user(user.id, is_admin=True))

    def _raise_missing(_: str) -> tuple[str, list[Any], list[Any]]:
        raise TeamNotFoundError("team missing")

    monkeypatch.setattr("app.mcp_server.read_team_info_with_sections", _raise_missing)

    with pytest.raises(TeamNotFoundError, match="team missing"):
        await backend.get_team_status(ctx=None, team_id="missing-team")  # type: ignore[arg-type]
