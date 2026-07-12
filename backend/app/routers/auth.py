"""Authentication helpers for protected API endpoints.

Session verification is delegated to the OIDC JWT validation layer.  The
helper dependencies exposed here (``get_authenticated_principal``,
``get_authenticated_user_id``, …) extract identity information from the
validated Bearer JWT so that existing endpoint code does not need to change.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.config.oidc_config import OIDCTokenError, decode_token, get_or_create_local_user
from app.database.engine import get_session
from app.schemas import OidcDiscoveryConfig

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Auth"])
_bearer_scheme = HTTPBearer(auto_error=True)


@dataclass(frozen=True)
class AuthenticatedPrincipal:
    user_id: int
    is_admin: bool = False


# Discovery results are stable for the lifetime of the process, like the JWKS
# cache in app.config.oidc_config. Keyed by issuer so a config change is picked up.
_config_cache: dict[str, OidcDiscoveryConfig] = {}


def _http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=10)


async def _discover(issuer: str) -> OidcDiscoveryConfig:
    """Fetch the provider's OIDC discovery document and extract public endpoints."""
    discovery_url = f"{issuer}/.well-known/openid-configuration"
    async with _http_client() as client:
        response = await client.get(discovery_url)
    response.raise_for_status()
    data = response.json()
    return OidcDiscoveryConfig(
        issuer=data.get("issuer", issuer),
        authorization_url=data["authorization_endpoint"],
        token_url=data["token_endpoint"],
        end_session_url=data.get("end_session_endpoint"),
    )


@router.get("/oidc-config", response_model=OidcDiscoveryConfig)
async def oidc_config() -> OidcDiscoveryConfig:
    """Return public OIDC endpoints for native clients.

    Endpoints come from the provider's standard discovery document so any
    OIDC provider (Keycloak, authentik, ...) works without provider-specific
    URL paths.
    """
    if not settings.OIDC_ISSUER_URL:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OIDC not configured on this server",
        )
    issuer = settings.OIDC_ISSUER_URL.rstrip("/")
    cached = _config_cache.get(issuer)
    if cached is not None:
        return cached
    try:
        config = await _discover(issuer)
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        logger.error("OIDC discovery failed for %s: %s", issuer, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OIDC discovery failed",
        ) from exc
    _config_cache[issuer] = config
    return config


async def get_authenticated_principal(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
    session: AsyncSession = Depends(get_session),
) -> AuthenticatedPrincipal:
    """Validate a Bearer JWT and return the authenticated principal.

    Decodes the OIDC access token, looks up (or auto-provisions) the local
    user record by the token ``sub`` claim, and derives ``is_admin`` from the
    ``realm_access.roles`` claim (Keycloak realm role ``admin``).
    """
    token = credentials.credentials
    try:
        claims = await decode_token(token)
    except OIDCTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    subject = claims.get("sub")
    if not isinstance(subject, str) or not subject.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing or empty subject claim",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        local_user = await get_or_create_local_user(subject, claims, session)
    except Exception as exc:
        logger.exception("Failed to resolve local user for subject %s", subject)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication service error",
        ) from exc

    # Make the resolved user ID and auth type available to middleware for access logging.
    request.state.user_id = local_user.id
    request.state.auth_type = "oidc"

    if settings.SENTRY_DSN:
        try:
            import sentry_sdk
            sentry_sdk.set_user({"id": str(local_user.id)})
        except ImportError:
            pass

    realm_access = claims.get("realm_access")
    roles = realm_access.get("roles", []) if isinstance(realm_access, dict) else []
    is_admin = isinstance(roles, list) and "admin" in roles

    return AuthenticatedPrincipal(user_id=local_user.id, is_admin=is_admin)


def get_authenticated_user_id(
    principal: AuthenticatedPrincipal = Depends(get_authenticated_principal),
) -> int:
    """Backward-compatible dependency returning only the authenticated user ID."""
    return principal.user_id


def require_user_match(user_id: int, authenticated_user_id: int) -> None:
    """Enforce that request user_id matches the authenticated user."""
    if user_id != authenticated_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


def require_user_or_admin_match(user_id: int, principal: AuthenticatedPrincipal) -> None:
    """Allow access to the same user or any user when the principal is admin."""
    if principal.is_admin:
        return
    if principal.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
