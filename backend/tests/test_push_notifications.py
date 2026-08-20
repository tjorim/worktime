"""Tests for Web Push shift-reminder notifications: the /api/push router, the
subscription service layer, and the periodic reminder scheduler's DB-backed
behaviour (dedup, lead time, quiet hours).

Router/service/scheduler-integration tests here need a real Postgres test
database (see tests/conftest.py's db_client/db_session fixtures) and are not
runnable in this sandbox, which has no Postgres available -- only
test_shift_reminder_scheduler.py's pure-function tests were actually
executed locally. These follow the same conventions as
test_access_tokens.py/test_read_models.py exactly, so they should run
unchanged in CI.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.database.models import PushSubscription
from app.schemas import PushSubscriptionCreate, PushSubscriptionKeys, UserCreate
from app.services.db_service import create_user
from app.services.push_service import PushSendResult
from app.services.push_subscription_service import (
    delete_subscription,
    delete_subscription_by_id,
    list_all_subscriptions,
    upsert_subscription,
)
from tests.conftest import utc_timestamp_offset as _ts


def _seed_work_context(
    db_client: TestClient,
    headers: dict[str, str],
    *,
    schedule_type: str,
    team_number: int,
) -> None:
    response = db_client.put(
        "/api/preferences",
        json={
            "data": {"scheduleType": schedule_type, "myTeam": team_number, "settings": {}},
            "client_updated_at": _ts(),
        },
        headers=headers,
    )
    assert response.status_code == 200, response.text


def _subscribe_payload(endpoint: str = "https://fcm.googleapis.com/fcm/send/ep1", **overrides: object) -> dict:
    payload = {
        "endpoint": endpoint,
        "keys": {"p256dh": "test-p256dh", "auth": "test-auth"},
        "timezone": "UTC",
        "lead_time_minutes": 15,
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
            json=_subscribe_payload(quiet_hours_start=22, quiet_hours_end=6),
            headers=headers,
        )
        assert created.status_code == 201, created.text
        body = created.json()
        assert body["endpoint"] == "https://fcm.googleapis.com/fcm/send/ep1"
        assert body["quiet_hours_start"] == 22
        assert body["quiet_hours_end"] == 6
        assert "p256dh_key" not in body
        assert "auth_key" not in body

        # Re-subscribing the same endpoint upserts rather than duplicating.
        updated = db_client.post(
            "/api/push/subscribe",
            json=_subscribe_payload(lead_time_minutes=60),
            headers=headers,
        )
        assert updated.status_code == 201
        assert updated.json()["id"] == body["id"]
        assert updated.json()["lead_time_minutes"] == 60
        # Quiet hours weren't included in the second payload, so the upsert clears them.
        assert updated.json()["quiet_hours_start"] is None

        deleted = db_client.delete(
            "/api/push/subscribe", params={"endpoint": "https://fcm.googleapis.com/fcm/send/ep1"}, headers=headers
        )
        assert deleted.status_code == 204

        deleted_again = db_client.delete(
            "/api/push/subscribe", params={"endpoint": "https://fcm.googleapis.com/fcm/send/ep1"}, headers=headers
        )
        assert deleted_again.status_code == 404

    def test_quiet_hours_must_be_set_together(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(settings, "VAPID_PUBLIC_KEY", "test-public")
        monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", "test-private")
        admin_headers = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_headers, "push-quiet-hours-validation")
        headers = auth_headers(user_id)

        response = db_client.post(
            "/api/push/subscribe",
            json=_subscribe_payload(quiet_hours_start=22),
            headers=headers,
        )
        assert response.status_code == 422

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


class TestShiftReminderScheduler:
    """DB-backed behaviour of _check_and_send_reminders: dedup, lead time, quiet hours."""

    async def _make_subscription(
        self,
        db_session: AsyncSession,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
        *,
        username: str,
        schedule_type: str,
        team_number: int,
        lead_time_minutes: int = 15,
        quiet_hours_start: int | None = None,
        quiet_hours_end: int | None = None,
    ) -> PushSubscription:
        admin_headers = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_headers, username)
        headers = auth_headers(user_id)
        _seed_work_context(db_client, headers, schedule_type=schedule_type, team_number=team_number)

        payload = PushSubscriptionCreate(
            endpoint=f"https://fcm.googleapis.com/fcm/send/{username}",
            keys=PushSubscriptionKeys(p256dh="a", auth="b"),
            timezone="UTC",
            lead_time_minutes=lead_time_minutes,
            quiet_hours_start=quiet_hours_start,
            quiet_hours_end=quiet_hours_end,
        )
        return await upsert_subscription(db_session, user_id, payload)

    async def test_sends_and_dedupes_within_the_reminder_window(
        self,
        db_session: AsyncSession,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from app.services import shift_reminder_scheduler as scheduler

        # Team 1 on 9-5 works every weekday 09:00-17:00 in UTC (matching the
        # subscription's stored timezone) -- anchor "now" a few minutes before
        # a Monday's shift starts so it's within the 15-minute lead time.
        # 2025-07-21 is a Monday (see test_shift_reminder_scheduler.py).
        fixed_now = datetime(2025, 7, 21, 8, 50, tzinfo=UTC)

        subscription = await self._make_subscription(
            db_session,
            db_client,
            auth_headers,
            create_user_factory,
            username="reminder-user",
            schedule_type="9-5",
            team_number=1,
        )

        send_mock = MagicMock(return_value=PushSendResult.SENT)
        monkeypatch.setattr(scheduler, "send_push", send_mock)

        await scheduler._maybe_send_reminder(db_session, subscription, now_utc=fixed_now)
        await db_session.commit()
        send_mock.assert_called_once()
        assert subscription.last_reminder_key == "2025-07-21-D"

        # A second check for the same shift should not send again.
        send_mock.reset_mock()
        await scheduler._maybe_send_reminder(db_session, subscription, now_utc=fixed_now)
        send_mock.assert_not_called()

    async def test_skips_outside_the_lead_time_window(
        self,
        db_session: AsyncSession,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from app.services import shift_reminder_scheduler as scheduler

        # Two hours before the Monday shift -- outside the default 15-minute window.
        fixed_now = datetime(2025, 7, 21, 7, 0, tzinfo=UTC)

        subscription = await self._make_subscription(
            db_session,
            db_client,
            auth_headers,
            create_user_factory,
            username="reminder-early-user",
            schedule_type="9-5",
            team_number=1,
        )

        send_mock = MagicMock(return_value=PushSendResult.SENT)
        monkeypatch.setattr(scheduler, "send_push", send_mock)

        await scheduler._maybe_send_reminder(db_session, subscription, now_utc=fixed_now)
        send_mock.assert_not_called()
        assert subscription.last_reminder_key is None

    async def test_respects_quiet_hours(
        self,
        db_session: AsyncSession,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from app.services import shift_reminder_scheduler as scheduler

        fixed_now = datetime(2025, 7, 21, 8, 50, tzinfo=UTC)

        subscription = await self._make_subscription(
            db_session,
            db_client,
            auth_headers,
            create_user_factory,
            username="reminder-quiet-user",
            schedule_type="9-5",
            team_number=1,
            quiet_hours_start=6,
            quiet_hours_end=9,
        )

        send_mock = MagicMock(return_value=PushSendResult.SENT)
        monkeypatch.setattr(scheduler, "send_push", send_mock)

        await scheduler._maybe_send_reminder(db_session, subscription, now_utc=fixed_now)
        send_mock.assert_not_called()
        # Still marked handled so it doesn't fire late once quiet hours end.
        assert subscription.last_reminder_key == "2025-07-21-D"

    async def test_deletes_subscription_when_push_service_reports_gone(
        self,
        db_session: AsyncSession,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from app.services import shift_reminder_scheduler as scheduler

        fixed_now = datetime(2025, 7, 21, 8, 50, tzinfo=UTC)

        subscription = await self._make_subscription(
            db_session,
            db_client,
            auth_headers,
            create_user_factory,
            username="reminder-gone-user",
            schedule_type="9-5",
            team_number=1,
        )
        subscription_id = subscription.id

        send_mock = MagicMock(return_value=PushSendResult.SUBSCRIPTION_GONE)
        monkeypatch.setattr(scheduler, "send_push", send_mock)

        await scheduler._maybe_send_reminder(db_session, subscription, now_utc=fixed_now)
        await db_session.commit()

        remaining = await list_all_subscriptions(db_session)
        assert all(sub.id != subscription_id for sub in remaining)

    async def test_no_reminder_without_a_configured_schedule(
        self,
        db_session: AsyncSession,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from app.services import shift_reminder_scheduler as scheduler

        admin_headers = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_headers, "reminder-no-schedule")
        payload = PushSubscriptionCreate(
            endpoint="https://fcm.googleapis.com/fcm/send/no-schedule",
            keys=PushSubscriptionKeys(p256dh="a", auth="b"),
        )
        subscription = await upsert_subscription(db_session, user_id, payload)

        send_mock = MagicMock(return_value=PushSendResult.SENT)
        monkeypatch.setattr(scheduler, "send_push", send_mock)

        await scheduler._maybe_send_reminder(db_session, subscription)
        send_mock.assert_not_called()
