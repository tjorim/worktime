"""REST API endpoints for database-backed user preferences (local-first sync)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.engine import get_session
from app.routers.auth import get_authenticated_user_id
from app.schemas import UserPreferencesRead, UserPreferencesWrite
from app.services.db_service import get_user_preferences, upsert_user_preferences
from app.utils.timing import time_operation

router = APIRouter(prefix="/preferences", tags=["Preferences"])


@router.get("", response_model=UserPreferencesRead | None)
async def get_preferences_endpoint(
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    """Return the authenticated user's stored preferences, or null if none exist yet."""
    timings: dict[str, float] = {}
    with time_operation("query", timings):
        prefs = await get_user_preferences(session, authenticated_user_id)

    content = (
        UserPreferencesRead.model_validate(prefs, from_attributes=True).model_dump(mode="json")
        if prefs is not None
        else None
    )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=content,
        headers={"X-Db-Query-Ms": f"{timings.get('query', 0):.3f}"},
    )


@router.put("", response_model=UserPreferencesRead, status_code=status.HTTP_200_OK)
async def put_preferences_endpoint(
    payload: UserPreferencesWrite,
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    """Create or update the authenticated user's preferences blob.

    Uses last-write-wins conflict detection based on ``client_updated_at``.
    If the stored ``client_updated_at`` is already equal to or newer than the
    submitted one, the stored record is returned unchanged (no-op update).
    """
    timings: dict[str, float] = {}
    with time_operation("query", timings):
        # upsert_user_preferences broadcasts the sync_changed hint itself.
        prefs = await upsert_user_preferences(session, authenticated_user_id, payload)

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=UserPreferencesRead.model_validate(prefs, from_attributes=True).model_dump(mode="json"),
        headers={"X-Db-Query-Ms": f"{timings.get('query', 0):.3f}"},
    )
