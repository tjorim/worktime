"""Tests for OIDC configuration and auto-provisioning helpers."""

from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from app.config import oidc_config, settings
from app.main import app
from app.routers import auth as auth_routes


def test_derive_username_and_display_name_from_preferred_username() -> None:
    claims = {"preferred_username": "alice", "name": "Alice Smith"}
    username, display_name = oidc_config._derive_username_and_display_name(claims, "sub-123")
    assert username == "alice"
    assert display_name == "Alice Smith"


def _mock_discovery_client(handler):
    """Return a factory producing an httpx client backed by a mock transport."""
    return lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler))


@pytest.mark.asyncio
async def test_resolve_jwks_uri_requires_issuer_without_override(monkeypatch) -> None:
    monkeypatch.setattr(oidc_config.settings, "OIDC_JWKS_URI", "")
    monkeypatch.setattr(oidc_config.settings, "OIDC_ISSUER_URL", "")

    with pytest.raises(oidc_config.OIDCTokenError, match="OIDC_ISSUER_URL is not configured"):
        await oidc_config._resolve_jwks_uri()


def test_resolve_jwks_uri_uses_override_without_issuer(monkeypatch) -> None:
    monkeypatch.setattr(oidc_config.settings, "OIDC_JWKS_URI", "https://auth.example.test/jwks.json")
    monkeypatch.setattr(oidc_config.settings, "OIDC_ISSUER_URL", "")

    assert asyncio.run(oidc_config._resolve_jwks_uri()) == "https://auth.example.test/jwks.json"


@pytest.mark.asyncio
async def test_resolve_jwks_uri_discovers_and_caches(monkeypatch) -> None:
    issuer = "https://auth.example.test/realms/worktime"
    monkeypatch.setattr(oidc_config.settings, "OIDC_JWKS_URI", "")
    monkeypatch.setattr(oidc_config.settings, "OIDC_ISSUER_URL", issuer)
    monkeypatch.setattr(oidc_config, "_jwks_uri_cache", None)
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        assert str(request.url) == f"{issuer}/.well-known/openid-configuration"
        return httpx.Response(
            200,
            content=json.dumps({"jwks_uri": f"{issuer}/protocol/openid-connect/certs"}),
        )

    monkeypatch.setattr(oidc_config, "_http_client", _mock_discovery_client(handler))

    first = await oidc_config._resolve_jwks_uri()
    second = await oidc_config._resolve_jwks_uri()

    assert first == f"{issuer}/protocol/openid-connect/certs"
    assert second == first
    assert calls["n"] == 1


@pytest.mark.asyncio
async def test_resolve_jwks_uri_raises_when_discovery_fails(monkeypatch) -> None:
    issuer = "https://auth.example.test/realms/worktime"
    monkeypatch.setattr(oidc_config.settings, "OIDC_JWKS_URI", "")
    monkeypatch.setattr(oidc_config.settings, "OIDC_ISSUER_URL", issuer)
    monkeypatch.setattr(oidc_config, "_jwks_uri_cache", None)

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    monkeypatch.setattr(oidc_config, "_http_client", _mock_discovery_client(handler))

    with pytest.raises(oidc_config.OIDCTokenError, match="OIDC discovery failed"):
        await oidc_config._resolve_jwks_uri()


@pytest.mark.asyncio
async def test_resolve_jwks_uri_raises_when_document_missing_jwks_uri(monkeypatch) -> None:
    issuer = "https://auth.example.test/realms/worktime"
    monkeypatch.setattr(oidc_config.settings, "OIDC_JWKS_URI", "")
    monkeypatch.setattr(oidc_config.settings, "OIDC_ISSUER_URL", issuer)
    monkeypatch.setattr(oidc_config, "_jwks_uri_cache", None)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=json.dumps({"issuer": issuer}))

    monkeypatch.setattr(oidc_config, "_http_client", _mock_discovery_client(handler))

    with pytest.raises(oidc_config.OIDCTokenError, match="OIDC discovery failed"):
        await oidc_config._resolve_jwks_uri()


@pytest.mark.asyncio
async def test_oidc_config_endpoint_returns_discovered_provider_urls(monkeypatch) -> None:
    issuer = "https://auth.example.test/realms/worktime"
    monkeypatch.setattr(settings, "OIDC_ISSUER_URL", issuer + "/")
    monkeypatch.setattr(auth_routes, "_config_cache", {})

    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == f"{issuer}/.well-known/openid-configuration"
        return httpx.Response(
            200,
            json={
                "issuer": issuer,
                "authorization_endpoint": f"{issuer}/protocol/openid-connect/auth",
                "token_endpoint": f"{issuer}/protocol/openid-connect/token",
            },
        )

    monkeypatch.setattr(auth_routes, "_http_client", _mock_discovery_client(handler))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/auth/oidc-config")

    assert response.status_code == 200
    assert response.json() == {
        "issuer": issuer,
        "authorization_url": f"{issuer}/protocol/openid-connect/auth",
        "token_url": f"{issuer}/protocol/openid-connect/token",
    }


