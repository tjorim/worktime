"""Service layer for FCM device tokens (see database/models.FcmDeviceToken)."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import FcmDeviceToken
from app.schemas import FcmTokenCreate
from app.services.db_service import NotFoundError


async def upsert_token(session: AsyncSession, user_id: int, payload: FcmTokenCreate) -> FcmDeviceToken:
    """Register a device token, or reassign one that already exists for this token value.

    FCM issues a stable token per app install that only changes on reinstall/data
    clear (surfaced via onNewToken()), so upserting by token keeps re-registering
    on every app start idempotent. Uses a database-native INSERT ... ON CONFLICT
    DO UPDATE (rather than SELECT-then-insert) so two concurrent registrations of
    the same brand-new token can't both pass a "no existing row" check and race
    each other into an IntegrityError (#1224). Reassigning ownership on conflict
    also covers the same device token re-registering under a different account
    (e.g. shared device, different sign-in) -- matching how re-subscribing push
    is a silent upsert.
    """
    now = datetime.now(UTC)
    statement = pg_insert(FcmDeviceToken).values(
        user_id=user_id,
        token=payload.token,
        updated_at=now,
    )
    statement = statement.on_conflict_do_update(
        index_elements=["token"],
        set_={
            "user_id": statement.excluded.user_id,
            "updated_at": statement.excluded.updated_at,
        },
    ).returning(FcmDeviceToken)

    # populate_existing: without it, a conflicting row's new values wouldn't
    # overwrite an already-identity-mapped instance for the same token (e.g.
    # a prior upsert_token call earlier in this session).
    result = await session.execute(statement, execution_options={"populate_existing": True})
    device_token = result.scalar_one()
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
