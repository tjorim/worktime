"""Tests for the transactional mutation audit trail (issue #1054).

Distinct from tests/test_audit.py, which covers the pre-existing (#984)
rotated file logger — that one remains as secondary, best-effort operational
telemetry. This file covers the new authoritative, transactional DB record.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.db import (
    MAX_AUDIT_LIMIT,
    AuditActor,
    AuditAuthorizationError,
    list_audit_entries,
    write_audit_entry,
)
from app.schemas import LabelCreate, TaskCreate, UserCreate
from app.services import db_service
from app.services.db_service import NotFoundError


async def test_write_audit_entry_is_visible_after_caller_commits(db_session: AsyncSession) -> None:
    """write_audit_entry() only stages the row — the caller commits."""
    user = await db_service.create_user(db_session, UserCreate(username="audit-stage", display_name="Stage"))
    actor = AuditActor(user_id=user.id, label="user:1", auth_source="oidc")

    await write_audit_entry(db_session, actor=actor, action="test_action", resource_type="test", resource_id="abc")
    await db_session.commit()

    entries = await list_audit_entries(db_session, requesting_user_id=user.id, is_admin=False)
    assert len(entries) == 1
    assert entries[0].action == "test_action"
    assert entries[0].resource_id == "abc"
    assert entries[0].actor_label == "user:1"


async def test_create_task_with_actor_writes_audit_entry_in_same_transaction(db_session: AsyncSession) -> None:
    user = await db_service.create_user(db_session, UserCreate(username="audit-task", display_name="Task"))
    actor = AuditActor(user_id=user.id, label="user:test", auth_source="keycloak_user")

    task = await db_service.create_task(
        db_session,
        user.id,
        TaskCreate(text="hello", start_time=datetime.now(UTC)),
        actor=actor,
    )

    entries = await list_audit_entries(db_session, requesting_user_id=user.id, is_admin=False)
    assert any(e.action == "create_task" and e.resource_id == task.id for e in entries)


async def test_mutation_without_actor_writes_no_audit_entry(db_session: AsyncSession) -> None:
    """actor defaults to None: existing/test call sites without an actor stay audit-free."""
    user = await db_service.create_user(db_session, UserCreate(username="no-actor", display_name="No Actor"))
    await db_service.create_label(db_session, user.id, LabelCreate(name="NoActorLabel", color="#123456"))

    entries = await list_audit_entries(db_session, requesting_user_id=user.id, is_admin=False)
    assert entries == []


async def test_list_audit_entries_rejects_out_of_range_limit(db_session: AsyncSession) -> None:
    with pytest.raises(ValueError, match="limit must be between"):
        await list_audit_entries(db_session, requesting_user_id=1, is_admin=True, limit=0)
    with pytest.raises(ValueError, match="limit must be between"):
        await list_audit_entries(db_session, requesting_user_id=1, is_admin=True, limit=MAX_AUDIT_LIMIT + 1)


async def test_list_audit_entries_non_admin_cannot_read_another_users_trail(db_session: AsyncSession) -> None:
    owner = await db_service.create_user(db_session, UserCreate(username="audit-owner", display_name="Owner"))
    other = await db_service.create_user(db_session, UserCreate(username="audit-other", display_name="Other"))

    with pytest.raises(AuditAuthorizationError):
        await list_audit_entries(db_session, requesting_user_id=other.id, is_admin=False, target_user_id=owner.id)


async def test_list_audit_entries_non_admin_forced_to_own_trail(db_session: AsyncSession) -> None:
    owner = await db_service.create_user(db_session, UserCreate(username="audit-forced", display_name="Forced"))
    actor = AuditActor(user_id=owner.id, label="user:forced", auth_source="oidc")
    await write_audit_entry(db_session, actor=actor, action="x", resource_type="t", resource_id="1")
    await db_session.commit()

    # target_user_id omitted entirely — non-admin still only sees their own.
    entries = await list_audit_entries(db_session, requesting_user_id=owner.id, is_admin=False)
    assert len(entries) == 1
    assert entries[0].actor_user_id == owner.id


async def test_list_audit_entries_admin_can_read_team_wide_trail(db_session: AsyncSession) -> None:
    alice = await db_service.create_user(db_session, UserCreate(username="audit-alice", display_name="Alice"))
    bob = await db_service.create_user(db_session, UserCreate(username="audit-bob", display_name="Bob"))
    await write_audit_entry(
        db_session,
        actor=AuditActor(user_id=alice.id, label="user:alice", auth_source="oidc"),
        action="a",
        resource_type="t",
        resource_id="1",
    )
    await write_audit_entry(
        db_session,
        actor=AuditActor(user_id=bob.id, label="user:bob", auth_source="oidc"),
        action="b",
        resource_type="t",
        resource_id="2",
    )
    await db_session.commit()

    entries = await list_audit_entries(db_session, requesting_user_id=alice.id, is_admin=True)
    assert {e.actor_user_id for e in entries} == {alice.id, bob.id}


async def test_list_audit_entries_stable_pagination_with_before_id(db_session: AsyncSession) -> None:
    user = await db_service.create_user(db_session, UserCreate(username="audit-page", display_name="Page"))
    for i in range(5):
        await write_audit_entry(
            db_session,
            actor=AuditActor(user_id=user.id, label="user:page", auth_source="oidc"),
            action=f"action-{i}",
            resource_type="t",
            resource_id=str(i),
        )
    await db_session.commit()

    first_page = await list_audit_entries(db_session, requesting_user_id=user.id, is_admin=False, limit=2)
    assert len(first_page) == 2
    second_page = await list_audit_entries(
        db_session, requesting_user_id=user.id, is_admin=False, limit=2, before_id=first_page[-1].id
    )
    assert len(second_page) == 2
    # Descending, non-overlapping, contiguous pages.
    assert first_page[-1].id > second_page[0].id
    assert {e.id for e in first_page}.isdisjoint({e.id for e in second_page})


async def test_delete_label_without_actor_still_raises_expected_domain_errors(db_session: AsyncSession) -> None:
    """Sanity check: adding the optional actor param didn't change existing behavior/signatures."""
    user = await db_service.create_user(db_session, UserCreate(username="audit-sanity", display_name="Sanity"))
    with pytest.raises(NotFoundError):
        await db_service.delete_label(db_session, user.id, "does-not-exist")


