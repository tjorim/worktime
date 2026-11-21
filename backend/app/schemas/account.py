"""Account profile, capabilities and OIDC discovery schemas."""

from __future__ import annotations

from app.schemas.base import ResponseModel


class AccountCapabilities(ResponseModel):
    """Capability flags relevant for frontend feature enablement."""

    backup_enabled: bool


class AccountProfile(ResponseModel):
    """Response schema for the authenticated account profile endpoint."""

    id: int
    username: str
    display_name: str
    is_admin: bool
    capabilities: AccountCapabilities


class OidcDiscoveryConfig(ResponseModel):
    """Public OIDC endpoints discovered by native clients from the API."""

    issuer: str
    authorization_url: str
    token_url: str
    end_session_url: str | None = None
