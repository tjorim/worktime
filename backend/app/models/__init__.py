"""SQLAlchemy ORM models, one module per domain.

Every module is imported here so that ``Base.metadata`` (Alembic's ``target_metadata``) and the mapper
registry see all tables; ``from app.models import X`` keeps working through the re-exports below."""

from app.models.access_token import AccessToken
from app.models.audit import AuditEntry
from app.models.base import Base, ClientTimestampMixin
from app.models.gantt import GanttTask
from app.models.holiday import CachedHoliday
from app.models.integration_client import IntegrationClient
from app.models.label import Label
from app.models.preferences import UserPreferences
from app.models.push import FcmDeviceToken, PushSubscription
from app.models.time_off import TimeOffEntry
from app.models.time_tracking import TimeTrackingTask, TimeTrackingTemplate
from app.models.user import User
from app.models.work_location import WorkLocation

__all__ = [
    "AccessToken",
    "AuditEntry",
    "Base",
    "CachedHoliday",
    "ClientTimestampMixin",
    "FcmDeviceToken",
    "GanttTask",
    "IntegrationClient",
    "Label",
    "PushSubscription",
    "TimeOffEntry",
    "TimeTrackingTask",
    "TimeTrackingTemplate",
    "User",
    "UserPreferences",
    "WorkLocation",
]
