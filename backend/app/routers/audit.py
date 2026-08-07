"""REST API endpoint for reading the transactional mutation audit trail (issue #1054)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.db import DEFAULT_AUDIT_LIMIT, MAX_AUDIT_LIMIT, AuditAuthorizationError, list_audit_entries
from app.database.engine import get_session
from app.routers.auth import AuthenticatedPrincipal, get_authenticated_principal
from app.schemas import AuditEntryListResponse, AuditEntryRead

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
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(error)) from error

    return AuditEntryListResponse(
        items=[AuditEntryRead.model_validate(entry, from_attributes=True) for entry in entries],
        total=len(entries),
    )
