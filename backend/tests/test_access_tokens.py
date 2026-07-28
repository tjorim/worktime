"""Tests for personal access tokens (used by the Pebble companion app)."""

from __future__ import annotations

from collections.abc import Callable

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.routers.auth import PEBBLE_READ_SCOPE, AuthType, get_bearer_principal
from app.schemas import AccessTokenCreate, UserCreate
from app.services.access_token_service import (
    authenticate_access_token,
    create_access_token,
    revoke_access_token,
)
from app.services.db_service import NotFoundError, create_user


def _fake_request() -> Request:
    return Request(scope={"type": "http", "headers": []})


async def test_service_create_authenticate_and_revoke_round_trip(db_session: AsyncSession) -> None:
    user = await create_user(db_session, UserCreate(username="pat-owner", display_name="Pat Owner"))

    token, raw_token = await create_access_token(db_session, user_id=user.id, payload=AccessTokenCreate(name="Pebble"))
    assert raw_token.startswith("wtpat_")
    assert token.token_preview == raw_token[-4:]
    assert token.last_used_at is None

    authenticated = await authenticate_access_token(db_session, raw_token)
    assert authenticated is not None
    assert authenticated.id == token.id
    assert authenticated.last_used_at is not None

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
    body = created.json()
    assert body["token"].startswith("wtpat_")
    assert body["name"] == "Pebble"
    token_id = body["id"]

    listed = db_client.get("/api/access-tokens", headers=headers)
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    listed_item = listed.json()["items"][0]
    assert listed_item["id"] == token_id
    assert "token" not in listed_item
    assert listed_item["token_preview"] == body["token"][-4:]

    revoked = db_client.delete(f"/api/access-tokens/{token_id}", headers=headers)
    assert revoked.status_code == 204

    revoked_again = db_client.delete(f"/api/access-tokens/{token_id}", headers=headers)
    assert revoked_again.status_code == 404


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
