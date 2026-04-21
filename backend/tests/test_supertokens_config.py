from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import sentinel

from app.config import supertokens_config as st_config


def test_init_supertokens_registers_dashboard_recipe(monkeypatch) -> None:
    recorded: dict[str, object] = {}
    dashboard_recipe = object()
    emailpassword_recipe = object()
    session_recipe = object()

    monkeypatch.setattr(st_config.settings, "SUPERTOKENS_CONNECTION_URI", "http://supertokens-worktime:3567")
    monkeypatch.setattr(st_config.settings, "SUPERTOKENS_API_KEY", "worktime-api-key")
    monkeypatch.setattr(st_config.settings, "SUPERTOKENS_API_DOMAIN", "https://worktime.tjor.im")
    monkeypatch.setattr(st_config.settings, "SUPERTOKENS_WEBSITE_DOMAIN", "https://worktime.tjor.im")
    monkeypatch.setattr(st_config.settings, "SUPERTOKENS_API_BASE_PATH", "/api/auth")
    monkeypatch.setattr(st_config.settings, "SUPERTOKENS_WEBSITE_BASE_PATH", "/auth")

    def fake_init(**kwargs):
        recorded.update(kwargs)

    def fake_emailpassword_init():
        return emailpassword_recipe

    def fake_session_init(*, override):
        recorded["session_override"] = override
        return session_recipe

    def fake_dashboard_init(*, api_key):
        recorded["dashboard_api_key"] = api_key
        return dashboard_recipe

    monkeypatch.setattr(st_config, "init", fake_init)
    monkeypatch.setattr(st_config.emailpassword, "init", fake_emailpassword_init)
    monkeypatch.setattr(st_config.session, "init", fake_session_init)
    monkeypatch.setattr(st_config.dashboard, "init", fake_dashboard_init)
    monkeypatch.setattr(st_config.session, "InputOverrideConfig", lambda *, functions: sentinel.override_config)

    st_config.init_supertokens()

    assert recorded["framework"] == "fastapi"
    assert recorded["mode"] == "asgi"
    assert recorded["app_info"].api_base_path == "/api/auth"
    assert recorded["app_info"].website_base_path == "/auth"
    assert recorded["dashboard_api_key"] == "worktime-api-key"
    assert recorded["session_override"] is sentinel.override_config
    assert recorded["recipe_list"] == [
        emailpassword_recipe,
        session_recipe,
        dashboard_recipe,
    ]


async def test_get_or_create_local_user_auto_provisions_missing_user(monkeypatch) -> None:
    existing_by_st_id = None
    existing_by_username = None
    created_local_user = SimpleNamespace(
        id=42,
        username="person@example.com",
        display_name="person",
    )

    class FakeResult:
        def __init__(self, value):
            self._value = value

        def scalar_one_or_none(self):
            return self._value

    class FakeSession:
        def __init__(self):
            self.calls = 0

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def execute(self, _query):
            self.calls += 1
            if self.calls == 1:
                return FakeResult(existing_by_st_id)
            return FakeResult(existing_by_username)

    monkeypatch.setattr(st_config, "get_session_factory", lambda: FakeSession)
    async def fake_st_get_user(user_id):
        return SimpleNamespace(emails=["person@example.com"], id=user_id)

    monkeypatch.setattr(st_config, "st_get_user", fake_st_get_user)

    recorded: dict[str, object] = {}

    async def fake_create_user(session, payload, *, supertokens_user_id):
        recorded["username"] = payload.username
        recorded["display_name"] = payload.display_name
        recorded["supertokens_user_id"] = supertokens_user_id
        return created_local_user

    monkeypatch.setattr(st_config, "create_user", fake_create_user)

    local_user = await st_config._get_or_create_local_user("st-user-123")

    assert local_user is created_local_user
    assert recorded["username"] == "person@example.com"
    assert recorded["display_name"] == "person"
    assert recorded["supertokens_user_id"] == "st-user-123"


async def test_get_or_create_local_user_appends_suffix_on_username_conflict(monkeypatch) -> None:
    class FakeResult:
        def __init__(self, value):
            self._value = value

        def scalar_one_or_none(self):
            return self._value

    class FakeSession:
        def __init__(self):
            self.calls = 0

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def execute(self, _query):
            self.calls += 1
            if self.calls == 1:
                return FakeResult(None)
            if self.calls == 2:
                return FakeResult(object())
            return FakeResult(None)

    monkeypatch.setattr(st_config, "get_session_factory", lambda: FakeSession)
    async def fake_st_get_user(user_id):
        return SimpleNamespace(emails=["person@example.com"], id=user_id)

    monkeypatch.setattr(st_config, "st_get_user", fake_st_get_user)

    created_local_user = SimpleNamespace(
        id=43,
        username="person@example.com-st-user-",
        display_name="person",
    )
    recorded: dict[str, object] = {}

    async def fake_create_user(session, payload, *, supertokens_user_id):
        recorded["username"] = payload.username
        return created_local_user

    monkeypatch.setattr(st_config, "create_user", fake_create_user)

    local_user = await st_config._get_or_create_local_user("st-user-123")

    assert local_user is created_local_user
    assert recorded["username"] == "person@example.com-st-user-"


async def test_get_or_create_local_user_keeps_searching_after_suffixed_username_conflict(
    monkeypatch,
) -> None:
    class FakeResult:
        def __init__(self, value):
            self._value = value

        def scalar_one_or_none(self):
            return self._value

    class FakeSession:
        def __init__(self):
            self.calls = 0

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def execute(self, _query):
            self.calls += 1
            if self.calls == 1:
                return FakeResult(None)
            if self.calls in {2, 3}:
                return FakeResult(object())
            return FakeResult(None)

    monkeypatch.setattr(st_config, "get_session_factory", lambda: FakeSession)

    async def fake_st_get_user(user_id):
        return SimpleNamespace(emails=["person@example.com"], id=user_id)

    monkeypatch.setattr(st_config, "st_get_user", fake_st_get_user)

    created_local_user = SimpleNamespace(
        id=44,
        username="person@example.com-st-user-1",
        display_name="person",
    )
    recorded: dict[str, object] = {}

    async def fake_create_user(session, payload, *, supertokens_user_id):
        recorded["username"] = payload.username
        return created_local_user

    monkeypatch.setattr(st_config, "create_user", fake_create_user)

    local_user = await st_config._get_or_create_local_user("st-user-123")

    assert local_user is created_local_user
    assert recorded["username"] == "person@example.com-st-user-1"
