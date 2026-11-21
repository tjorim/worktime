"""Web Push subscription and FCM device token ORM models."""

from datetime import datetime as dt_datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, _utc_now


class PushSubscription(Base):
    """A browser's Web Push subscription, used to deliver notifications that fire
    even when the app is closed (see app.services.planned_task_reminder_scheduler).

    One row per browser/device — a user with multiple devices has multiple rows.
    """

    __tablename__ = "push_subscriptions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    endpoint: Mapped[str] = mapped_column(String, unique=True, index=True)
    p256dh_key: Mapped[str] = mapped_column(String)
    auth_key: Mapped[str] = mapped_column(String)
    # IANA timezone name (e.g. "Europe/Brussels"), captured client-side at
    # subscribe time. Not currently used to compute reminder timing (planned-task
    # reminders fire relative to start_time, which is already an absolute instant),
    # but kept for parity with how the frontend gathers subscription info and in
    # case a future reminder kind needs local wall-clock context again.
    timezone: Mapped[str] = mapped_column(String, default="UTC", server_default="UTC")
    created_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=_utc_now
    )
    updated_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=_utc_now, default=_utc_now
    )


class FcmDeviceToken(Base):
    """An Android device's FCM registration token.

    Used purely as a wake signal (see app.services.fcm_service): a silent data
    message that prods the app into reconciling its local planned-task reminder
    immediately, rather than waiting for the app to next be opened. Never carries
    reminder content itself -- app.services.planned_task_reminder_scheduler and
    the Android app's own local alarm remain the single source of truth for that.

    One row per device -- a user with multiple devices has multiple rows.
    """

    __tablename__ = "fcm_device_tokens"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token: Mapped[str] = mapped_column(String, unique=True, index=True)
    created_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=_utc_now
    )
    updated_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=_utc_now, default=_utc_now
    )
