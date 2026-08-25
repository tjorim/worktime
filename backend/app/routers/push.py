"""REST API endpoints for Web Push subscriptions (notifications, e.g. a planned
task starting soon, that fire even when the app is closed).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.database.engine import get_session
from app.routers.auth import AuthenticatedPrincipal, require_oidc_principal
from app.schemas import PushSubscriptionCreate, PushSubscriptionRead
from app.services.db_service import NotFoundError
from app.services.push_subscription_service import delete_subscription, upsert_subscription

router = APIRouter(prefix="/push", tags=["Push Notifications"])


@router.get("/vapid-public-key")
async def get_vapid_public_key_endpoint(
    principal: AuthenticatedPrincipal = Depends(require_oidc_principal),
) -> dict[str, str | None]:
    """Return the public key the frontend needs for PushManager.subscribe().

    Not a secret, but kept behind auth for consistency with the rest of the
    API surface. Returns null when the feature isn't configured, so the
    frontend can skip offering push entirely rather than attempt a
    subscription that will never receive anything.
    """
    return {"publicKey": settings.VAPID_PUBLIC_KEY or None}


@router.post("/subscribe", response_model=PushSubscriptionRead, status_code=status.HTTP_201_CREATED)
async def subscribe_endpoint(
    payload: PushSubscriptionCreate,
    principal: AuthenticatedPrincipal = Depends(require_oidc_principal),
    session: AsyncSession = Depends(get_session),
) -> PushSubscriptionRead:
    if not settings.push_notifications_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Push notifications are not configured on this server",
        )
    subscription = await upsert_subscription(session, principal.user_id, payload)
    return PushSubscriptionRead.model_validate(subscription, from_attributes=True)


@router.delete("/subscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe_endpoint(
    endpoint: str = Query(..., min_length=1, max_length=2048),
    principal: AuthenticatedPrincipal = Depends(require_oidc_principal),
    session: AsyncSession = Depends(get_session),
) -> Response:
    try:
        await delete_subscription(session, principal.user_id, endpoint)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error

    return Response(status_code=status.HTTP_204_NO_CONTENT)
