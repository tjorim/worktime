"""REST API endpoints for managed integration clients (issue #1054).

Provides revocable, rotatable, rate-limited, database-backed credentials,
mirroring the personal-access-token pattern in ``app.routers.access_tokens``
but for automation/integration callers (currently: the MCP server).

Every endpoint here requires ``require_oidc_principal``: an interactive
Keycloak user session, never a personal access token or an integration
client itself. This is a structural, not just policy, guarantee against
privilege escalation — an integration credential is verified exclusively by
FastMCP's ``TokenVerifier`` machinery (``app.mcp_server``) and never reaches
``app.routers.auth`` at all, so it has no path to call these
management endpoints and mint or escalate another credential.
"""

from __future__ import annotations

from typing import cast

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.engine import get_session
from app.routers.auth import AuthenticatedPrincipal, audit_actor_for, require_oidc_principal
from app.schemas import (
    IntegrationClientCreate,
    IntegrationClientCreated,
    IntegrationClientListResponse,
    IntegrationClientRead,
    IntegrationClientScope,
)
from app.services.db_service import NotFoundError
from app.services.integration_client_service import (
    ADMIN_SCOPE,
    create_integration_client,
    list_integration_clients_for_user,
    revoke_integration_client,
    rotate_integration_client,
)

router = APIRouter(prefix="/integration-clients", tags=["Integration Clients"])


def _require_no_self_escalation(principal: AuthenticatedPrincipal, scopes: list[str]) -> None:
    """Refuse to grant admin-tier scope unless the caller is already an admin.

    Preserves Worktime's existing is_admin semantics as a deliberate grant:
    a non-admin user cannot provision a credential more privileged than
    themselves, and (structurally, see module docstring) no credential can
    ever reach this endpoint to grant itself a broader one.
    """
    if ADMIN_SCOPE in scopes and not principal.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"admin privileges are required to grant the {ADMIN_SCOPE!r} scope",
        )


@router.post("", response_model=IntegrationClientCreated, status_code=status.HTTP_201_CREATED)
async def create_integration_client_endpoint(
    payload: IntegrationClientCreate,
    response: Response,
    principal: AuthenticatedPrincipal = Depends(require_oidc_principal),
    session: AsyncSession = Depends(get_session),
) -> IntegrationClientCreated:
    response.headers["Cache-Control"] = "no-store"
    _require_no_self_escalation(principal, list(payload.scopes))
    client, raw_key = await create_integration_client(
        session,
        principal.user_id,
        name=payload.name,
        scopes=list(payload.scopes),
        rate_limit_per_minute=payload.rate_limit_per_minute,
        actor=audit_actor_for(principal),
    )
    return IntegrationClientCreated(
        id=client.id,
        name=client.name,
        key=raw_key,
        scopes=cast(list[IntegrationClientScope], client.scopes),
        rate_limit_per_minute=client.rate_limit_per_minute,
        created_at=client.created_at,
    )


@router.get("", response_model=IntegrationClientListResponse)
async def list_integration_clients_endpoint(
    principal: AuthenticatedPrincipal = Depends(require_oidc_principal),
    session: AsyncSession = Depends(get_session),
) -> IntegrationClientListResponse:
    clients = await list_integration_clients_for_user(session, principal.user_id)
    return IntegrationClientListResponse(
        items=[IntegrationClientRead.model_validate(client, from_attributes=True) for client in clients],
        total=len(clients),
    )


@router.post("/{client_id}/rotate", response_model=IntegrationClientCreated)
async def rotate_integration_client_endpoint(
    client_id: int,
    response: Response,
    principal: AuthenticatedPrincipal = Depends(require_oidc_principal),
    session: AsyncSession = Depends(get_session),
) -> IntegrationClientCreated:
    response.headers["Cache-Control"] = "no-store"
    try:
        client, raw_key = await rotate_integration_client(
            session, principal.user_id, client_id, actor=audit_actor_for(principal)
        )
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error

    return IntegrationClientCreated(
        id=client.id,
        name=client.name,
        key=raw_key,
        scopes=cast(list[IntegrationClientScope], client.scopes),
        rate_limit_per_minute=client.rate_limit_per_minute,
        created_at=client.created_at,
    )


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_integration_client_endpoint(
    client_id: int,
    principal: AuthenticatedPrincipal = Depends(require_oidc_principal),
    session: AsyncSession = Depends(get_session),
) -> Response:
    try:
        await revoke_integration_client(session, principal.user_id, client_id, actor=audit_actor_for(principal))
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error

    return Response(status_code=status.HTTP_204_NO_CONTENT)