@pytest.mark.asyncio
async def test_oidc_config_endpoint_caches_discovery(monkeypatch) -> None:
    issuer = "https://auth.example.test/application/o/worktime"
    monkeypatch.setattr(settings, "OIDC_ISSUER_URL", issuer)
    monkeypatch.setattr(auth_routes, "_config_cache", {})
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(
            200,
            json={
                "issuer": issuer,
                "authorization_endpoint": f"{issuer}/authorize/",
                "token_endpoint": f"{issuer}/token/",
            },
        )

    monkeypatch.setattr(auth_routes, "_http_client", _mock_discovery_client(handler))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        first = await client.get("/api/auth/oidc-config")
        second = await client.get("/api/auth/oidc-config")

    assert first.status_code == 200
    assert second.json() == first.json()
    assert second.json()["authorization_url"] == f"{issuer}/authorize/"
    assert calls["n"] == 1


@pytest.mark.asyncio
async def test_oidc_config_endpoint_returns_503_when_discovery_fails(monkeypatch) -> None:
    monkeypatch.setattr(settings, "OIDC_ISSUER_URL", "https://auth.example.test/realms/worktime")
    monkeypatch.setattr(auth_routes, "_config_cache", {})

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    monkeypatch.setattr(auth_routes, "_http_client", _mock_discovery_client(handler))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/auth/oidc-config")

    assert response.status_code == 503
    assert response.json()["detail"] == "OIDC discovery failed"


@pytest.mark.asyncio
async def test_oidc_config_endpoint_returns_503_when_document_incomplete(monkeypatch) -> None:
    issuer = "https://auth.example.test/realms/worktime"
    monkeypatch.setattr(settings, "OIDC_ISSUER_URL", issuer)
    monkeypatch.setattr(auth_routes, "_config_cache", {})

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"issuer": issuer})

    monkeypatch.setattr(auth_routes, "_http_client", _mock_discovery_client(handler))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/auth/oidc-config")

    assert response.status_code == 503


@pytest.mark.asyncio
async def test_oidc_config_endpoint_returns_503_when_issuer_unset(monkeypatch) -> None:
    monkeypatch.setattr(settings, "OIDC_ISSUER_URL", "")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/auth/oidc-config")

    assert response.status_code == 503


def test_derive_username_from_email_local_part() -> None:
    claims = {"email": "alice@example.com"}
    username, display_name = oidc_config._derive_username_and_display_name(claims, "sub-123")
    assert username == "alice"
    assert display_name == "alice"


def test_derive_username_falls_back_to_sub_prefix() -> None:
    claims: dict = {}
    username, display_name = oidc_config._derive_username_and_display_name(claims, "abcdefghijkl")
    assert username == "user-abcdefgh"
    assert display_name == "user-abcdefgh"


async def test_get_or_create_local_user_auto_provisions_missing_user(monkeypatch) -> None:
    created_local_user = SimpleNamespace(id=42, username="alice", display_name="Alice")

    class FakeResult:
        def __init__(self, value):
            self._value = value

        def scalar_one_or_none(self):
            return self._value

    class FakeSession:
        def __init__(self):
            self.calls = 0

        async def execute(self, _query):
            self.calls += 1
            if self.calls == 1:
                return FakeResult(None)  # oidc_subject lookup → not found
            return FakeResult(None)  # username uniqueness check → available

    recorded: dict = {}

    async def fake_create_user(session, payload, *, oidc_subject=None):
        recorded["username"] = payload.username
        recorded["display_name"] = payload.display_name
        recorded["oidc_subject"] = oidc_subject
        return created_local_user

    monkeypatch.setattr(oidc_config, "create_user", fake_create_user)

    local_user = await oidc_config.get_or_create_local_user(
        "sub-abc123",
        {"preferred_username": "alice", "name": "Alice"},
        FakeSession(),
    )

    assert local_user is created_local_user
    assert recorded["username"] == "alice"
    assert recorded["display_name"] == "Alice"
    assert recorded["oidc_subject"] == "sub-abc123"


async def test_get_or_create_local_user_returns_existing(monkeypatch) -> None:
    existing_user = SimpleNamespace(id=7, username="bob", display_name="Bob")

    class FakeResult:
        def scalar_one_or_none(self):
            return existing_user

    class FakeSession:
        async def execute(self, _query):
            return FakeResult()

    local_user = await oidc_config.get_or_create_local_user("sub-bob", {}, FakeSession())
    assert local_user is existing_user


