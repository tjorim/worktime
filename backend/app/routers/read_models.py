"""Reusable authenticated read-model endpoints."""

from __future__ import annotations

from datetime import datetime as dt_datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.engine import get_session
from app.read_models import (
    CurrentStatusReadModel,
    DashboardReadModel,
    NextShiftsReadModel,
    TeamStatusReadModel,
    TimeOffSummaryReadModel,
)
from app.routers.auth import AuthenticatedPrincipal, get_authenticated_principal
from app.services.db_service import NotFoundError
from app.services.read_models_service import build_dashboard_read_model

router = APIRouter(prefix="/read-models", tags=["Read Models"])


async def _load_dashboard(
    principal: AuthenticatedPrincipal,
    session: AsyncSession,
    *,
    as_of: dt_datetime | None,
    timezone: str = "UTC",
    next_shift_limit: int = 3,
) -> DashboardReadModel:
    try:
        ZoneInfo(timezone)
    except (ZoneInfoNotFoundError, KeyError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown timezone: {timezone!r}",
        ) from None
    try:
        return await build_dashboard_read_model(
            session,
            principal,
            as_of=as_of,
            timezone=timezone,
            next_shift_limit=next_shift_limit,
        )
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error


@router.get("/dashboard", response_model=DashboardReadModel)
async def get_dashboard_read_model(
    as_of: dt_datetime | None = Query(default=None),
    timezone: str = Query(default="UTC"),
    principal: AuthenticatedPrincipal = Depends(get_authenticated_principal),
    session: AsyncSession = Depends(get_session),
) -> DashboardReadModel:
    return await _load_dashboard(principal, session, as_of=as_of, timezone=timezone)


@router.get("/current-status", response_model=CurrentStatusReadModel)
async def get_current_status_read_model(
    as_of: dt_datetime | None = Query(default=None),
    timezone: str = Query(default="UTC"),
    principal: AuthenticatedPrincipal = Depends(get_authenticated_principal),
    session: AsyncSession = Depends(get_session),
) -> CurrentStatusReadModel:
    dashboard = await _load_dashboard(principal, session, as_of=as_of, timezone=timezone)
    return dashboard.current_status


@router.get("/next-shifts", response_model=NextShiftsReadModel)
async def get_next_shifts_read_model(
    as_of: dt_datetime | None = Query(default=None),
    timezone: str = Query(default="UTC"),
    limit: int = Query(default=3, ge=1, le=10),
    principal: AuthenticatedPrincipal = Depends(get_authenticated_principal),
    session: AsyncSession = Depends(get_session),
) -> NextShiftsReadModel:
    dashboard = await _load_dashboard(principal, session, as_of=as_of, timezone=timezone, next_shift_limit=limit)
    return dashboard.next_shifts


@router.get("/team-status", response_model=TeamStatusReadModel)
async def get_team_status_read_model(
    as_of: dt_datetime | None = Query(default=None),
    timezone: str = Query(default="UTC"),
    principal: AuthenticatedPrincipal = Depends(get_authenticated_principal),
    session: AsyncSession = Depends(get_session),
) -> TeamStatusReadModel:
    dashboard = await _load_dashboard(principal, session, as_of=as_of, timezone=timezone)
    return dashboard.team_status


@router.get("/time-off-summary", response_model=TimeOffSummaryReadModel)
async def get_time_off_summary_read_model(
    as_of: dt_datetime | None = Query(default=None),
    timezone: str = Query(default="UTC"),
    principal: AuthenticatedPrincipal = Depends(get_authenticated_principal),
    session: AsyncSession = Depends(get_session),
) -> TimeOffSummaryReadModel:
    dashboard = await _load_dashboard(principal, session, as_of=as_of, timezone=timezone)
    return dashboard.time_off_summary
