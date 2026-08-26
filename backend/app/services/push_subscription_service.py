"""Service layer for Web Push subscriptions (see database/models.PushSubscription)."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import PushSubscription
from app.schemas import PushSubscriptionCreate
from app.services.db_service import NotFoundError


async def upsert_subscription(session: AsyncSession, user_id: int, payload: PushSubscriptionCreate) -> PushSubscription:
    """Register a subscription, or update one that already exists for this endpoint.

    A browser reuses the same endpoint across calls to PushManager.subscribe()
    for the same registration, so upserting by endpoint (rather than always
    inserting) keeps re-subscribing idempotent. Uses a database-native
    INSERT ... ON CONFLICT DO UPDATE (rather than SELECT-then-insert) so two
    concurrent registrations of the same brand-new endpoint can't both pass a
    "no existing row" check and race each other into an IntegrityError (#1224).
    Reassigning ownership on conflict also covers the same browser endpoint
    re-subscribing under a different account (e.g. shared device, different
    sign-in) — matching how re-subscribing is otherwise a silent upsert.
    """
    now = datetime.now(UTC)
    statement = pg_insert(PushSubscription).values(
        user_id=user_id,
        endpoint=payload.endpoint,
        p256dh_key=payload.keys.p256dh,
        auth_key=payload.keys.auth,
        timezone=payload.timezone,
        updated_at=now,
    )
    statement = statement.on_conflict_do_update(
        index_elements=["endpoint"],
        set_={
            "user_id": statement.excluded.user_id,
            "p256dh_key": statement.excluded.p256dh_key,
            "auth_key": statement.excluded.auth_key,
            "timezone": statement.excluded.timezone,
            "updated_at": statement.excluded.updated_at,
        },
    ).returning(PushSubscription)

    # populate_existing: without it, a conflicting row's new values wouldn't
    # overwrite an already-identity-mapped instance for the same endpoint
    # (e.g. a prior upsert_subscription call earlier in this session).
    result = await session.execute(statement, execution_options={"populate_existing": True})
    subscription = result.scalar_one()
    await session.commit()
    return subscription


async def delete_subscription(session: AsyncSession, user_id: int, endpoint: str) -> None:
    result = await session.execute(select(PushSubscription).where(PushSubscription.endpoint == endpoint))
    subscription = result.scalar_one_or_none()
    if subscription is None or subscription.user_id != user_id:
        raise NotFoundError("push subscription not found")
    await session.delete(subscription)
    await session.commit()


async def list_subscriptions_for_user(session: AsyncSession, user_id: int) -> list[PushSubscription]:
    result = await session.execute(select(PushSubscription).where(PushSubscription.user_id == user_id))
    return list(result.scalars().all())


async def list_all_subscriptions(session: AsyncSession) -> list[PushSubscription]:
    """Return every subscription across all users — used by the periodic reminder scan."""
    result = await session.execute(select(PushSubscription))
    return list(result.scalars().all())


async def delete_subscription_by_id(session: AsyncSession, subscription_id: str) -> None:
    """Delete a subscription the push service reported as gone (404/410)."""
    subscription = await session.get(PushSubscription, subscription_id)
    if subscription is not None:
        await session.delete(subscription)
