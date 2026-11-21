"""Audit log schemas."""

from __future__ import annotations

from datetime import datetime as dt_datetime
from typing import Any

from app.schemas.base import ListResponse, ResponseModel


class AuditEntryRead(ResponseModel):
    """A single transactional audit-trail entry (issue #1054)."""

    id: int
    actor_user_id: int | None
    actor_label: str
    subject: str | None
    auth_source: str
    action: str
    resource_type: str
    resource_id: str
    request_id: str | None
    details: dict[str, Any]
    created_at: dt_datetime


class AuditEntryListResponse(ListResponse[AuditEntryRead]):
    pass