async def test_audit_rest_endpoint_scopes_to_own_trail_for_non_admin(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(user_id=1, is_admin=True)
    owner_id = create_user_factory(db_client, admin_headers, "audit-rest-owner")
    other_id = create_user_factory(db_client, admin_headers, "audit-rest-other")
    owner_headers = auth_headers(user_id=owner_id)

    create_response = db_client.post(
        "/api/time-tracking/labels",
        json={"name": "AuditLabel", "color": "#abcdef"},
        headers=owner_headers,
    )
    assert create_response.status_code == 201, create_response.text

    own_trail = db_client.get("/api/audit", headers=owner_headers)
    assert own_trail.status_code == 200
    assert own_trail.json()["total"] >= 1
    assert all(item["actor_user_id"] == owner_id for item in own_trail.json()["items"])

    forbidden = db_client.get(f"/api/audit?user_id={other_id}", headers=owner_headers)
    assert forbidden.status_code == 403


async def test_audit_rest_endpoint_allows_admin_team_wide_read(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(user_id=1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "audit-rest-admin-target")
    user_headers = auth_headers(user_id=user_id)

    create_response = db_client.post(
        "/api/time-tracking/labels",
        json={"name": "AdminVisibleLabel", "color": "#123123"},
        headers=user_headers,
    )
    assert create_response.status_code == 201, create_response.text

    team_wide = db_client.get("/api/audit", headers=admin_headers)
    assert team_wide.status_code == 200
    assert any(item["actor_user_id"] == user_id for item in team_wide.json()["items"])

    scoped = db_client.get(f"/api/audit?user_id={user_id}", headers=admin_headers)
    assert scoped.status_code == 200
    assert all(item["actor_user_id"] == user_id for item in scoped.json()["items"])
