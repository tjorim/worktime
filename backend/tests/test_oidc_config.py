"""Tests for OIDC configuration and auto-provisioning helpers."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.config import oidc_config
from app.config import settings
from app.main import app


def test_derive_username_and_display_name_from_preferred_username() -> None:
    claims = {"preferred_username": "alice", "name": "Alice Smith"}
    username, display_name = oidc_config._derive_username_and_display_name(claims, "sub-123")
    assert username == "alice"
    assert display_name == "Alice Smith"


def test_oidc_config_endpoint_returns_public_provider_urls(monkeypatch) -> None:
    from fastapi.testclient import TestClient

    monkeypatch.setattr(settings, "OIDC_ISSUER_URL", "https://auth.example.test/realms/worktime/")

    response = TestClient(app).get("/api/auth/oidc-config")

    assert response.status_code == 200
    assert response.json() == {
        "issuer": "https://auth.example.test/realms/worktime",
        "authorization_url": "https://auth.example.test/realms/worktime/protocol/openid-connect/auth",
        "token_url": "https://auth.example.test/realms/worktime/protocol/openid-connect/token",
    }


def test_oidc_config_endpoint_returns_503_when_issuer_unset(monkeypatch) -> None:
    from fastapi.testclient import TestClient

    monkeypatch.setattr(settings, "OIDC_ISSUER_URL", "")

    response = TestClient(app).get("/api/auth/oidc-config")

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
