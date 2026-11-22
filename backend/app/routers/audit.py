"""REST API endpoint for reading the transactional mutation audit trail (issue #1054)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ErrorCode, api_error
from app.db.engine import get_session
from app.routers.auth import AuthenticatedPrincipal, get_authenticated_principal
from app.schemas import AuditEntryListResponse, AuditEntryRead
from app.services.audit.db import (
    DEFAULT_AUDIT_LIMIT,
    MAX_AUDIT_LIMIT,
    AuditAuthorizationError,
    get_legacy_time_off_audit_details,
    list_audit_entries,
)

router = APIRouter(prefix="/audit", tags=["Audit"])


@router.get("", response_model=AuditEntryListResponse)
async def list_audit_entries_endpoint(
    user_id: int | None = Query(
        default=None,
        ge=1,
        description="Restrict to one user's audit trail. Admin scope required to read another user's; "
        "omit entirely (admin only) for the team-wide trail.",
    ),
    limit: int = Query(default=DEFAULT_AUDIT_LIMIT, ge=1, le=MAX_AUDIT_LIMIT),
    before_id: int | None = Query(default=None, ge=1, description="Exclusive keyset cursor for pagination."),
    principal: AuthenticatedPrincipal = Depends(get_authenticated_principal),
    session: AsyncSession = Depends(get_session),
) -> AuditEntryListResponse:
    """Bounded, stably-ordered read of the durable mutation audit trail.

    A non-admin caller may only read their own trail (``user_id`` is forced
    to their own id regardless of what's requested). An admin caller may
    read any single user's trail or, by omitting ``user_id``, the full
    team-wide trail.
    """
    try:
        entries = await list_audit_entries(
            session,
            requesting_user_id=principal.user_id,
            is_admin=principal.is_admin,
            target_user_id=user_id,
            limit=limit,
            before_id=before_id,
        )
    except AuditAuthorizationError as error:
        raise api_error(status.HTTP_403_FORBIDDEN, ErrorCode.AUDIT_ACCESS_DENIED, str(error)) from error

    legacy_details = await get_legacy_time_off_audit_details(session, entries)
    items = []
    for entry in entries:
        item = AuditEntryRead.model_validate(entry, from_attributes=True)
        if item.resource_type in ("time_off_entry", "time_off_event") and item.actor_user_id is not None:
            details = legacy_details.get((item.actor_user_id, item.resource_id))
            if details is not None and "entry_type" not in item.details:
                item.details = {**item.details, **details}
        items.append(item)
    return AuditEntryListResponse(items=items, total=len(items))
