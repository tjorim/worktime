"""Tests for FCM push-wake notifications (#1205): the /api/push/fcm-token
router, the device-token service layer, the wake-ping fan-out service, its
trigger points (task create/update, sync push), and the planned-task reminder
scheduler's safety-net FCM send.

Router/service/scheduler-integration tests here need a real Postgres test
database (see tests/conftest.py's db_client/db_session fixtures) and are not
runnable in this sandbox, which has no Postgres available. These follow the
same conventions as test_push_notifications.py exactly, so they should run
unchanged in CI.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.schemas import FcmTokenCreate, TaskCreate, TaskUpdate, UserCreate
from app.services.db_service import create_task, create_user, delete_task, update_task
from app.services.fcm_device_token_service import (
    delete_token,
    delete_token_by_id,
    list_tokens_for_user,
    upsert_token,
)
from app.services.fcm_service import FcmSendResult
from app.services.fcm_wake_service import send_fcm_wake_ping


def _register_payload(token: str = "test-fcm-token-1") -> dict:
    return {"token": token}


class TestFcmRouter:
    def test_register_requires_auth(self, db_client: TestClient) -> None:
        response = db_client.post("/api/push/fcm-token", json=_register_payload())
        assert response.status_code == 401

    def test_register_returns_503_when_unconfigured(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(settings, "FCM_SERVICE_ACCOUNT_JSON", "")
        admin_headers = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_headers, "fcm-register-off")
        headers = auth_headers(user_id)

        response = db_client.post("/api/push/fcm-token", json=_register_payload(), headers=headers)
        assert response.status_code == 503

    def test_register_unregister_lifecycle_over_http(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(settings, "FCM_SERVICE_ACCOUNT_JSON", '{"type": "service_account"}')
        admin_headers = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_headers, "fcm-lifecycle")
        headers = auth_headers(user_id)

        created = db_client.post("/api/push/fcm-token", json=_register_payload(), headers=headers)
        assert created.status_code == 201, created.text
        body = created.json()
        assert "token" not in body

        # Re-registering the same token upserts rather than duplicating.
        updated = db_client.post("/api/push/fcm-token", json=_register_payload(), headers=headers)
        assert updated.status_code == 201
        assert updated.json()["id"] == body["id"]

        deleted = db_client.delete("/api/push/fcm-token", params={"token": "test-fcm-token-1"}, headers=headers)
        assert deleted.status_code == 204

        deleted_again = db_client.delete("/api/push/fcm-token", params={"token": "test-fcm-token-1"}, headers=headers)
        assert deleted_again.status_code == 404

    def test_cannot_unregister_another_users_token(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(settings, "FCM_SERVICE_ACCOUNT_JSON", '{"type": "service_account"}')
        admin_headers = auth_headers(1, is_admin=True)
        owner_id = create_user_factory(db_client, admin_headers, "fcm-owner")
        other_id = create_user_factory(db_client, admin_headers, "fcm-other")

        db_client.post(
            "/api/push/fcm-token",
            json=_register_payload("owner-token"),
            headers=auth_headers(owner_id),
        )

        response = db_client.delete(
            "/api/push/fcm-token", params={"token": "owner-token"}, headers=auth_headers(other_id)
        )
        assert response.status_code == 404


class TestFcmDeviceTokenService:
    async def test_upsert_reassigns_ownership_on_token_reuse(self, db_session: AsyncSession) -> None:
        first_owner = await create_user(db_session, UserCreate(username="fcm-reuse-owner-1", display_name="First"))
        second_owner = await create_user(db_session, UserCreate(username="fcm-reuse-owner-2", display_name="Second"))

        payload = FcmTokenCreate(token="shared-device-token")
        first = await upsert_token(db_session, first_owner.id, payload)
        assert first.user_id == first_owner.id

        second = await upsert_token(db_session, second_owner.id, payload)
        assert second.id == first.id
        assert second.user_id == second_owner.id

    async def test_delete_token_requires_ownership(self, db_session: AsyncSession) -> None:
        from app.services.db_service import NotFoundError

        owner = await create_user(db_session, UserCreate(username="fcm-delete-owner", display_name="Owner"))
        other = await create_user(db_session, UserCreate(username="fcm-delete-other", display_name="Other"))
        await upsert_token(db_session, owner.id, FcmTokenCreate(token="delete-me-token"))

        with pytest.raises(NotFoundError):
            await delete_token(db_session, other.id, "delete-me-token")

        await delete_token(db_session, owner.id, "delete-me-token")
        assert await list_tokens_for_user(db_session, owner.id) == []

    async def test_delete_token_by_id_is_a_noop_when_already_gone(self, db_session: AsyncSession) -> None:
        # Should not raise even though nothing exists at this id.
        await delete_token_by_id(db_session, "not-a-real-id")


class TestFcmWakeService:
    """Pure fan-out behaviour of send_fcm_wake_ping -- gating, cleanup, best-effort."""

    async def test_no_op_when_unconfigured(self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(settings, "FCM_SERVICE_ACCOUNT_JSON", "")
        user = await create_user(db_session, UserCreate(username="fcm-wake-off", display_name="Off"))
        await upsert_token(db_session, user.id, FcmTokenCreate(token="fcm-wake-off-token"))

        send_mock = MagicMock(return_value=FcmSendResult.SENT)
        monkeypatch.setattr("app.services.fcm_wake_service.send_wake_signal", send_mock)

        await send_fcm_wake_ping(db_session, user.id)
        send_mock.assert_not_called()

    async def test_no_op_without_registered_devices(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(settings, "FCM_SERVICE_ACCOUNT_JSON", '{"type": "service_account"}')
        user = await create_user(db_session, UserCreate(username="fcm-wake-no-devices", display_name="None"))

        send_mock = MagicMock(return_value=FcmSendResult.SENT)
        monkeypatch.setattr("app.services.fcm_wake_service.send_wake_signal", send_mock)

        await send_fcm_wake_ping(db_session, user.id)
        send_mock.assert_not_called()

    async def test_sends_to_every_token_and_removes_invalid_ones(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(settings, "FCM_SERVICE_ACCOUNT_JSON", '{"type": "service_account"}')
        user = await create_user(db_session, UserCreate(username="fcm-wake-multi", display_name="Multi"))
        await upsert_token(db_session, user.id, FcmTokenCreate(token="fcm-wake-multi-valid"))
        await upsert_token(db_session, user.id, FcmTokenCreate(token="fcm-wake-multi-invalid"))

        def _send(token: str) -> FcmSendResult:
            return FcmSendResult.TOKEN_INVALID if token == "fcm-wake-multi-invalid" else FcmSendResult.SENT

        send_mock = MagicMock(side_effect=_send)
        monkeypatch.setattr("app.services.fcm_wake_service.send_wake_signal", send_mock)

        await send_fcm_wake_ping(db_session, user.id)

        assert send_mock.call_count == 2
        remaining = await list_tokens_for_user(db_session, user.id)
        assert [t.token for t in remaining] == ["fcm-wake-multi-valid"]

    async def test_swallows_a_send_exception_and_continues(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A crash sending to one device must not stop the rest of the fan-out,
        and must never propagate out to the caller (task create/update, sync push).
        """
        monkeypatch.setattr(settings, "FCM_SERVICE_ACCOUNT_JSON", '{"type": "service_account"}')
        user = await create_user(db_session, UserCreate(username="fcm-wake-exc", display_name="Exc"))
        await upsert_token(db_session, user.id, FcmTokenCreate(token="fcm-wake-exc-boom"))
        await upsert_token(db_session, user.id, FcmTokenCreate(token="fcm-wake-exc-ok"))

        def _send(token: str) -> FcmSendResult:
            if token == "fcm-wake-exc-boom":
                raise RuntimeError("network blip")
            return FcmSendResult.SENT

        send_mock = MagicMock(side_effect=_send)
        monkeypatch.setattr("app.services.fcm_wake_service.send_wake_signal", send_mock)

        await send_fcm_wake_ping(db_session, user.id)  # must not raise
        assert send_mock.call_count == 2


