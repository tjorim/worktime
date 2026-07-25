"""REST API endpoints for personal access tokens (e.g. the Pebble companion app)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.engine import get_session
from app.routers.auth import AuthenticatedPrincipal, require_oidc_principal
from app.schemas import AccessTokenCreate, AccessTokenCreated, AccessTokenListResponse, AccessTokenRead
from app.services.access_token_service import (
    create_access_token,
    list_access_tokens_for_user,
    revoke_access_token,
)
from app.services.db_service import NotFoundError

router = APIRouter(prefix="/access-tokens", tags=["Access Tokens"])


@router.post("", response_model=AccessTokenCreated, status_code=status.HTTP_201_CREATED)
async def create_access_token_endpoint(
    payload: AccessTokenCreate,
    principal: AuthenticatedPrincipal = Depends(require_oidc_principal),
    session: AsyncSession = Depends(get_session),
) -> AccessTokenCreated:
    token, raw_token = await create_access_token(session, principal.user_id, payload)
    return AccessTokenCreated(
        id=token.id, name=token.name, token=raw_token, created_at=token.created_at
    )


@router.get("", response_model=AccessTokenListResponse)
async def list_access_tokens_endpoint(
    principal: AuthenticatedPrincipal = Depends(require_oidc_principal),
    session: AsyncSession = Depends(get_session),
) -> AccessTokenListResponse:
    tokens = await list_access_tokens_for_user(session, principal.user_id)
    return AccessTokenListResponse(
        items=[AccessTokenRead.model_validate(token, from_attributes=True) for token in tokens],
        total=len(tokens),
    )


@router.delete("/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_access_token_endpoint(
    token_id: str,
    principal: AuthenticatedPrincipal = Depends(require_oidc_principal),
    session: AsyncSession = Depends(get_session),
) -> Response:
    try:
        await revoke_access_token(session, principal.user_id, token_id)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error

    return Response(status_code=status.HTTP_204_NO_CONTENT)
