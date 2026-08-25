"""Tests for Web Push notifications: the /api/push router, the subscription
service layer, and the periodic planned-task reminder scheduler's DB-backed
behaviour (dedup, lead-time window).

Router/service/scheduler-integration tests here need a real Postgres test
database (see tests/conftest.py's db_client/db_session fixtures) and are not
runnable in this sandbox, which has no Postgres available. These follow the
same conventions as test_access_tokens.py/test_read_models.py exactly, so
they should run unchanged in CI.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.config.settings import settings
from app.database.models import PushSubscription
from app.schemas import PushSubscriptionCreate, PushSubscriptionKeys, TaskCreate, UserCreate
from app.services.db_service import create_task, create_user
from app.services.push_service import PushSendResult
from app.services.push_subscription_service import (
    delete_subscription,
    delete_subscription_by_id,
    list_all_subscriptions,
    list_subscriptions_for_user,
    upsert_subscription,
)


def _subscribe_payload(endpoint: str = "https://fcm.googleapis.com/fcm/send/ep1", **overrides: object) -> dict:
    payload = {
        "endpoint": endpoint,
        "keys": {"p256dh": "test-p256dh", "auth": "test-auth"},
        "timezone": "UTC",
    }
    payload.update(overrides)
    return payload


class TestPushSubscriptionEndpointValidation:
    """Pure Pydantic validation -- no DB needed, runs locally without Postgres."""

    @pytest.mark.parametrize(
        "endpoint",
        [
            "https://fcm.googleapis.com/fcm/send/abc123",
            "https://updates.push.services.mozilla.com/wpush/v2/abc123",
            "https://web.push.apple.com/abc123",
            "https://wns2-abc.notify.windows.com/w/abc123",
        ],
    )
    def test_accepts_known_push_service_hosts(self, endpoint: str) -> None:
        PushSubscriptionCreate(endpoint=endpoint, keys=PushSubscriptionKeys(p256dh="a", auth="b"))

    @pytest.mark.parametrize(
        "endpoint",
        [
            "http://fcm.googleapis.com/fcm/send/abc123",  # not https
            "https://169.254.169.254/latest/meta-data/",  # cloud metadata endpoint
            "https://localhost:8000/admin",  # loopback
            "https://internal-service.local/webhook",  # unrelated host
            "https://evil.com/fcm.googleapis.com",  # allowed host as a path, not the host
            "not-a-url",
        ],
    )
    def test_rejects_endpoints_outside_the_known_push_service_allowlist(self, endpoint: str) -> None:
        with pytest.raises(ValidationError):
            PushSubscriptionCreate(endpoint=endpoint, keys=PushSubscriptionKeys(p256dh="a", auth="b"))


class TestPushRouter:
    def test_subscribe_requires_auth(self, db_client: TestClient) -> None:
        response = db_client.post("/api/push/subscribe", json=_subscribe_payload())
        assert response.status_code == 401

    def test_vapid_key_endpoint_returns_null_when_unconfigured(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(settings, "VAPID_PUBLIC_KEY", "")
        monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", "")
        admin_headers = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_headers, "push-vapid-off")
        headers = auth_headers(user_id)

        response = db_client.get("/api/push/vapid-public-key", headers=headers)
        assert response.status_code == 200
        assert response.json() == {"publicKey": None}

    def test_subscribe_returns_503_when_unconfigured(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(settings, "VAPID_PUBLIC_KEY", "")
        monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", "")
        admin_headers = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_headers, "push-subscribe-off")
        headers = auth_headers(user_id)

        response = db_client.post("/api/push/subscribe", json=_subscribe_payload(), headers=headers)
        assert response.status_code == 503

    def test_subscribe_lifecycle_over_http(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(settings, "VAPID_PUBLIC_KEY", "test-public")
        monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", "test-private")
        admin_headers = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_headers, "push-lifecycle")
        headers = auth_headers(user_id)

        key_response = db_client.get("/api/push/vapid-public-key", headers=headers)
        assert key_response.json() == {"publicKey": "test-public"}

        created = db_client.post(
            "/api/push/subscribe",
            json=_subscribe_payload(),
            headers=headers,
        )
        assert created.status_code == 201, created.text
        body = created.json()
        assert body["endpoint"] == "https://fcm.googleapis.com/fcm/send/ep1"
        assert "p256dh_key" not in body
        assert "auth_key" not in body

        # Re-subscribing the same endpoint upserts rather than duplicating.
        updated = db_client.post(
            "/api/push/subscribe",
            json=_subscribe_payload(timezone="Europe/Brussels"),
            headers=headers,
        )
        assert updated.status_code == 201
        assert updated.json()["id"] == body["id"]
        assert updated.json()["timezone"] == "Europe/Brussels"

        deleted = db_client.delete(
            "/api/push/subscribe", params={"endpoint": "https://fcm.googleapis.com/fcm/send/ep1"}, headers=headers
        )
        assert deleted.status_code == 204

        deleted_again = db_client.delete(
            "/api/push/subscribe", params={"endpoint": "https://fcm.googleapis.com/fcm/send/ep1"}, headers=headers
        )
        assert deleted_again.status_code == 404

    def test_cannot_unsubscribe_another_users_endpoint(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(settings, "VAPID_PUBLIC_KEY", "test-public")
        monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", "test-private")
        admin_headers = auth_headers(1, is_admin=True)
        owner_id = create_user_factory(db_client, admin_headers, "push-owner")
        other_id = create_user_factory(db_client, admin_headers, "push-other")

        db_client.post(
            "/api/push/subscribe",
            json=_subscribe_payload(endpoint="https://fcm.googleapis.com/fcm/send/owner-ep"),
            headers=auth_headers(owner_id),
        )

        response = db_client.delete(
            "/api/push/subscribe",
            params={"endpoint": "https://fcm.googleapis.com/fcm/send/owner-ep"},
            headers=auth_headers(other_id),
        )
        assert response.status_code == 404


class TestPushSubscriptionService:
    async def test_upsert_reassigns_ownership_on_endpoint_reuse(self, db_session: AsyncSession) -> None:
        first_owner = await create_user(db_session, UserCreate(username="reuse-owner-1", display_name="Reuse Owner 1"))
        second_owner = await create_user(db_session, UserCreate(username="reuse-owner-2", display_name="Reuse Owner 2"))

        payload = PushSubscriptionCreate(
            endpoint="https://fcm.googleapis.com/fcm/send/shared",
            keys=PushSubscriptionKeys(p256dh="a", auth="b"),
        )
        first = await upsert_subscription(db_session, first_owner.id, payload)
        assert first.user_id == first_owner.id

        second = await upsert_subscription(db_session, second_owner.id, payload)
        assert second.id == first.id
        assert second.user_id == second_owner.id

    async def test_delete_subscription_requires_ownership(self, db_session: AsyncSession) -> None:
        from app.services.db_service import NotFoundError

        owner = await create_user(db_session, UserCreate(username="delete-owner", display_name="Delete Owner"))
        other = await create_user(db_session, UserCreate(username="delete-other", display_name="Delete Other"))
        payload = PushSubscriptionCreate(
            endpoint="https://fcm.googleapis.com/fcm/send/delete-me",
            keys=PushSubscriptionKeys(p256dh="a", auth="b"),
        )
        await upsert_subscription(db_session, owner.id, payload)

        with pytest.raises(NotFoundError):
            await delete_subscription(db_session, other.id, "https://fcm.googleapis.com/fcm/send/delete-me")

        await delete_subscription(db_session, owner.id, "https://fcm.googleapis.com/fcm/send/delete-me")
        assert await list_all_subscriptions(db_session) == []

    async def test_delete_subscription_by_id_is_a_noop_when_already_gone(self, db_session: AsyncSession) -> None:
        # Should not raise even though nothing exists at this id.
        await delete_subscription_by_id(db_session, "not-a-real-id")

    async def test_upsert_survives_concurrent_registration_of_a_brand_new_endpoint(
        self, test_db: AsyncEngine
    ) -> None:
        """Two requests racing to register the same brand-new endpoint must not
        raise IntegrityError -- regression test for #1224."""
        factory = async_sessionmaker(test_db, expire_on_commit=False)
        async with factory() as session:
            user = await create_user(session, UserCreate(username="push-race-owner", display_name="Race Owner"))
            user_id = user.id

        payload = PushSubscriptionCreate(
            endpoint="https://fcm.googleapis.com/fcm/send/racing",
            keys=PushSubscriptionKeys(p256dh="a", auth="b"),
        )

        async def _register() -> PushSubscription:
            async with factory() as session:
                return await upsert_subscription(session, user_id, payload)

        first, second = await asyncio.gather(_register(), _register())
        assert first.id == second.id
        assert first.user_id == user_id
        assert second.user_id == user_id

        async with factory() as session:
            subscriptions = await list_subscriptions_for_user(session, user_id)
        assert len(subscriptions) == 1


