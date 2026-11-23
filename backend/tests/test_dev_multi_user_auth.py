"""Exercise dev credentials through real authentication, without principal mocks."""

from typing import Any

import pytest

from app.core import oidc as oidc_config
from app.core.config import Settings
from app.main import app
from app.routers.auth import get_bearer_principal


@pytest.mark.parametrize("environment", ["production"])
@pytest.mark.parametrize("field", ["DEV_AUTH_BYPASS_TOKEN", "DEV_AUTH_MEMBER_TOKEN", "DEV_AUTH_SECOND_MEMBER_TOKEN"])
def test_dev_credentials_rejected_outside_development(environment, field):
    values: dict[str, Any] = {
        "ENVIRONMENT": environment,
        "TRUSTED_HOSTS": "localhost",
        "INTEGRATION_KEY_HASH_SECRET": "test-only-secret",
        field: "secret",
    }
    with pytest.raises(ValueError, match="outside ENVIRONMENT=development"):
        Settings(_env_file=None, **values)


@pytest.mark.parametrize(
    "values",
    [
        {"DEV_AUTH_MEMBER_TOKEN": "member"},
        {"DEV_AUTH_SECOND_MEMBER_TOKEN": "member2"},
        {"DEV_AUTH_BYPASS_TOKEN": "same", "DEV_AUTH_MEMBER_TOKEN": "same"},
        {"DEV_AUTH_BYPASS_TOKEN": "admin", "DEV_AUTH_MEMBER_TOKEN": "wtpat_member"},
        {"DEV_AUTH_BYPASS_TOKEN": "admin", "DEV_AUTH_SECOND_MEMBER_TOKEN": " "},
        {"DEV_AUTH_BYPASS_TOKEN": "admin", "DEV_AUTH_MEMBER_TOKEN": "é"},
        {"DEV_AUTH_BYPASS_TOKEN": "admin", "DEV_AUTH_MEMBER_TOKEN": "same", "DEV_AUTH_SECOND_MEMBER_TOKEN": "same"},
    ],
)
def test_invalid_dev_configuration(values: dict[str, Any]):
    kwargs: dict[str, Any] = {"ENVIRONMENT": "development", **values}
    with pytest.raises(ValueError):
        Settings(_env_file=None, **kwargs)


@pytest.mark.parametrize("environment", ["production", "staging", "test"])
@pytest.mark.parametrize("token", ["admin-secret", "member-secret", "second-secret"])
async def test_runtime_environment_guard(monkeypatch, environment, token):
    monkeypatch.setattr(oidc_config.settings, "ENVIRONMENT", environment)
    monkeypatch.setattr(oidc_config.settings, "DEV_AUTH_BYPASS_TOKEN", "admin-secret")
    monkeypatch.setattr(oidc_config.settings, "DEV_AUTH_MEMBER_TOKEN", "member-secret")
    monkeypatch.setattr(oidc_config.settings, "DEV_AUTH_SECOND_MEMBER_TOKEN", "second-secret")
    monkeypatch.setattr(oidc_config.settings, "OIDC_JWKS_URI", "")
    monkeypatch.setattr(oidc_config.settings, "OIDC_ISSUER_URL", "")
    with pytest.raises(oidc_config.OIDCTokenError):
        await oidc_config.decode_token(token)


async def test_member_requires_explicit_bypass(monkeypatch):
    monkeypatch.setattr(oidc_config.settings, "DEV_AUTH_BYPASS_TOKEN", "")
    monkeypatch.setattr(oidc_config.settings, "DEV_AUTH_MEMBER_TOKEN", "member-secret")
    monkeypatch.setattr(oidc_config.settings, "OIDC_JWKS_URI", "")
    monkeypatch.setattr(oidc_config.settings, "OIDC_ISSUER_URL", "")
    with pytest.raises(oidc_config.OIDCTokenError):
        await oidc_config.decode_token("member-secret")


def test_real_dev_users_roles_and_isolation(db_client, monkeypatch):
    monkeypatch.setattr(oidc_config.settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(oidc_config.settings, "DEV_AUTH_BYPASS_TOKEN", "admin-secret")
    monkeypatch.setattr(oidc_config.settings, "DEV_AUTH_MEMBER_TOKEN", "member-secret")
    monkeypatch.setattr(oidc_config.settings, "DEV_AUTH_SECOND_MEMBER_TOKEN", "second-secret")
    override = app.dependency_overrides.pop(get_bearer_principal)
    try:
        profiles = []
        for token, username, status in [
            ("admin-secret", "devuser", 200),
            ("member-secret", "devmember", 403),
            ("second-secret", "devmember2", 403),
        ]:
            headers = {"Authorization": f"Bearer {token}"}
            profile = db_client.get("/api/me", headers=headers)
            assert profile.status_code == 200, profile.text
            assert profile.json()["username"] == username
            profiles.append(profile.json()["id"])
            assert db_client.get("/api/users/", headers=headers).status_code == status
            assert db_client.get("/api/me", headers=headers).json()["id"] == profiles[-1]
        assert len(set(profiles)) == 3
        response = db_client.get(
            f"/api/time-tracking/labels?user_id={profiles[2]}",
            headers={"Authorization": "Bearer member-secret"},
        )
        assert response.status_code == 403
        assert db_client.get("/api/me", headers={"Authorization": "Bearer unknown"}).status_code == 401
    finally:
        app.dependency_overrides[get_bearer_principal] = override


def test_admin_only_username_changes_and_audit(db_client, monkeypatch):
    monkeypatch.setattr(oidc_config.settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(oidc_config.settings, "DEV_AUTH_BYPASS_TOKEN", "admin-secret")
    monkeypatch.setattr(oidc_config.settings, "DEV_AUTH_MEMBER_TOKEN", "member-secret")
    with monkeypatch.context() as patch:
        patch.delitem(app.dependency_overrides, get_bearer_principal)
        admin = {"Authorization": "Bearer admin-secret"}
        member = {"Authorization": "Bearer member-secret"}
        profile = db_client.get("/api/me", headers=member).json()
        endpoint = f"/api/users/{profile['id']}"

        response = db_client.put(endpoint, json={"username": "new-name", "display_name": "Blocked"}, headers=member)
        assert response.status_code == 403
        assert response.json()["code"] == "username_change_forbidden"
        for reserved in [" ADMIN ", "ROOT", "administrator", "system", "support"]:
            response = db_client.put(endpoint, json={"username": reserved}, headers=member)
            assert response.status_code == 400
            assert response.json()["code"] == "username_reserved"
        updated = db_client.put(endpoint, json={"display_name": "New display name"}, headers=member)
        assert updated.status_code == 200
        assert updated.json()["display_name"] == "New display name"
        assert updated.json()["username"] == "devmember"
        assert db_client.get("/api/audit", headers=member).json()["items"] == []

        renamed = db_client.put(endpoint, json={"username": "support"}, headers=admin)
        assert renamed.status_code == 200
        assert db_client.get("/api/me", headers=member).json()["username"] == "support"

        admin_id = db_client.get("/api/me", headers=admin).json()["id"]
        for headers in (admin, member):
            items = db_client.get("/api/audit", headers=headers).json()["items"]
            assert len(items) == 1
            assert items[0]["action"] == "rename_user"
            assert items[0]["actor_user_id"] == admin_id
            assert items[0]["resource_id"] == str(profile["id"])
            assert items[0]["details"] == {"old_username": "devmember", "new_username": "support"}
