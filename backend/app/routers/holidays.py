"""Holiday proxy endpoints.

Proxies public and school holiday requests to openholidaysapi.org,
caching responses with a long TTL so the client never contacts the
third-party service directly.
"""

import logging
from typing import Annotated

import httpx
from fastapi import APIRouter, Query, status
from fastapi.responses import JSONResponse

from ..cache.store import get_cache

logger = logging.getLogger(__name__)

OPENHOLIDAYS_BASE_URL = "https://openholidaysapi.org"

router = APIRouter(tags=["Holidays"])


def _make_cache_key(
    holiday_type: str,
    country: str,
    year: int,
    language: str,
    subdivision: str | None = None,
) -> str:
    """Build a deterministic cache key for a holiday request."""
    key = f"{holiday_type}:{country}:{year}:{language}"
    if subdivision:
        key += f":{subdivision}"
    return key


def _build_upstream_params(
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


@router.get("/holidays/public")
async def get_public_holidays(
    country: Annotated[str, Query(description="Country ISO code, e.g. NL")],
    year: Annotated[int, Query(description="Year, e.g. 2026")],
    language: Annotated[str, Query(description="Language ISO code, e.g. EN")] = "EN",
) -> JSONResponse:
    """Return public holidays for a country/year, proxied from openholidaysapi.org.

    Responses are cached for HOLIDAY_CACHE_TTL seconds (default 24 h).
    Returns 503 if the upstream is unreachable and the cache is cold.
    """
    cache_key = _make_cache_key("public", country, year, language)
    cache = get_cache()

    cached = cache.get_holiday(cache_key)
    if cached is not None:
        logger.debug("Cache hit for public holidays: %s", cache_key)
        return JSONResponse(content=cached.data)

    logger.debug("Cache miss for public holidays: %s — fetching from upstream", cache_key)
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{OPENHOLIDAYS_BASE_URL}/PublicHolidays",
                params=_build_upstream_params(country, year, language),
                headers={"Accept": "application/json"},
            )

        if not response.is_success:
            logger.warning(
                "Upstream holiday API returned %s for public holidays (%s)",
                response.status_code,
                cache_key,
            )
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={"detail": f"Holiday API returned status {response.status_code}"},
            )

        data = response.json()
        cache.set_holiday(cache_key, data)
        return JSONResponse(content=data)

    except Exception:
        logger.exception("Failed to fetch public holidays from upstream (%s)", cache_key)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": "Holiday API is unreachable"},
        )


@router.get("/holidays/school")
async def get_school_holidays(
    country: Annotated[str, Query(description="Country ISO code, e.g. NL")],
    year: Annotated[int, Query(description="Year, e.g. 2026")],
    language: Annotated[str, Query(description="Language ISO code, e.g. EN")] = "EN",
    subdivision: Annotated[
        str | None, Query(description="Subdivision code, e.g. NL-NH")
    ] = None,
) -> JSONResponse:
    """Return school holidays for a country/year, proxied from openholidaysapi.org.

    Responses are cached for HOLIDAY_CACHE_TTL seconds (default 24 h).
    Returns 503 if the upstream is unreachable and the cache is cold.
    """
    cache_key = _make_cache_key("school", country, year, language, subdivision)
    cache = get_cache()

    cached = cache.get_holiday(cache_key)
    if cached is not None:
        logger.debug("Cache hit for school holidays: %s", cache_key)
        return JSONResponse(content=cached.data)

    logger.debug("Cache miss for school holidays: %s — fetching from upstream", cache_key)
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{OPENHOLIDAYS_BASE_URL}/SchoolHolidays",
                params=_build_upstream_params(country, year, language, subdivision),
                headers={"Accept": "application/json"},
            )

        if not response.is_success:
            logger.warning(
                "Upstream holiday API returned %s for school holidays (%s)",
                response.status_code,
                cache_key,
            )
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={"detail": f"Holiday API returned status {response.status_code}"},
            )

        data = response.json()
        cache.set_holiday(cache_key, data)
        return JSONResponse(content=data)

    except Exception:
        logger.exception("Failed to fetch school holidays from upstream (%s)", cache_key)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": "Holiday API is unreachable"},
        )