class TestPlannedTaskReminderScheduler:
    """DB-backed behaviour of the planned-task reminder scan: window, dedup, cleanup."""

    async def _make_planned_task(
        self, db_session: AsyncSession, user_id: int, *, start_time: datetime, text: str = "Team meeting"
    ):
        return await create_task(
            db_session,
            user_id,
            TaskCreate(text=text, start_time=start_time, stop_time=start_time + timedelta(hours=1)),
        )

    async def test_finds_and_sends_for_a_task_starting_within_the_lead_window(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from app.services import planned_task_reminder_scheduler as scheduler

        user = await create_user(
            db_session, UserCreate(username="planned-reminder-user", display_name="Planned Reminder")
        )
        await upsert_subscription(
            db_session,
            user.id,
            PushSubscriptionCreate(
                endpoint="https://fcm.googleapis.com/fcm/send/planned-reminder-user",
                keys=PushSubscriptionKeys(p256dh="a", auth="b"),
            ),
        )
        fixed_now = datetime(2025, 7, 21, 8, 50, tzinfo=UTC)
        task = await self._make_planned_task(db_session, user.id, start_time=fixed_now + timedelta(minutes=5))

        send_mock = MagicMock(return_value=PushSendResult.SENT)
        monkeypatch.setattr(scheduler, "send_push", send_mock)

        due = await scheduler._find_due_tasks(db_session, fixed_now)
        assert [t.id for t in due] == [task.id]

        await scheduler._send_reminder(db_session, task, now_utc=fixed_now)
        send_mock.assert_called_once()
        await db_session.refresh(task)
        assert task.reminder_sent_at == fixed_now

        # A second scan shouldn't find it again, and re-sending is a no-op.
        assert await scheduler._find_due_tasks(db_session, fixed_now) == []
        send_mock.reset_mock()
        await scheduler._send_reminder(db_session, task, now_utc=fixed_now)
        send_mock.assert_not_called()

    async def test_skips_a_task_starting_outside_the_lead_window(self, db_session: AsyncSession) -> None:
        user = await create_user(db_session, UserCreate(username="reminder-far-out", display_name="Far Out"))
        fixed_now = datetime(2025, 7, 21, 8, 50, tzinfo=UTC)
        await self._make_planned_task(db_session, user.id, start_time=fixed_now + timedelta(hours=2))

        from app.services import planned_task_reminder_scheduler as scheduler

        assert await scheduler._find_due_tasks(db_session, fixed_now) == []

    async def test_skips_a_running_task_with_no_stop_time(self, db_session: AsyncSession) -> None:
        user = await create_user(db_session, UserCreate(username="reminder-running-task", display_name="Running"))
        fixed_now = datetime(2025, 7, 21, 8, 50, tzinfo=UTC)
        await create_task(
            db_session,
            user.id,
            TaskCreate(text="Working", start_time=fixed_now + timedelta(minutes=5)),
        )

        from app.services import planned_task_reminder_scheduler as scheduler

        assert await scheduler._find_due_tasks(db_session, fixed_now) == []

    async def test_deletes_subscription_when_push_service_reports_gone(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from app.services import planned_task_reminder_scheduler as scheduler

        user = await create_user(db_session, UserCreate(username="reminder-gone-user", display_name="Gone"))
        subscription = await upsert_subscription(
            db_session,
            user.id,
            PushSubscriptionCreate(
                endpoint="https://fcm.googleapis.com/fcm/send/reminder-gone-user",
                keys=PushSubscriptionKeys(p256dh="a", auth="b"),
            ),
        )
        fixed_now = datetime(2025, 7, 21, 8, 50, tzinfo=UTC)
        task = await self._make_planned_task(db_session, user.id, start_time=fixed_now + timedelta(minutes=5))

        send_mock = MagicMock(return_value=PushSendResult.SUBSCRIPTION_GONE)
        monkeypatch.setattr(scheduler, "send_push", send_mock)

        await scheduler._send_reminder(db_session, task, now_utc=fixed_now)

        assert await list_subscriptions_for_user(db_session, user.id) == []
        remaining = await list_all_subscriptions(db_session)
        assert all(sub.id != subscription.id for sub in remaining)

    async def test_no_reminder_without_a_subscription(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Nothing to deliver to, but the task is still claimed so it isn't rescanned forever."""
        from app.services import planned_task_reminder_scheduler as scheduler

        user = await create_user(db_session, UserCreate(username="reminder-no-sub", display_name="No Sub"))
        fixed_now = datetime(2025, 7, 21, 8, 50, tzinfo=UTC)
        task = await self._make_planned_task(db_session, user.id, start_time=fixed_now + timedelta(minutes=5))

        send_mock = MagicMock(return_value=PushSendResult.SENT)
        monkeypatch.setattr(scheduler, "send_push", send_mock)

        await scheduler._send_reminder(db_session, task, now_utc=fixed_now)
        send_mock.assert_not_called()
        await db_session.refresh(task)
        assert task.reminder_sent_at == fixed_now

    async def test_releases_the_claim_when_every_send_fails_transiently(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A transient failure (provider outage, network blip) should be retried on a later
        tick rather than permanently losing the task's one reminder window.
        """
        from app.services import planned_task_reminder_scheduler as scheduler

        user = await create_user(db_session, UserCreate(username="reminder-transient-fail", display_name="Retry"))
        await upsert_subscription(
            db_session,
            user.id,
            PushSubscriptionCreate(
                endpoint="https://fcm.googleapis.com/fcm/send/reminder-transient-fail",
                keys=PushSubscriptionKeys(p256dh="a", auth="b"),
            ),
        )
        fixed_now = datetime(2025, 7, 21, 8, 50, tzinfo=UTC)
        task = await self._make_planned_task(db_session, user.id, start_time=fixed_now + timedelta(minutes=5))

        send_mock = MagicMock(return_value=PushSendResult.FAILED)
        monkeypatch.setattr(scheduler, "send_push", send_mock)

        await scheduler._send_reminder(db_session, task, now_utc=fixed_now)
        await db_session.refresh(task)
        assert task.reminder_sent_at is None

        # A later tick, still inside the window, retries and can now succeed.
        send_mock.reset_mock()
        send_mock.return_value = PushSendResult.SENT
        assert await scheduler._find_due_tasks(db_session, fixed_now) == [task]

        await scheduler._send_reminder(db_session, task, now_utc=fixed_now)
        send_mock.assert_called_once()
        await db_session.refresh(task)
        assert task.reminder_sent_at == fixed_now

    async def test_does_not_retry_when_at_least_one_subscription_succeeded(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Partial delivery is accepted as-is -- retrying would double-notify the device
        that already received it.
        """
        from app.services import planned_task_reminder_scheduler as scheduler

        user = await create_user(db_session, UserCreate(username="reminder-partial-fail", display_name="Partial"))
        await upsert_subscription(
            db_session,
            user.id,
            PushSubscriptionCreate(
                endpoint="https://fcm.googleapis.com/fcm/send/reminder-partial-fail-1",
                keys=PushSubscriptionKeys(p256dh="a", auth="b"),
            ),
        )
        await upsert_subscription(
            db_session,
            user.id,
            PushSubscriptionCreate(
                endpoint="https://fcm.googleapis.com/fcm/send/reminder-partial-fail-2",
                keys=PushSubscriptionKeys(p256dh="c", auth="d"),
            ),
        )
        fixed_now = datetime(2025, 7, 21, 8, 50, tzinfo=UTC)
        task = await self._make_planned_task(db_session, user.id, start_time=fixed_now + timedelta(minutes=5))

        send_mock = MagicMock(side_effect=[PushSendResult.SENT, PushSendResult.FAILED])
        monkeypatch.setattr(scheduler, "send_push", send_mock)

        await scheduler._send_reminder(db_session, task, now_utc=fixed_now)
        await db_session.refresh(task)
        assert task.reminder_sent_at == fixed_now

    async def test_formats_the_reminder_time_in_the_subscriptions_timezone(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from app.services import planned_task_reminder_scheduler as scheduler

        user = await create_user(db_session, UserCreate(username="reminder-tz-user", display_name="TZ"))
        await upsert_subscription(
            db_session,
            user.id,
            PushSubscriptionCreate(
                endpoint="https://fcm.googleapis.com/fcm/send/reminder-tz-user",
                keys=PushSubscriptionKeys(p256dh="a", auth="b"),
                timezone="Europe/Brussels",
            ),
        )
        # 08:55 UTC == 10:55 in Europe/Brussels (UTC+2 in July).
        fixed_now = datetime(2025, 7, 21, 8, 50, tzinfo=UTC)
        task = await self._make_planned_task(db_session, user.id, start_time=fixed_now + timedelta(minutes=5))

        send_mock = MagicMock(return_value=PushSendResult.SENT)
        monkeypatch.setattr(scheduler, "send_push", send_mock)

        await scheduler._send_reminder(db_session, task, now_utc=fixed_now)

        _, payload = send_mock.call_args.args
        assert "10:55" in payload["body"]

    async def test_claim_rechecks_eligibility_and_skips_a_task_rescheduled_out_of_window(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Simulates the race between _find_due_tasks' scan and _send_reminder's claim:
        if the task's start_time moves outside the window in between (e.g. a concurrent
        request), the claim's full-predicate recheck must not fire the reminder.
        """
        from app.services import planned_task_reminder_scheduler as scheduler

        user = await create_user(db_session, UserCreate(username="reminder-race-reschedule", display_name="Race"))
        await upsert_subscription(
            db_session,
            user.id,
            PushSubscriptionCreate(
                endpoint="https://fcm.googleapis.com/fcm/send/reminder-race-reschedule",
                keys=PushSubscriptionKeys(p256dh="a", auth="b"),
            ),
        )
        fixed_now = datetime(2025, 7, 21, 8, 50, tzinfo=UTC)
        task = await self._make_planned_task(db_session, user.id, start_time=fixed_now + timedelta(minutes=5))

        task.start_time = fixed_now + timedelta(hours=3)
        db_session.add(task)
        await db_session.commit()

        send_mock = MagicMock(return_value=PushSendResult.SENT)
        monkeypatch.setattr(scheduler, "send_push", send_mock)

        await scheduler._send_reminder(db_session, task, now_utc=fixed_now)
        send_mock.assert_not_called()
        await db_session.refresh(task)
        assert task.reminder_sent_at is None

    async def test_claim_rechecks_eligibility_and_skips_a_task_deleted_before_claiming(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from app.services import planned_task_reminder_scheduler as scheduler

        user = await create_user(db_session, UserCreate(username="reminder-race-delete", display_name="Race"))
        await upsert_subscription(
            db_session,
            user.id,
            PushSubscriptionCreate(
                endpoint="https://fcm.googleapis.com/fcm/send/reminder-race-delete",
                keys=PushSubscriptionKeys(p256dh="a", auth="b"),
            ),
        )
        fixed_now = datetime(2025, 7, 21, 8, 50, tzinfo=UTC)
        task = await self._make_planned_task(db_session, user.id, start_time=fixed_now + timedelta(minutes=5))

        task.deleted_at = fixed_now
        db_session.add(task)
        await db_session.commit()

        send_mock = MagicMock(return_value=PushSendResult.SENT)
        monkeypatch.setattr(scheduler, "send_push", send_mock)

        await scheduler._send_reminder(db_session, task, now_utc=fixed_now)
        send_mock.assert_not_called()
