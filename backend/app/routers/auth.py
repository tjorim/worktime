"""Authentication helpers for protected API endpoints.

Session verification is delegated to the OIDC JWT validation layer.  The
helper dependencies exposed here (``get_authenticated_principal``,
``get_authenticated_user_id``, …) extract identity information from the
validated Bearer JWT so that existing endpoint code does not need to change.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import StrEnum

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.config.oidc_config import OIDCTokenError, decode_token, get_or_create_local_user
from app.database.engine import get_session
from app.schemas import OidcDiscoveryConfig
from app.services.access_token_service import TOKEN_PREFIX as _PAT_PREFIX
from app.services.access_token_service import authenticate_access_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Auth"])
_bearer_scheme = HTTPBearer(auto_error=True)


class AuthType(StrEnum):
    KEYCLOAK_USER = "keycloak_user"
    KEYCLOAK_SERVICE = "keycloak_service"
    DELEGATED = "delegated"


@dataclass(frozen=True)
class AuthenticatedPrincipal:
    user_id: int
    is_admin: bool = False
    subject: str | None = None
    client_id: str | None = None
    auth_type: AuthType = AuthType.KEYCLOAK_USER
    roles: frozenset[str] = frozenset()
    scopes: frozenset[str] = frozenset()


PEBBLE_READ_SCOPE = "pebble:read"


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


def _is_keycloak_service_account(claims: dict[str, object]) -> bool:
    username = claims.get("preferred_username")
    return isinstance(username, str) and username.startswith("service-account-")


async def _authenticate_pat(request: Request, token: str, session: AsyncSession) -> AuthenticatedPrincipal:
    """Authenticate a personal access token (e.g. from the Pebble companion app).

    A PAT always authenticates as a non-admin principal, regardless of the
    underlying user's actual role, since it's a long-lived credential with a
    larger exposure window than an interactive OIDC session.
    """
    record = await authenticate_access_token(session, token)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked access token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    request.state.user_id = record.user_id
    request.state.auth_type = AuthType.DELEGATED
    return AuthenticatedPrincipal(
        user_id=record.user_id,
        is_admin=False,
        client_id="pebble",
        auth_type=AuthType.DELEGATED,
        scopes=frozenset({PEBBLE_READ_SCOPE}),
    )


async def get_bearer_principal(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
    session: AsyncSession = Depends(get_session),
) -> AuthenticatedPrincipal:
    """Validate a Bearer credential and return the authenticated principal.

    Accepts either an OIDC access token (decoded and validated against the
    provider's JWKS) or a personal access token (``wtpat_...``, looked up by
    hash) — see ``_authenticate_pat``. For OIDC, it looks up (or
    auto-provisions) the local user record by the token ``sub`` claim, and
    derives ``is_admin`` from the ``realm_access.roles`` claim (Keycloak
    realm role ``admin``).
    """
    token = credentials.credentials
    if token.startswith(_PAT_PREFIX):
        return await _authenticate_pat(request, token, session)
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
    if _is_keycloak_service_account(claims):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Keycloak service accounts cannot use the user REST API",
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
    client_id = claims.get("azp")
    if not isinstance(client_id, str):
        client_id = None

    if settings.SENTRY_DSN:
        try:
            import sentry_sdk
            sentry_sdk.set_user({"id": str(local_user.id)})
        except ImportError:
            pass

    realm_access = claims.get("realm_access")
    roles = realm_access.get("roles", []) if isinstance(realm_access, dict) else []
    is_admin = isinstance(roles, list) and "admin" in roles

    auth_type = AuthType.KEYCLOAK_USER
    request.state.auth_type = auth_type
    return AuthenticatedPrincipal(
        user_id=local_user.id,
        is_admin=is_admin,
        subject=subject,
        client_id=client_id,
        auth_type=auth_type,
        roles=frozenset(role for role in roles if isinstance(role, str)),
    )


def get_authenticated_principal(
    principal: AuthenticatedPrincipal = Depends(get_bearer_principal),
) -> AuthenticatedPrincipal:
    """Require a Keycloak user session for the regular application API."""
    if principal.auth_type != AuthType.KEYCLOAK_USER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint requires an interactive Keycloak user session",
        )
    return principal


def require_pebble_read_principal(
    principal: AuthenticatedPrincipal = Depends(get_bearer_principal),
) -> AuthenticatedPrincipal:
    """Allow Keycloak users or a delegated Pebble token with read scope."""
    if principal.auth_type == AuthType.KEYCLOAK_USER:
        return principal
    if principal.auth_type == AuthType.DELEGATED and PEBBLE_READ_SCOPE in principal.scopes:
        return principal
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing pebble:read scope")


def get_authenticated_user_id(
    principal: AuthenticatedPrincipal = Depends(get_authenticated_principal),
) -> int:
    """Backward-compatible dependency returning only the authenticated user ID."""
    return principal.user_id


def require_user_match(user_id: int, authenticated_user_id: int) -> None:
    """Enforce that request user_id matches the authenticated user."""
    if user_id != authenticated_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


def resolve_scoped_user_id(user_id: int | None, authenticated_user_id: int) -> int:
    """Resolve the effective user id for an endpoint with an optional ``user_id`` param.

    A handful of older endpoints (time-tracking, work-locations, gantt-tasks)
    require ``?user_id=`` and then 403 unless it equals the caller's own id —
    there is no path where a different value is ever allowed, so the
    parameter was pure ceremony. It's optional now: omit it (preferred) and
    the authenticated user's own id is used directly, or pass it as before
    for backward compatibility, in which case it's still validated to match.
    """
    if user_id is None:
        return authenticated_user_id
    require_user_match(user_id, authenticated_user_id)
    return authenticated_user_id


def require_user_or_admin_match(user_id: int, principal: AuthenticatedPrincipal) -> None:
    """Allow access to the same user or any user when the principal is admin."""
    if principal.is_admin:
        return
    if principal.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


def require_oidc_principal(
    principal: AuthenticatedPrincipal = Depends(get_authenticated_principal),
) -> AuthenticatedPrincipal:
    """Require an interactive OIDC session, rejecting personal access tokens.

    Used for sensitive, account-level operations (managing tokens themselves,
    deleting the account) that a long-lived companion-app credential should
    not be able to perform on its own.
    """
    return principal
