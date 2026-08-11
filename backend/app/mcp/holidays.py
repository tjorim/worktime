"""Cached public and school holiday MCP reads."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.context import WorktimeMcpContext
from app.routers.holidays import (
    HOLIDAY_COUNTRY_CODE,
    NAGER_BASE_URL,
    OPENHOLIDAYS_BASE_URL,
    OPENHOLIDAYS_GROUP_CODE,
    _build_openholidays_params,
    _get_or_fetch_holidays,
    _normalize_country,
    compute_paydates,
)


async def get_public_holidays(
    context: WorktimeMcpContext, db: AsyncSession, year: int, country: str = HOLIDAY_COUNTRY_CODE
) -> dict[str, Any]:
    del context
    country = _normalize_country(country)
    data = await _get_or_fetch_holidays(
        holiday_type="public",
        country=country,
        year=year,
        language=None,
        subdivision=None,
        upstream_url=f"{NAGER_BASE_URL}/PublicHolidays/{year}/{country}",
        upstream_params={},
        db=db,
        response_filter=lambda values: [item for item in values if "Public" in item.get("types", [])],
    )
    if data is None:
        raise RuntimeError("Holiday API is unreachable and no cached data is available")
    return {"year": year, "country": country, "holidays": data, "count": len(data)}


async def get_school_holidays(
    context: WorktimeMcpContext, db: AsyncSession, year: int, country: str = HOLIDAY_COUNTRY_CODE
) -> dict[str, Any]:
    del context
    country = _normalize_country(country)
    data = await _get_or_fetch_holidays(
        holiday_type=f"school-{OPENHOLIDAYS_GROUP_CODE.lower()}",
        country=country,
        year=year,
        language=None,
        subdivision=None,
        upstream_url=f"{OPENHOLIDAYS_BASE_URL}/SchoolHolidays",
        upstream_params=_build_openholidays_params(year),
        db=db,
    )
    if data is None:
        raise RuntimeError("School holiday API is unreachable and no cached data is available")
    return {"year": year, "country": country, "holidays": data, "count": len(data)}


async def get_paydates(
    context: WorktimeMcpContext, db: AsyncSession, year: int, country: str = HOLIDAY_COUNTRY_CODE
) -> dict[str, Any]:
    public = await get_public_holidays(context, db, year, country)
    return {
        "year": year,
        "country": public["country"],
        "paydates": compute_paydates(year, public["holidays"]),
    }
