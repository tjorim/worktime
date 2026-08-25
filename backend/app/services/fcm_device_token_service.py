"""Service layer for FCM device tokens (see database/models.FcmDeviceToken)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import FcmDeviceToken
from app.schemas import FcmTokenCreate
from app.services.db_service import NotFoundError


async def upsert_token(session: AsyncSession, user_id: int, payload: FcmTokenCreate) -> FcmDeviceToken:
    """Register a device token, or reassign one that already exists for this token value.

    FCM issues a stable token per app install that only changes on reinstall/data
    clear (surfaced via onNewToken()), so upserting by token keeps re-registering
    on every app start idempotent.
    """
    result = await session.execute(select(FcmDeviceToken).where(FcmDeviceToken.token == payload.token))
    device_token = result.scalar_one_or_none()

    if device_token is None:
        device_token = FcmDeviceToken(user_id=user_id, token=payload.token)
        session.add(device_token)
    elif device_token.user_id != user_id:
        # The same device token re-registered under a different account (e.g.
        # shared device, different sign-in) -- reassign it to the new owner
        # rather than erroring, matching how re-subscribing push is a silent upsert.
        device_token.user_id = user_id

    await session.flush()
    await session.refresh(device_token)
    await session.commit()
    return device_token


async def delete_token(session: AsyncSession, user_id: int, token: str) -> None:
    result = await session.execute(select(FcmDeviceToken).where(FcmDeviceToken.token == token))
    device_token = result.scalar_one_or_none()
    if device_token is None or device_token.user_id != user_id:
        raise NotFoundError("FCM device token not found")
    await session.delete(device_token)
    await session.commit()


async def list_tokens_for_user(session: AsyncSession, user_id: int) -> list[FcmDeviceToken]:
    result = await session.execute(select(FcmDeviceToken).where(FcmDeviceToken.user_id == user_id))
    return list(result.scalars().all())


async def delete_token_by_id(session: AsyncSession, token_id: str) -> None:
    """Delete a token FCM reported as unregistered (app uninstalled/token expired)."""
    device_token = await session.get(FcmDeviceToken, token_id)
    if device_token is not None:
        await session.delete(device_token)
