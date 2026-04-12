from __future__ import annotations

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
    monkeypatch.setattr(st_config.settings, "SUPERTOKENS_API_BASE_PATH", "/auth")
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
    assert recorded["app_info"].api_base_path == "/auth"
    assert recorded["app_info"].website_base_path == "/auth"
    assert recorded["dashboard_api_key"] == "worktime-api-key"
    assert recorded["session_override"] is sentinel.override_config
    assert recorded["recipe_list"] == [
        emailpassword_recipe,
        session_recipe,
        dashboard_recipe,
    ]