class TestFcmWakeTriggers:
    """The task create/update and sync-push paths that fan out a wake-ping."""

    async def test_creating_a_planned_task_triggers_a_wake_ping(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        user = await create_user(db_session, UserCreate(username="fcm-trigger-create", display_name="Create"))
        wake_mock = AsyncMock()
        monkeypatch.setattr("app.services.fcm_wake_service.send_fcm_wake_ping", wake_mock)

        await create_task(
            db_session,
            user.id,
            TaskCreate(
                text="Team meeting",
                start_time=datetime.now(UTC) + timedelta(minutes=30),
                stop_time=datetime.now(UTC) + timedelta(minutes=90),
            ),
        )
        wake_mock.assert_called_once_with(db_session, user.id)

    async def test_creating_a_running_task_does_not_trigger_a_wake_ping(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A task with no stop_time isn't "planned" -- there's nothing for the
        Android reminder to arm ahead of.
        """
        user = await create_user(db_session, UserCreate(username="fcm-trigger-running", display_name="Running"))
        wake_mock = AsyncMock()
        monkeypatch.setattr("app.services.fcm_wake_service.send_fcm_wake_ping", wake_mock)

        await create_task(
            db_session,
            user.id,
            TaskCreate(text="Working now", start_time=datetime.now(UTC)),
        )
        wake_mock.assert_not_called()

    async def test_creating_a_past_planned_task_does_not_trigger_a_wake_ping(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        user = await create_user(db_session, UserCreate(username="fcm-trigger-past", display_name="Past"))
        wake_mock = AsyncMock()
        monkeypatch.setattr("app.services.fcm_wake_service.send_fcm_wake_ping", wake_mock)

        await create_task(
            db_session,
            user.id,
            TaskCreate(
                text="Already started",
                start_time=datetime.now(UTC) - timedelta(hours=2),
                stop_time=datetime.now(UTC) - timedelta(hours=1),
            ),
        )
        wake_mock.assert_not_called()

    async def test_rescheduling_a_planned_task_triggers_a_wake_ping(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        user = await create_user(db_session, UserCreate(username="fcm-trigger-reschedule", display_name="Reschedule"))
        task = await create_task(
            db_session,
            user.id,
            TaskCreate(
                text="Team meeting",
                start_time=datetime.now(UTC) + timedelta(hours=5),
                stop_time=datetime.now(UTC) + timedelta(hours=6),
            ),
        )

        wake_mock = AsyncMock()
        monkeypatch.setattr("app.services.fcm_wake_service.send_fcm_wake_ping", wake_mock)

        await update_task(
            db_session,
            user.id,
            task.id,
            TaskUpdate(start_time=datetime.now(UTC) + timedelta(minutes=20)),
        )
        wake_mock.assert_called_once_with(db_session, user.id)

    async def test_clearing_stop_time_on_an_upcoming_planned_task_triggers_a_wake_ping(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Turning a planned task back into a running one removes reminder eligibility -- a
        device that already armed a local alarm for it needs the wake to cancel that alarm,
        same as an outright deletion.
        """
        user = await create_user(db_session, UserCreate(username="fcm-trigger-clear-stop", display_name="Clear"))
        task = await create_task(
            db_session,
            user.id,
            TaskCreate(
                text="Team meeting",
                start_time=datetime.now(UTC) + timedelta(minutes=30),
                stop_time=datetime.now(UTC) + timedelta(minutes=90),
            ),
        )

        wake_mock = AsyncMock()
        monkeypatch.setattr("app.services.fcm_wake_service.send_fcm_wake_ping", wake_mock)

        await update_task(db_session, user.id, task.id, TaskUpdate(stop_time=None))
        wake_mock.assert_called_once_with(db_session, user.id)

    async def test_moving_an_upcoming_task_into_the_past_triggers_a_wake_ping(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        user = await create_user(db_session, UserCreate(username="fcm-trigger-move-past", display_name="MovePast"))
        task = await create_task(
            db_session,
            user.id,
            TaskCreate(
                text="Team meeting",
                start_time=datetime.now(UTC) + timedelta(minutes=30),
                stop_time=datetime.now(UTC) + timedelta(minutes=90),
            ),
        )

        wake_mock = AsyncMock()
        monkeypatch.setattr("app.services.fcm_wake_service.send_fcm_wake_ping", wake_mock)

        await update_task(
            db_session,
            user.id,
            task.id,
            TaskUpdate(
                start_time=datetime.now(UTC) - timedelta(hours=2), stop_time=datetime.now(UTC) - timedelta(hours=1)
            ),
        )
        wake_mock.assert_called_once_with(db_session, user.id)

    async def test_editing_an_unrelated_field_does_not_trigger_a_wake_ping(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        user = await create_user(db_session, UserCreate(username="fcm-trigger-unrelated", display_name="Unrelated"))
        task = await create_task(
            db_session,
            user.id,
            TaskCreate(
                text="Team meeting",
                start_time=datetime.now(UTC) + timedelta(minutes=30),
                stop_time=datetime.now(UTC) + timedelta(minutes=90),
            ),
        )

        wake_mock = AsyncMock()
        monkeypatch.setattr("app.services.fcm_wake_service.send_fcm_wake_ping", wake_mock)

        await update_task(db_session, user.id, task.id, TaskUpdate(text="Renamed meeting"))
        wake_mock.assert_not_called()

    async def test_deleting_an_upcoming_planned_task_triggers_a_wake_ping(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A device that already scheduled a local alarm for this task needs a wake-ping to
        cancel it -- otherwise it stays armed for a task that no longer exists.
        """
        user = await create_user(db_session, UserCreate(username="fcm-trigger-delete", display_name="Delete"))
        task = await create_task(
            db_session,
            user.id,
            TaskCreate(
                text="Team meeting",
                start_time=datetime.now(UTC) + timedelta(minutes=30),
                stop_time=datetime.now(UTC) + timedelta(minutes=90),
            ),
        )

        wake_mock = AsyncMock()
        monkeypatch.setattr("app.services.fcm_wake_service.send_fcm_wake_ping", wake_mock)

        await delete_task(db_session, user.id, task.id)
        wake_mock.assert_called_once_with(db_session, user.id)

    async def test_deleting_a_running_task_does_not_trigger_a_wake_ping(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        user = await create_user(db_session, UserCreate(username="fcm-trigger-delete-running", display_name="Del"))
        task = await create_task(
            db_session,
            user.id,
            TaskCreate(text="Working now", start_time=datetime.now(UTC)),
        )

        wake_mock = AsyncMock()
        monkeypatch.setattr("app.services.fcm_wake_service.send_fcm_wake_ping", wake_mock)

        await delete_task(db_session, user.id, task.id)
        wake_mock.assert_not_called()

    async def test_deleting_a_past_planned_task_does_not_trigger_a_wake_ping(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        user = await create_user(db_session, UserCreate(username="fcm-trigger-delete-past", display_name="Past"))
        task = await create_task(
            db_session,
            user.id,
            TaskCreate(
                text="Already started",
                start_time=datetime.now(UTC) - timedelta(hours=2),
                stop_time=datetime.now(UTC) - timedelta(hours=1),
            ),
        )

        wake_mock = AsyncMock()
        monkeypatch.setattr("app.services.fcm_wake_service.send_fcm_wake_ping", wake_mock)

        await delete_task(db_session, user.id, task.id)
        wake_mock.assert_not_called()

    def test_sync_push_creating_a_task_triggers_a_wake_ping(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_headers = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_headers, "fcm-sync-push-trigger")
        headers = auth_headers(user_id)
        task_id = str(uuid4())

        with patch("app.services.fcm_wake_service.send_fcm_wake_ping", new_callable=AsyncMock) as wake_mock:
            response = db_client.post(
                "/api/sync/push",
                json={
                    "tasks": [
                        {
                            "id": task_id,
                            "action": "create",
                            "client_updated_at": datetime.now(UTC).isoformat(),
                            "text": "Synced meeting",
                            "start_time": "2026-02-01T09:00:00+00:00",
                            "stop_time": "2026-02-01T10:00:00+00:00",
                            "includes_break": False,
                        }
                    ]
                },
                headers=headers,
            )
        assert response.status_code == 200, response.text
        assert response.json()["results"]["tasks"][0]["status"] == "ok"
        wake_mock.assert_called_once()
        assert wake_mock.call_args.args[1] == user_id

    def test_sync_push_with_no_task_changes_does_not_trigger_a_wake_ping(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_headers = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_headers, "fcm-sync-push-no-trigger")
        headers = auth_headers(user_id)

        with patch("app.services.fcm_wake_service.send_fcm_wake_ping", new_callable=AsyncMock) as wake_mock:
            response = db_client.post(
                "/api/sync/push",
                json={
                    "labels": [
                        {
                            "id": str(uuid4()),
                            "action": "create",
                            "client_updated_at": datetime.now(UTC).isoformat(),
                            "name": "Label",
                            "color": "#AABBCC",
                        }
                    ]
                },
                headers=headers,
            )
        assert response.status_code == 200, response.text
        wake_mock.assert_not_called()


class TestPlannedTaskReminderSchedulerFcmSafetyNet:
    """The scheduler's own FCM send, alongside the Web Push it already sends."""

    async def _make_planned_task(
        self, db_session: AsyncSession, user_id: int, *, start_time: datetime, text: str = "Team meeting"
    ):
        return await create_task(
            db_session,
            user_id,
            TaskCreate(text=text, start_time=start_time, stop_time=start_time + timedelta(hours=1)),
        )

    async def test_sends_a_wake_ping_alongside_the_push_notification(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from app.services import planned_task_reminder_scheduler as scheduler

        monkeypatch.setattr(settings, "FCM_SERVICE_ACCOUNT_JSON", '{"type": "service_account"}')
        user = await create_user(db_session, UserCreate(username="fcm-scheduler-user", display_name="Scheduler"))
        await upsert_token(db_session, user.id, FcmTokenCreate(token="fcm-scheduler-token"))

        fixed_now = datetime(2025, 7, 21, 8, 50, tzinfo=UTC)
        task = await self._make_planned_task(db_session, user.id, start_time=fixed_now + timedelta(minutes=5))

        fcm_mock = MagicMock(return_value=FcmSendResult.SENT)
        monkeypatch.setattr(scheduler, "send_wake_signal", fcm_mock)

        await scheduler._send_reminder(db_session, task, now_utc=fixed_now)
        fcm_mock.assert_called_once_with("fcm-scheduler-token")

    async def test_removes_a_device_token_the_scheduler_finds_invalid(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from app.services import planned_task_reminder_scheduler as scheduler

        monkeypatch.setattr(settings, "FCM_SERVICE_ACCOUNT_JSON", '{"type": "service_account"}')
        user = await create_user(db_session, UserCreate(username="fcm-scheduler-gone", display_name="Gone"))
        await upsert_token(db_session, user.id, FcmTokenCreate(token="fcm-scheduler-gone-token"))

        fixed_now = datetime(2025, 7, 21, 8, 50, tzinfo=UTC)
        task = await self._make_planned_task(db_session, user.id, start_time=fixed_now + timedelta(minutes=5))

        monkeypatch.setattr(scheduler, "send_wake_signal", MagicMock(return_value=FcmSendResult.TOKEN_INVALID))

        await scheduler._send_reminder(db_session, task, now_utc=fixed_now)
        assert await list_tokens_for_user(db_session, user.id) == []

    async def test_skips_fcm_entirely_when_unconfigured(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from app.services import planned_task_reminder_scheduler as scheduler

        monkeypatch.setattr(settings, "FCM_SERVICE_ACCOUNT_JSON", "")
        user = await create_user(db_session, UserCreate(username="fcm-scheduler-off", display_name="Off"))
        await upsert_token(db_session, user.id, FcmTokenCreate(token="fcm-scheduler-off-token"))

        fixed_now = datetime(2025, 7, 21, 8, 50, tzinfo=UTC)
        task = await self._make_planned_task(db_session, user.id, start_time=fixed_now + timedelta(minutes=5))

        fcm_mock = MagicMock(return_value=FcmSendResult.SENT)
        monkeypatch.setattr(scheduler, "send_wake_signal", fcm_mock)

        await scheduler._send_reminder(db_session, task, now_utc=fixed_now)
        fcm_mock.assert_not_called()
