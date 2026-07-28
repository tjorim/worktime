"""Tests for personal access tokens (used by the Pebble companion app)."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.database.models import AccessToken
from app.routers.auth import (
    PEBBLE_READ_SCOPE,
    PEBBLE_WRITE_SCOPE,
    AuthType,
    get_bearer_principal,
    has_required_scopes,
)
from app.schemas import AccessTokenCreate, UserCreate
from app.services.access_token_service import (
    authenticate_access_token,
    create_access_token,
    revoke_access_token,
    rotate_pebble_access_token,
)
from app.services.db_service import NotFoundError, create_user


def _fake_request() -> Request:
    return Request(scope={"type": "http", "headers": []})


async def test_authentication_throttles_recent_activity_write() -> None:
    token = SimpleNamespace(last_used_at=datetime.now(UTC))
    result = MagicMock()
    result.scalar_one_or_none.return_value = token
    session = MagicMock()
    session.execute = AsyncMock(return_value=result)
    session.commit = AsyncMock()

    authenticated = await authenticate_access_token(session, "wtpat_token")

    assert authenticated is token
    session.commit.assert_not_awaited()


async def test_service_create_authenticate_and_revoke_round_trip(db_session: AsyncSession) -> None:
    user = await create_user(db_session, UserCreate(username="pat-owner", display_name="Pat Owner"))

    token, raw_token = await create_access_token(db_session, user_id=user.id, payload=AccessTokenCreate(name="Pebble"))
    assert raw_token.startswith("wtpat_")
    assert token.token_preview == raw_token[-4:]
    assert token.scopes == [PEBBLE_READ_SCOPE]
    assert token.last_used_at is None

    authenticated = await authenticate_access_token(db_session, raw_token)
    assert authenticated is not None
    assert authenticated.id == token.id
    assert authenticated.last_used_at is not None
    first_used_at = authenticated.last_used_at

    authenticated_again = await authenticate_access_token(db_session, raw_token)
    assert authenticated_again is not None
    assert authenticated_again.last_used_at == first_used_at

    assert await authenticate_access_token(db_session, "wtpat_not-a-real-token") is None

    await revoke_access_token(db_session, user_id=user.id, token_id=token.id)
    assert await authenticate_access_token(db_session, raw_token) is None


async def test_service_revoke_rejects_other_users_token(db_session: AsyncSession) -> None:
    owner = await create_user(db_session, UserCreate(username="pat-owner-2", display_name="Owner"))
    other = await create_user(db_session, UserCreate(username="pat-other-2", display_name="Other"))

    token, _raw_token = await create_access_token(
        db_session, user_id=owner.id, payload=AccessTokenCreate(name="Pebble")
    )
    with pytest.raises(NotFoundError):
        await revoke_access_token(db_session, user_id=other.id, token_id=token.id)


async def test_rotate_pebble_access_token_replaces_previous_pairing(
    db_session: AsyncSession,
) -> None:
    user = await create_user(
        db_session,
        UserCreate(username="pebble-pair-owner", display_name="Pebble Pair Owner"),
    )

    first, first_raw = await rotate_pebble_access_token(db_session, user.id)
    second, second_raw = await rotate_pebble_access_token(db_session, user.id)

    assert second_raw != first_raw
    assert second.scopes == [PEBBLE_READ_SCOPE, PEBBLE_WRITE_SCOPE]
    assert await authenticate_access_token(db_session, first_raw) is None
    assert await authenticate_access_token(db_session, second_raw) is not None

    tokens = await db_session.execute(
        select(AccessToken).where(
            AccessToken.user_id == user.id,
            AccessToken.name == "Pebble watch",
        )
    )
    assert [token.id for token in tokens.scalars()] == [second.id]
    assert first.id != second.id


async def test_get_bearer_principal_accepts_scoped_delegated_token(db_session: AsyncSession) -> None:
    user = await create_user(db_session, UserCreate(username="pat-http-user", display_name="Pat User"))
    _token, raw_token = await create_access_token(db_session, user_id=user.id, payload=AccessTokenCreate(name="Pebble"))
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=raw_token)

    principal = await get_bearer_principal(request=_fake_request(), credentials=credentials, session=db_session)

    assert principal.user_id == user.id
    assert principal.is_admin is False
    assert principal.auth_type == AuthType.DELEGATED
    assert principal.client_id == "pebble"
    assert principal.scopes == frozenset({PEBBLE_READ_SCOPE})


async def test_get_bearer_principal_uses_persisted_token_scopes(
    db_session: AsyncSession,
) -> None:
    user = await create_user(
        db_session,
        UserCreate(username="pat-scoped-user", display_name="Scoped User"),
    )
    _token, raw_token = await create_access_token(
        db_session,
        user_id=user.id,
        payload=AccessTokenCreate(
            name="Pebble",
            scopes=[PEBBLE_READ_SCOPE, PEBBLE_WRITE_SCOPE],
        ),
    )

    principal = await get_bearer_principal(
        request=_fake_request(),
        credentials=HTTPAuthorizationCredentials(scheme="Bearer", credentials=raw_token),
        session=db_session,
    )

    assert principal.scopes == frozenset({PEBBLE_READ_SCOPE, PEBBLE_WRITE_SCOPE})


def test_scope_helper_supports_namespace_wildcards() -> None:
    assert has_required_scopes(
        frozenset({"pebble:*"}),
        frozenset({PEBBLE_READ_SCOPE, PEBBLE_WRITE_SCOPE}),
    )
    assert not has_required_scopes(
        frozenset({PEBBLE_READ_SCOPE}),
        frozenset({PEBBLE_WRITE_SCOPE}),
    )


async def test_get_bearer_principal_rejects_unknown_pat(db_session: AsyncSession) -> None:
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="wtpat_does-not-exist")

    with pytest.raises(HTTPException) as exc_info:
        await get_bearer_principal(request=_fake_request(), credentials=credentials, session=db_session)

    assert exc_info.value.status_code == 401


async def test_user_rest_auth_rejects_keycloak_service_account(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _decode(_token: str) -> dict[str, object]:
        return {
            "sub": "service-subject",
            "preferred_username": "service-account-worktime-mcp",
            "azp": "worktime-mcp",
        }

    monkeypatch.setattr("app.routers.auth.decode_token", _decode)

    with pytest.raises(HTTPException) as exc_info:
        await get_bearer_principal(
            request=_fake_request(),
            credentials=HTTPAuthorizationCredentials(
                scheme="Bearer",
                credentials="service-token",
            ),
            session=db_session,
        )

    assert exc_info.value.status_code == 403


def test_access_token_lifecycle_over_http(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)
    owner_id = create_user_factory(db_client, admin_headers, "pat-lifecycle-owner")
    headers = auth_headers(owner_id)

    created = db_client.post("/api/access-tokens", json={"name": "Pebble"}, headers=headers)
    assert created.status_code == 201, created.text
    assert created.headers["cache-control"] == "no-store"
    body = created.json()
    assert body["token"].startswith("wtpat_")
    assert body["name"] == "Pebble"
    assert body["scopes"] == [PEBBLE_READ_SCOPE]
    token_id = body["id"]

    listed = db_client.get("/api/access-tokens", headers=headers)
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    listed_item = listed.json()["items"][0]
    assert listed_item["id"] == token_id
    assert "token" not in listed_item
    assert listed_item["token_preview"] == body["token"][-4:]
    assert listed_item["scopes"] == [PEBBLE_READ_SCOPE]

    revoked = db_client.delete(f"/api/access-tokens/{token_id}", headers=headers)
    assert revoked.status_code == 204

    revoked_again = db_client.delete(f"/api/access-tokens/{token_id}", headers=headers)
    assert revoked_again.status_code == 404


def test_access_token_endpoint_persists_explicit_pebble_scopes(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)
    owner_id = create_user_factory(db_client, admin_headers, "pat-explicit-scopes")
    headers = auth_headers(owner_id)

    created = db_client.post(
        "/api/access-tokens",
        json={
            "name": "Pebble",
            "scopes": [PEBBLE_READ_SCOPE, PEBBLE_WRITE_SCOPE],
        },
        headers=headers,
    )

    assert created.status_code == 201, created.text
    assert created.json()["scopes"] == [PEBBLE_READ_SCOPE, PEBBLE_WRITE_SCOPE]
    listed = db_client.get("/api/access-tokens", headers=headers)
    assert listed.json()["items"][0]["scopes"] == [
        PEBBLE_READ_SCOPE,
        PEBBLE_WRITE_SCOPE,
    ]


def test_pebble_pairing_endpoint_rotates_scoped_credential(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)
    owner_id = create_user_factory(db_client, admin_headers, "pebble-pair-http")
    headers = auth_headers(owner_id)

    first = db_client.post("/api/access-tokens/pebble", headers=headers)
    second = db_client.post("/api/access-tokens/pebble", headers=headers)

    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    assert first.headers["cache-control"] == "no-store"
    assert second.json()["token"] != first.json()["token"]
    assert second.json()["scopes"] == [PEBBLE_READ_SCOPE, PEBBLE_WRITE_SCOPE]

    listed = db_client.get("/api/access-tokens", headers=headers).json()
    assert listed["total"] == 1
    assert listed["items"][0]["name"] == "Pebble watch"


def test_access_token_endpoint_rejects_empty_or_unknown_scopes(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)
    owner_id = create_user_factory(db_client, admin_headers, "pat-invalid-scopes")
    headers = auth_headers(owner_id)

    empty = db_client.post(
        "/api/access-tokens",
        json={"name": "Empty", "scopes": []},
        headers=headers,
    )
    unknown = db_client.post(
        "/api/access-tokens",
        json={"name": "Unknown", "scopes": ["mcp:*"]},
        headers=headers,
    )

    assert empty.status_code == 422
    assert unknown.status_code == 422


def test_access_token_endpoints_reject_pat_auth(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)
    owner_id = create_user_factory(db_client, admin_headers, "pat-reject-owner")
    pat_headers = auth_headers(owner_id, via_pat=True)

    assert db_client.post("/api/access-tokens", json={"name": "x"}, headers=pat_headers).status_code == 403
    assert db_client.get("/api/access-tokens", headers=pat_headers).status_code == 403
    assert db_client.delete("/api/access-tokens/some-id", headers=pat_headers).status_code == 403


def test_access_token_scoped_to_owner(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)
    owner_id = create_user_factory(db_client, admin_headers, "pat-owner-scope")
    other_id = create_user_factory(db_client, admin_headers, "pat-other-scope")
    owner_headers = auth_headers(owner_id)
    other_headers = auth_headers(other_id)

    created = db_client.post("/api/access-tokens", json={"name": "Pebble"}, headers=owner_headers)
    token_id = created.json()["id"]

    assert db_client.get("/api/access-tokens", headers=other_headers).json()["total"] == 0
    assert db_client.delete(f"/api/access-tokens/{token_id}", headers=other_headers).status_code == 404


def test_delete_account_rejects_pat_auth(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)
    owner_id = create_user_factory(db_client, admin_headers, "pat-delete-account")
    pat_headers = auth_headers(owner_id, via_pat=True)

    assert db_client.delete("/api/me", headers=pat_headers).status_code == 403


def test_legacy_user_delete_rejects_pat_auth(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)
    owner_id = create_user_factory(db_client, admin_headers, "pat-delete-legacy")
    pat_headers = auth_headers(owner_id, via_pat=True)

    assert db_client.delete(f"/api/users/{owner_id}", headers=pat_headers).status_code == 403
    assert db_client.get(f"/api/users/{owner_id}", headers=admin_headers).status_code == 200
