"""Calendar subscription management and public feed endpoint."""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.engine import get_session
from app.routers.auth import AuthenticatedPrincipal, require_oidc_principal
from app.schemas import IcalFeedCreated
from app.services.access_token_service import (
    authenticate_ical_feed_token,
    revoke_ical_feed_token,
    rotate_ical_feed_token,
)
from app.services.ical_service import build_ical_feed

router = APIRouter(prefix="/ical", tags=["Calendar Feed"])


@router.post("", response_model=IcalFeedCreated, status_code=status.HTTP_201_CREATED)
async def rotate_feed(principal: AuthenticatedPrincipal = Depends(require_oidc_principal), session: AsyncSession = Depends(get_session)) -> IcalFeedCreated:
    token = await rotate_ical_feed_token(session, principal.user_id)
    return IcalFeedCreated(url_path=f"/api/ical/{token}.ics")


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_feed(principal: AuthenticatedPrincipal = Depends(require_oidc_principal), session: AsyncSession = Depends(get_session)) -> Response:
    await revoke_ical_feed_token(session, principal.user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{token}.ics")
async def calendar_feed(token: str, session: AsyncSession = Depends(get_session)) -> Response:
    credential = await authenticate_ical_feed_token(session, token)
    if credential is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="calendar feed not found")
    body = await build_ical_feed(session, credential.user_id)
    return Response(body, media_type="text/calendar; charset=utf-8", headers={
        "Cache-Control": "private, max-age=300", "Content-Disposition": 'inline; filename="worktime.ics"',
        "X-Content-Type-Options": "nosniff",
    })