async def test_decode_token_expired(monkeypatch) -> None:
    from jwt.exceptions import ExpiredSignatureError

    async def fake_get_jwks(**_):
        return {"keys": []}

    monkeypatch.setattr(oidc_config, "_get_jwks", fake_get_jwks)
    monkeypatch.setattr(oidc_config.jwt, "get_unverified_header", lambda t: {"alg": "RS256", "kid": "k1"})
    monkeypatch.setattr(oidc_config, "_find_signing_key", lambda jwks, kid: SimpleNamespace(key=object()))
    monkeypatch.setattr(oidc_config.jwt, "decode", lambda *a, **kw: (_ for _ in ()).throw(ExpiredSignatureError("expired")))

    with pytest.raises(oidc_config.OIDCTokenError, match="expired"):
        await oidc_config.decode_token("some.token.here")


async def test_decode_token_invalid(monkeypatch) -> None:
    from jwt.exceptions import PyJWTError

    async def fake_get_jwks(**_):
        return {"keys": []}

    monkeypatch.setattr(oidc_config, "_get_jwks", fake_get_jwks)
    monkeypatch.setattr(oidc_config.jwt, "get_unverified_header", lambda t: {"alg": "RS256", "kid": "k1"})
    monkeypatch.setattr(oidc_config, "_find_signing_key", lambda jwks, kid: SimpleNamespace(key=object()))
    monkeypatch.setattr(oidc_config.jwt, "decode", lambda *a, **kw: (_ for _ in ()).throw(PyJWTError("bad token")))

    with pytest.raises(oidc_config.OIDCTokenError, match="Token validation failed"):
        await oidc_config.decode_token("some.token.here")


async def test_decode_token_refreshes_jwks_on_missing_key(monkeypatch) -> None:
    call_count = {"n": 0}
    find_count = {"n": 0}
    expected_claims = {"sub": "user123", "preferred_username": "alice"}

    async def fake_get_jwks(*, force_refresh: bool = False) -> dict:
        call_count["n"] += 1
        return {"keys": []}

    monkeypatch.setattr(oidc_config, "_get_jwks", fake_get_jwks)
    monkeypatch.setattr(oidc_config.jwt, "get_unverified_header", lambda t: {"alg": "RS256", "kid": "k1"})

    def fake_find_key(jwks, kid):
        find_count["n"] += 1
        if find_count["n"] < 2:
            return None  # first attempt: key not in cache yet → triggers refresh
        return SimpleNamespace(key=object())

    monkeypatch.setattr(oidc_config, "_find_signing_key", fake_find_key)
    monkeypatch.setattr(oidc_config.jwt, "decode", lambda *a, **kw: expected_claims)

    result = await oidc_config.decode_token("some.token.here")
    assert result == expected_claims
    assert call_count["n"] == 2


async def test_decode_token_raises_when_key_missing_after_refresh(monkeypatch) -> None:
    async def fake_get_jwks(*, force_refresh: bool = False) -> dict:
        return {"keys": []}

    monkeypatch.setattr(oidc_config, "_get_jwks", fake_get_jwks)
    monkeypatch.setattr(oidc_config.jwt, "get_unverified_header", lambda t: {"alg": "RS256", "kid": "k1"})
    monkeypatch.setattr(oidc_config, "_find_signing_key", lambda jwks, kid: None)

    with pytest.raises(oidc_config.OIDCTokenError, match="Signing key not found in JWKS"):
        await oidc_config.decode_token("some.token.here")


async def test_get_or_create_local_user_appends_suffix_on_username_conflict(monkeypatch) -> None:
    created_local_user = SimpleNamespace(id=43, username="alice-sub-abc1", display_name="Alice")

    class FakeResult:
        def __init__(self, value):
            self._value = value

        def scalar_one_or_none(self):
            return self._value

    class FakeSession:
        def __init__(self):
            self.calls = 0

        async def execute(self, _query):
            self.calls += 1
            if self.calls == 1:
                return FakeResult(None)   # oidc_subject lookup → not found
            if self.calls == 2:
                return FakeResult(object())  # username "alice" already taken
            return FakeResult(None)  # "alice-sub-abc1" is available

    recorded: dict = {}

    async def fake_create_user(session, payload, *, oidc_subject=None):
        recorded["username"] = payload.username
        return created_local_user

    monkeypatch.setattr(oidc_config, "create_user", fake_create_user)

    local_user = await oidc_config.get_or_create_local_user(
        "sub-abc12345",
        {"preferred_username": "alice"},
        FakeSession(),
    )

    assert local_user is created_local_user
    assert recorded["username"].startswith("alice-")
