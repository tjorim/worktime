"""Tests for OIDC configuration and auto-provisioning helpers."""

from __future__ import annotations

from types import SimpleNamespace

from app.config import oidc_config


def test_derive_username_and_display_name_from_preferred_username() -> None:
    claims = {"preferred_username": "alice", "name": "Alice Smith"}
    username, display_name = oidc_config._derive_username_and_display_name(claims, "sub-123")
    assert username == "alice"
    assert display_name == "Alice Smith"


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
