"""Tests for managed integration clients (issue #1054)."""

from __future__ import annotations

from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas import UserCreate
from app.services import db_service
from app.services.db_service import NotFoundError
from app.services.integration_client_service import (
    ADMIN_SCOPE,
    RateLimitExceededError,
    create_integration_client,
    enforce_integration_client_rate_limit,
    get_active_integration_client_by_key,
    hash_integration_key,
    list_integration_clients_for_user,
    revoke_integration_client,
    rotate_integration_client,
)


async def test_create_integration_client_returns_raw_key_once(db_session: AsyncSession) -> None:
    user = await db_service.create_user(db_session, UserCreate(username="ic-owner", display_name="IC Owner"))

    client, raw_key = await create_integration_client(db_session, user.id, name="home-assistant")

    assert raw_key.startswith("wtic_")
    assert client.key_preview == raw_key[-4:]
    assert client.key_hash == hash_integration_key(raw_key)


async def test_previous_hash_secret_is_upgraded_on_use(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.config import settings
    from app.services import integration_client_service as service

    user = await db_service.create_user(db_session, UserCreate(username="secret-owner", display_name="Secret Owner"))
    raw_key = "wtic_previous_secret_key"
    monkeypatch.setattr(settings, "INTEGRATION_KEY_HASH_SECRET", "current-secret")
    monkeypatch.setattr(settings, "INTEGRATION_KEY_HASH_SECRET_PREVIOUS", "previous-secret")
    client, _ = await create_integration_client(db_session, user.id, name="old-secret")
    client.key_hash = service._hash_integration_key_with_secret(raw_key, "previous-secret")
    await db_session.commit()

    authenticated = await get_active_integration_client_by_key(db_session, raw_key)

    assert authenticated is not None
    assert authenticated.key_hash == hash_integration_key(raw_key)
    assert client.key_hash != raw_key
    assert client.scopes == ["worktime:mcp"]
    assert client.rate_limit_per_minute == 120
    assert client.is_active is True


async def test_create_integration_client_rejects_unknown_scope(db_session: AsyncSession) -> None:
    user = await db_service.create_user(db_session, UserCreate(username="ic-badscope", display_name="Bad Scope"))

    with pytest.raises(ValueError, match="unknown integration-client scope"):
        await create_integration_client(db_session, user.id, name="bad", scopes=["not:a:real:scope"])


async def test_create_integration_client_rejects_out_of_range_rate_limit(db_session: AsyncSession) -> None:
    user = await db_service.create_user(db_session, UserCreate(username="ic-badrate", display_name="Bad Rate"))

    with pytest.raises(ValueError, match="rate_limit_per_minute"):
        await create_integration_client(db_session, user.id, name="bad", rate_limit_per_minute=0)


async def test_rotate_integration_client_invalidates_old_key(db_session: AsyncSession) -> None:
    user = await db_service.create_user(db_session, UserCreate(username="ic-rotate", display_name="Rotate"))
    client, old_key = await create_integration_client(db_session, user.id, name="rotatable")

    rotated_client, new_key = await rotate_integration_client(db_session, user.id, client.id)

    assert rotated_client.id == client.id
    assert new_key != old_key
    assert await get_active_integration_client_by_key(db_session, old_key) is None
    found = await get_active_integration_client_by_key(db_session, new_key)
    assert found is not None
    assert found.id == client.id


async def test_revoke_integration_client_deactivates_it(db_session: AsyncSession) -> None:
    user = await db_service.create_user(db_session, UserCreate(username="ic-revoke", display_name="Revoke"))
    client, raw_key = await create_integration_client(db_session, user.id, name="revokable")

    revoked = await revoke_integration_client(db_session, user.id, client.id)

    assert revoked.is_active is False
    assert revoked.revoked_at is not None
    assert await get_active_integration_client_by_key(db_session, raw_key) is None


async def test_revoke_integration_client_rejects_cross_user_access(db_session: AsyncSession) -> None:
    owner = await db_service.create_user(db_session, UserCreate(username="ic-owner2", display_name="Owner"))
    attacker = await db_service.create_user(db_session, UserCreate(username="ic-attacker", display_name="Attacker"))
    client, _raw_key = await create_integration_client(db_session, owner.id, name="owned")

    with pytest.raises(NotFoundError):
        await revoke_integration_client(db_session, attacker.id, client.id)


async def test_list_integration_clients_scoped_to_owner(db_session: AsyncSession) -> None:
    owner = await db_service.create_user(db_session, UserCreate(username="ic-list-owner", display_name="Owner"))
    other = await db_service.create_user(db_session, UserCreate(username="ic-list-other", display_name="Other"))
    await create_integration_client(db_session, owner.id, name="mine")
    await create_integration_client(db_session, other.id, name="not-mine")

    clients = await list_integration_clients_for_user(db_session, owner.id)

    assert [c.name for c in clients] == ["mine"]


async def test_rate_limit_enforced_per_client_in_database(db_session: AsyncSession) -> None:
    user = await db_service.create_user(db_session, UserCreate(username="rate-owner", display_name="Rate Owner"))
    first, _ = await create_integration_client(db_session, user.id, name="first", rate_limit_per_minute=2)
    second, _ = await create_integration_client(db_session, user.id, name="second", rate_limit_per_minute=1)
    first_id = first.id
    second_id = second.id

    await enforce_integration_client_rate_limit(db_session, first_id)
    await enforce_integration_client_rate_limit(db_session, first_id)

    with pytest.raises(RateLimitExceededError) as exc_info:
        await enforce_integration_client_rate_limit(db_session, first_id)
    assert 0 < exc_info.value.retry_after_seconds <= 60

    await enforce_integration_client_rate_limit(db_session, second_id)


async def test_create_integration_client_endpoint_returns_key_and_hides_it_on_list(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(user_id=1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "ic-rest-user")
    headers = auth_headers(user_id=user_id)

    response = db_client.post(
        "/api/integration-clients",
        json={"name": "home-assistant", "scopes": ["worktime:mcp"]},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["key"].startswith("wtic_")

    list_response = db_client.get("/api/integration-clients", headers=headers)
    assert list_response.status_code == 200
    items = list_response.json()["items"]
    assert len(items) == 1
    assert "key" not in items[0]
    assert items[0]["key_preview"] == body["key"][-4:]


async def test_non_admin_cannot_grant_admin_scope_to_integration_client(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(user_id=1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "ic-nonadmin")
    headers = auth_headers(user_id=user_id, is_admin=False)

    response = db_client.post(
        "/api/integration-clients",
        json={"name": "escalated", "scopes": [ADMIN_SCOPE]},
        headers=headers,
    )

    assert response.status_code == 403


async def test_admin_can_grant_admin_scope_to_integration_client(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(user_id=1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "ic-admin")
    headers = auth_headers(user_id=user_id, is_admin=True)

    response = db_client.post(
        "/api/integration-clients",
        json={"name": "admin-client", "scopes": [ADMIN_SCOPE]},
        headers=headers,
    )

    assert response.status_code == 201, response.text


async def test_personal_access_token_cannot_manage_integration_clients(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    """A PAT session (require_oidc_principal boundary) must not reach these
    management endpoints — the same structural boundary that keeps an MCP
    integration credential from ever minting/escalating another one, since
    neither is an interactive Keycloak session."""
    admin_headers = auth_headers(user_id=1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "ic-pat-user")
    pat_headers = auth_headers(user_id=user_id, via_pat=True)

    response = db_client.post(
        "/api/integration-clients",
        json={"name": "via-pat"},
        headers=pat_headers,
    )

    assert response.status_code == 403


async def test_revoke_and_rotate_integration_client_endpoints(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(user_id=1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "ic-lifecycle")
    headers = auth_headers(user_id=user_id)

    created = db_client.post("/api/integration-clients", json={"name": "lifecycle"}, headers=headers).json()
    client_id = created["id"]

    rotate_response = db_client.post(f"/api/integration-clients/{client_id}/rotate", headers=headers)
    assert rotate_response.status_code == 200
    assert rotate_response.json()["key"] != created["key"]

    revoke_response = db_client.delete(f"/api/integration-clients/{client_id}", headers=headers)
    assert revoke_response.status_code == 204

    missing_response = db_client.delete("/api/integration-clients/999999", headers=headers)
    assert missing_response.status_code == 404
