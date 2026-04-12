"""Holiday proxy endpoints.

Proxies public holiday requests to date.nager.at and school holiday requests
to openholidaysapi.org, caching responses in two layers:
- L1: in-memory ``FileCache`` (fast, lost on restart)
- L2: PostgreSQL ``cached_holidays`` table (persists across restarts)

Staleness windows:
- Current year: 24 h
- Past years: 7 days

Also exposes a ``/holidays/paydates`` endpoint that computes the 12 monthly
payday dates server-side from the cached public holiday data.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import UTC, timedelta
from datetime import date as dt_date
from datetime import datetime as dt_datetime
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..cache.store import get_cache
from ..database.engine import get_session
from ..database.models import CachedHoliday

logger = logging.getLogger(__name__)

NAGER_BASE_URL = "https://date.nager.at/api/v3"
OPENHOLIDAYS_BASE_URL = "https://openholidaysapi.org"

# Staleness thresholds
_STALE_CURRENT_YEAR = timedelta(hours=24)
_STALE_PAST_YEAR = timedelta(days=7)

# The day of the month payday is scheduled for.
_PAYDAY_DOM = 25

router = APIRouter(tags=["Holidays"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_cache_key(
    holiday_type: str,
    country: str,
    year: int,
    language: str | None = None,
    subdivision: str | None = None,
) -> str:
    """Build a deterministic in-memory cache key for a holiday request."""
    key = f"{holiday_type}:{country}:{year}"
    if language is not None:
        key += f":{language}"
    if subdivision:
        key += f":{subdivision}"
    return key


def _build_openholidays_params(
    country: str, year: int, language: str, subdivision: str | None = None
) -> dict[str, str]:
    """Build the query parameters for an openholidaysapi.org request."""
    params: dict[str, str] = {
        "countryIsoCode": country,
        "validFrom": f"{year}-01-01",
        "validTo": f"{year}-12-31",
        "languageIsoCode": language,
    }
    if subdivision:
        params["subdivisionCode"] = subdivision
    return params


def _is_stale(fetched_at: dt_datetime, year: int) -> bool:
    """Return True if the cached entry is too old and should be re-fetched."""
    now = dt_datetime.now(UTC)
    # Ensure fetched_at is timezone-aware for comparison
    if fetched_at.tzinfo is None:
        fetched_at = fetched_at.replace(tzinfo=UTC)
    age = now - fetched_at
    threshold = _STALE_CURRENT_YEAR if year == now.year else _STALE_PAST_YEAR
    return age > threshold


# ---------------------------------------------------------------------------
# Two-level cache fetch
# ---------------------------------------------------------------------------


async def _get_or_fetch_holidays(
    holiday_type: str,
    country: str,
    year: int,
    language: str | None,
    subdivision: str | None,
    upstream_url: str,
    upstream_params: dict[str, str],
    db: AsyncSession,
    *,
    response_filter: Callable[[list[Any]], list[Any]] | None = None,
) -> list[Any] | None:
    """Return holiday data, using L1 -> L2 -> upstream waterfall.

    Returns the holiday list on success, or ``None`` if the upstream is
    unreachable and both caches are cold.
    """
    cache_key = _make_cache_key(holiday_type, country, year, language, subdivision)
    mem_cache = get_cache()

    # --- L1: in-memory cache ---
    cached_entry = mem_cache.get_holiday(cache_key)
    if cached_entry is not None:
        logger.debug("L1 cache hit for %s holidays: %s", holiday_type, cache_key)
        return cached_entry.data

    # --- L2: database cache ---
    stmt = select(CachedHoliday).where(
        CachedHoliday.holiday_type == holiday_type,
        CachedHoliday.country == country,
        CachedHoliday.year == year,
        CachedHoliday.language == language,
        CachedHoliday.subdivision == subdivision,
    )
    result = await db.execute(stmt)
    db_entry = result.scalar_one_or_none()

    if db_entry is not None and not _is_stale(db_entry.fetched_at, year):
        logger.debug("L2 DB cache hit for %s holidays: %s", holiday_type, cache_key)
        mem_cache.set_holiday(cache_key, db_entry.data)
        return db_entry.data

    # --- Upstream fetch ---
    logger.debug(
        "Cache miss for %s holidays: %s — fetching from upstream", holiday_type, cache_key
    )
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                upstream_url,
                params=upstream_params,
                headers={"Accept": "application/json"},
            )

        if not response.is_success:
            logger.warning(
                "Upstream holiday API returned %s for %s holidays (%s)",
                response.status_code,
                holiday_type,
                cache_key,
            )
            # Return stale DB data if available rather than nothing
            if db_entry is not None:
                logger.info(
                    "Serving stale DB entry for %s holidays: %s", holiday_type, cache_key
                )
                return db_entry.data
            return None

        data: list[Any] = response.json()
        if response_filter is not None:
            data = response_filter(data)

    except Exception:
        logger.exception(
            "Failed to fetch %s holidays from upstream (%s)", holiday_type, cache_key
        )
        # Serve stale DB data on network error
        if db_entry is not None:
            logger.info(
                "Serving stale DB entry after upstream failure for %s holidays: %s",
                holiday_type,
                cache_key,
            )
            return db_entry.data
        return None

    # --- Persist to DB (upsert) ---
    try:
        upsert_stmt = (
            pg_insert(CachedHoliday)
            .values(
                holiday_type=holiday_type,
                country=country,
                year=year,
                subdivision=subdivision,
                language=language,
                data=data,
                fetched_at=dt_datetime.now(UTC),
            )
            .on_conflict_do_update(
                constraint="uq_cached_holiday",
                set_={"data": data, "fetched_at": dt_datetime.now(UTC)},
            )
        )
        await db.execute(upsert_stmt)
        await db.commit()
    except Exception:
        logger.exception("Failed to persist %s holidays to DB (%s)", holiday_type, cache_key)
        await db.rollback()

    # --- Store in L1 ---
    mem_cache.set_holiday(cache_key, data)
    return data


# ---------------------------------------------------------------------------
# Payday computation
# ---------------------------------------------------------------------------


def _build_holiday_date_set(holidays: list[Any]) -> set[str]:
    """Expand holiday entries into a flat set of ISO date strings.

    Handles both the Nager.At format (single ``date`` field) and the legacy
    OpenHolidays format (``startDate``/``endDate`` range).
    """
    dates: set[str] = set()
    for h in holidays:
        if "date" in h:
            # Nager.At format: single date field
            dates.add(h["date"])
        else:
            # OpenHolidays format: date range
            start = dt_date.fromisoformat(h["startDate"])
            end = dt_date.fromisoformat(h["endDate"])
            current = start
            while current <= end:
                dates.add(current.isoformat())
                current += timedelta(days=1)
    return dates


def _is_business_day(d: dt_date, holiday_dates: set[str]) -> bool:
    """Return True if *d* is neither a weekend day nor a public holiday."""
    if d.weekday() in (5, 6):  # Saturday=5, Sunday=6
        return False
    return d.isoformat() not in holiday_dates


def _payday_for_month(year: int, month: int, holiday_dates: set[str]) -> dt_date:
    """Return the payday date for *month* in *year*.

    Normally the 25th; for December the rule is: if the 25th is a public
    holiday (Christmas Day), start from the 23rd instead.  Then walk
    backward until a business day is found.
    """
    scheduled = dt_date(year, month, _PAYDAY_DOM)
    # December special case: Christmas on the 25th → start the walk-back from 23rd.
    candidate = dt_date(year, 12, 23) if month == 12 and scheduled.isoformat() in holiday_dates else scheduled
    while not _is_business_day(candidate, holiday_dates):
        candidate -= timedelta(days=1)
    return candidate


def compute_paydates(year: int, holidays: list[Any]) -> list[str]:
    """Compute the 12 monthly paydates for *year* given public *holidays*.

    Returns a list of ISO date strings (YYYY-MM-DD), one per month.
    """
    holiday_dates = _build_holiday_date_set(holidays)
    return [_payday_for_month(year, month, holiday_dates).isoformat() for month in range(1, 13)]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/holidays/public")
async def get_public_holidays(
    country: Annotated[str, Query(description="Country ISO code, e.g. NL")],
    year: Annotated[int, Query(description="Year, e.g. 2026")],
    db: AsyncSession = Depends(get_session),
) -> JSONResponse:
    """Return public holidays for a country/year, proxied from date.nager.at.

    Only entries whose ``types`` list includes ``"Public"`` are returned.
    Responses are stored in PostgreSQL (L2) and an in-memory cache (L1).
    Staleness windows: 24 h for the current year, 7 days for past years.
    Returns 503 if the upstream is unreachable and both caches are cold.
    """
    data = await _get_or_fetch_holidays(
        holiday_type="public",
        country=country,
        year=year,
        language=None,
        subdivision=None,
        upstream_url=f"{NAGER_BASE_URL}/PublicHolidays/{year}/{country}",
        upstream_params={},
        db=db,
        response_filter=lambda holidays: [h for h in holidays if "Public" in h.get("types", [])],
    )
    if data is None:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": "Holiday API is unreachable"},
        )
    return JSONResponse(content=data)


@router.get("/holidays/school")
async def get_school_holidays(
    country: Annotated[str, Query(description="Country ISO code, e.g. NL")],
    year: Annotated[int, Query(description="Year, e.g. 2026")],
    language: Annotated[str, Query(description="Language ISO code, e.g. EN")] = "EN",
    subdivision: Annotated[
        str | None, Query(description="Subdivision code, e.g. NL-NH")
    ] = None,
    db: AsyncSession = Depends(get_session),
) -> JSONResponse:
    """Return school holidays for a country/year, proxied from openholidaysapi.org.

    Responses are stored in PostgreSQL (L2) and an in-memory cache (L1).
    Staleness windows: 24 h for the current year, 7 days for past years.
    Returns 503 if the upstream is unreachable and both caches are cold.
    """
    data = await _get_or_fetch_holidays(
        holiday_type="school",
        country=country,
        year=year,
        language=language,
        subdivision=subdivision,
        upstream_url=f"{OPENHOLIDAYS_BASE_URL}/SchoolHolidays",
        upstream_params=_build_openholidays_params(country, year, language, subdivision),
        db=db,
    )
    if data is None:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": "Holiday API is unreachable"},
        )
    return JSONResponse(content=data)


@router.get("/holidays/paydates")
async def get_paydates(
    country: Annotated[str, Query(description="Country ISO code, e.g. NL")],
    year: Annotated[int, Query(description="Year, e.g. 2026")],
    db: AsyncSession = Depends(get_session),
) -> JSONResponse:
    """Return the 12 monthly payday dates for a country/year.

    Fetches (or reuses cached) public holidays for the given country/year and
    computes the payday for each month: the 25th of the month, or the nearest
    previous business day.  December has a special rule: if the 25th is a
    public holiday, start from the 23rd.

    Returns a JSON array of ISO date strings (YYYY-MM-DD), one per month.
    """
    holidays = await _get_or_fetch_holidays(
        holiday_type="public",
        country=country,
        year=year,
        language=None,
        subdivision=None,
        upstream_url=f"{NAGER_BASE_URL}/PublicHolidays/{year}/{country}",
        upstream_params={},
        db=db,
        response_filter=lambda data: [h for h in data if "Public" in h.get("types", [])],
    )
    if holidays is None:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": "Holiday API is unreachable"},
        )
    paydates = compute_paydates(year, holidays)
    return JSONResponse(content=paydates)
