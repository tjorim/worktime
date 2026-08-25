"""Service layer for Web Push subscriptions (see database/models.PushSubscription)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import PushSubscription
from app.schemas import PushSubscriptionCreate
from app.services.db_service import NotFoundError


async def upsert_subscription(session: AsyncSession, user_id: int, payload: PushSubscriptionCreate) -> PushSubscription:
    """Register a subscription, or update one that already exists for this endpoint.

    A browser reuses the same endpoint across calls to PushManager.subscribe()
    for the same registration, so upserting by endpoint (rather than always
    inserting) keeps re-subscribing idempotent.
    """
    result = await session.execute(select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint))
    subscription = result.scalar_one_or_none()

    if subscription is None:
        subscription = PushSubscription(user_id=user_id, endpoint=payload.endpoint)
        session.add(subscription)
    elif subscription.user_id != user_id:
        # The same browser endpoint re-subscribed under a different account
        # (e.g. shared device, different sign-in) — reassign it to the new
        # owner rather than erroring, matching how re-subscribing is otherwise
        # a silent upsert.
        subscription.user_id = user_id

    subscription.p256dh_key = payload.keys.p256dh
    subscription.auth_key = payload.keys.auth
    subscription.timezone = payload.timezone

    await session.flush()
    await session.refresh(subscription)
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
