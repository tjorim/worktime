"""Tests for holiday proxy endpoints and payday computation."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.cache.store import get_cache
from app.config import settings
from app.routers.holidays import (
    _build_holiday_date_set,
    _is_business_day,
    _is_stale,
    _payday_for_month,
    compute_paydates,
)

# ── sample upstream payloads ──────────────────────────────────────────────────

# Nager.At format — used by /holidays/public and /holidays/paydates
SAMPLE_PUBLIC_HOLIDAYS = [
    {
        "date": "2026-01-01",
        "localName": "Nieuwjaarsdag",
        "name": "New Year's Day",
        "countryCode": "NL",
        "global": True,
        "counties": None,
        "types": ["Public"],
    }
]

# A Nager.At response entry that should be filtered out (non-Public type)
SAMPLE_NON_PUBLIC_HOLIDAY = {
    "date": "2026-04-27",
    "localName": "Koningsdag",
    "name": "King's Day",
    "countryCode": "NL",
    "global": True,
    "counties": None,
    "types": ["Authorities", "School"],
}

SAMPLE_SCHOOL_HOLIDAYS = [
    {
        "id": "sh-nl-nh-2026-01",
        "startDate": "2026-02-14",
        "endDate": "2026-02-22",
        "type": "SchoolHolidays",
        "name": [{"language": "EN", "text": "Carnival/Spring Half-Term"}, {"language": "NL", "text": "Voorjaarsvakantie"}],
        "regionalScope": "Regional",
        "temporalScope": "FullDay",
        "nationwide": False,
        "subdivisions": [{"code": "NL-NH", "shortName": "NH"}],
    }
]


# ── helpers ───────────────────────────────────────────────────────────────────

def _mock_httpx_client(status_code: int = 200, json_data=None, raise_exc=None):
    """Return a fully-wired httpx.AsyncClient mock context manager."""
    mock_response = MagicMock()
    mock_response.status_code = status_code
    mock_response.is_success = 200 <= status_code < 300
    mock_response.json = MagicMock(return_value=json_data or [])

    mock_http_client = AsyncMock()
    if raise_exc is not None:
        mock_http_client.get = AsyncMock(side_effect=raise_exc)
    else:
        mock_http_client.get = AsyncMock(return_value=mock_response)

    mock_ctx = MagicMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_http_client)
    mock_ctx.__aexit__ = AsyncMock(return_value=None)
    return mock_ctx


# ── public holidays ───────────────────────────────────────────────────────────

class TestGetPublicHolidays:
    """Tests for GET /api/holidays/public."""

    def test_returns_holiday_data(self, db_client: TestClient):
        """Successful upstream call returns JSON array of Public-typed entries."""
        mock_ctx = _mock_httpx_client(200, SAMPLE_PUBLIC_HOLIDAYS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx):
            response = db_client.get("/api/holidays/public?country=NL&year=2026")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["date"] == "2026-01-01"
        assert data[0]["name"] == "New Year's Day"

    def test_non_public_types_are_filtered_out(self, db_client: TestClient):
        """Entries whose types do not include 'Public' are excluded from the response."""
        raw = SAMPLE_PUBLIC_HOLIDAYS + [SAMPLE_NON_PUBLIC_HOLIDAY]
        mock_ctx = _mock_httpx_client(200, raw)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx):
            response = db_client.get("/api/holidays/public?country=NL&year=2026")

        data = response.json()
        assert len(data) == 1
        assert data[0]["date"] == "2026-01-01"

    def test_upstream_called_with_nager_url(self, db_client: TestClient):
        """Upstream request targets Nager.At with year/country path params, no query params."""
        mock_ctx = _mock_httpx_client(200, SAMPLE_PUBLIC_HOLIDAYS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx) as mock_cls:
            db_client.get("/api/holidays/public?country=NL&year=2026")

        mock_http_client = mock_cls.return_value.__aenter__.return_value
        call_kwargs = mock_http_client.get.call_args
        assert call_kwargs is not None
        url = call_kwargs.args[0] if call_kwargs.args else call_kwargs.kwargs.get("url", "")
        assert "date.nager.at" in url
        assert "2026" in url
        assert "NL" in url
        # No OpenHolidays-style query params
        params = call_kwargs.kwargs.get("params", {})
        assert "countryIsoCode" not in params
        assert "languageIsoCode" not in params

    def test_language_param_ignored(self, db_client: TestClient):
        """The language query parameter has no effect on the public holidays endpoint."""
        mock_ctx = _mock_httpx_client(200, SAMPLE_PUBLIC_HOLIDAYS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx) as mock_cls:
            db_client.get("/api/holidays/public?country=NL&year=2026&language=EN")

        # Should still be called once; language is silently ignored
        mock_http_client = mock_cls.return_value.__aenter__.return_value
        assert mock_http_client.get.call_count == 1

    def test_l1_cached_on_first_request(self, db_client: TestClient):
        """Response is stored in the in-memory L1 cache after the first fetch."""
        cache = get_cache()
        mock_ctx = _mock_httpx_client(200, SAMPLE_PUBLIC_HOLIDAYS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx):
            db_client.get("/api/holidays/public?country=NL&year=2026")

        # Cache key has no language dimension for public (Nager) holidays
        entry = cache.get_holiday("public:NL:2026")
        assert entry is not None
        assert entry.data == SAMPLE_PUBLIC_HOLIDAYS

    def test_l1_cache_hit_skips_upstream(self, db_client: TestClient):
        """Second request for identical params does not hit date.nager.at (L1 hit)."""
        mock_ctx = _mock_httpx_client(200, SAMPLE_PUBLIC_HOLIDAYS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx) as mock_cls:
            db_client.get("/api/holidays/public?country=NL&year=2026")
            db_client.get("/api/holidays/public?country=NL&year=2026")

        mock_http_client = mock_cls.return_value.__aenter__.return_value
        assert mock_http_client.get.call_count == 1

    def test_503_when_upstream_error_status(self, db_client: TestClient):
        """503 is returned when the upstream responds with a non-2xx status."""
        mock_ctx = _mock_httpx_client(500)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx):
            response = db_client.get("/api/holidays/public?country=NL&year=2026")

        assert response.status_code == 503
        assert "detail" in response.json()

    def test_503_when_upstream_unreachable(self, db_client: TestClient):
        """503 is returned when the upstream raises a network exception."""
        mock_ctx = _mock_httpx_client(raise_exc=Exception("connection refused"))
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx):
            response = db_client.get("/api/holidays/public?country=NL&year=2026")

        assert response.status_code == 503
        assert "detail" in response.json()

    def test_different_params_produce_different_cache_entries(self, db_client: TestClient):
        """Requests for different years are cached independently."""
        cache = get_cache()
        nl_ctx = _mock_httpx_client(200, SAMPLE_PUBLIC_HOLIDAYS)
        next_year_data = [
            {
                "date": "2027-01-01",
                "name": "New Year's Day",
                "localName": "Nieuwjaarsdag",
                "countryCode": "NL",
                "global": True,
                "counties": None,
                "types": ["Public"],
            }
        ]
        next_year_ctx = _mock_httpx_client(200, next_year_data)

        with patch("app.routers.holidays.httpx.AsyncClient", side_effect=[nl_ctx, next_year_ctx]):
            db_client.get("/api/holidays/public?country=NL&year=2026")
            db_client.get("/api/holidays/public?country=NL&year=2027")

        assert cache.get_holiday("public:NL:2026") is not None
        assert cache.get_holiday("public:NL:2027") is not None

    def test_l2_db_cache_hit_skips_upstream(self, db_client: TestClient):
        """After a restart (empty L1), the DB (L2) serves the response without upstream."""
        mock_ctx = _mock_httpx_client(200, SAMPLE_PUBLIC_HOLIDAYS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx) as mock_cls:
            # First request: upstream + DB write
            db_client.get("/api/holidays/public?country=NL&year=2026")
            # Simulate restart by clearing L1
            get_cache()._holiday_entries.clear()
            # Second request: DB hit, no upstream
            db_client.get("/api/holidays/public?country=NL&year=2026")

        mock_http_client = mock_cls.return_value.__aenter__.return_value
        assert mock_http_client.get.call_count == 1

    def test_cache_disabled_still_uses_db(self, db_client: TestClient, monkeypatch):
        """With CACHE_ENABLED=False, the L1 cache is skipped but the DB L2 still caches."""
        monkeypatch.setattr(settings, "CACHE_ENABLED", False)
        mock_ctx = _mock_httpx_client(200, SAMPLE_PUBLIC_HOLIDAYS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx) as mock_cls:
            db_client.get("/api/holidays/public?country=NL&year=2026")
            db_client.get("/api/holidays/public?country=NL&year=2026")

        mock_http_client = mock_cls.return_value.__aenter__.return_value
        # Second request served from DB, so only 1 upstream call
        assert mock_http_client.get.call_count == 1

    def test_country_param_is_normalized_to_nl(self, db_client: TestClient):
        """Non-NL country query values are normalized to NL for now."""
        mock_ctx = _mock_httpx_client(200, SAMPLE_PUBLIC_HOLIDAYS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx) as mock_cls:
            db_client.get("/api/holidays/public?country=BE&year=2026")

        mock_http_client = mock_cls.return_value.__aenter__.return_value
        call_kwargs = mock_http_client.get.call_args
        url = call_kwargs.args[0] if call_kwargs.args else call_kwargs.kwargs.get("url", "")
        assert url.endswith("/PublicHolidays/2026/NL")


# ── school holidays ───────────────────────────────────────────────────────────

class TestGetSchoolHolidays:
    """Tests for GET /api/holidays/school."""

    def test_returns_holiday_data(self, db_client: TestClient):
        """Successful upstream call returns JSON array."""
        mock_ctx = _mock_httpx_client(200, SAMPLE_SCHOOL_HOLIDAYS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx):
            response = db_client.get("/api/holidays/school?country=NL&year=2026&language=EN")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["id"] == "sh-nl-nh-2026-01"

    def test_upstream_uses_fixed_group_code_without_subdivision(self, db_client: TestClient):
        """School holiday upstream requests use only the fixed group code."""
        mock_ctx = _mock_httpx_client(200, SAMPLE_SCHOOL_HOLIDAYS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx) as mock_cls:
            db_client.get("/api/holidays/school?country=NL&year=2026")

        mock_http_client = mock_cls.return_value.__aenter__.return_value
        params = mock_http_client.get.call_args.kwargs["params"]
        assert params["countryIsoCode"] == "NL"
        assert params["validFrom"] == "2026-01-01"
        assert params["validTo"] == "2026-12-31"
        assert params["languageIsoCode"] == "EN"
        assert params["groupCode"] == "NL-ZU"
        assert "subdivisionCode" not in params

    def test_language_param_ignored(self, db_client: TestClient):
        """School holiday responses are normalized to EN + native Dutch names."""
        mock_ctx = _mock_httpx_client(200, SAMPLE_SCHOOL_HOLIDAYS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx) as mock_cls:
            db_client.get("/api/holidays/school?country=NL&year=2026&language=DE")

        mock_http_client = mock_cls.return_value.__aenter__.return_value
        params = mock_http_client.get.call_args.kwargs["params"]
        assert params["languageIsoCode"] == "EN"
        assert params["groupCode"] == "NL-ZU"

    def test_subdivision_query_param_is_ignored(self, db_client: TestClient):
        """A subdivision query value does not affect upstream school-holiday requests."""
        mock_ctx = _mock_httpx_client(200, SAMPLE_SCHOOL_HOLIDAYS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx) as mock_cls:
            db_client.get("/api/holidays/school?country=NL&year=2026&subdivision=NL-NH")

        mock_http_client = mock_cls.return_value.__aenter__.return_value
        params = mock_http_client.get.call_args.kwargs["params"]
        assert "subdivisionCode" not in params

    def test_l1_cached_on_first_request(self, db_client: TestClient):
        """Response is stored in the in-memory L1 cache after the first fetch."""
        cache = get_cache()
        mock_ctx = _mock_httpx_client(200, SAMPLE_SCHOOL_HOLIDAYS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx):
            db_client.get("/api/holidays/school?country=NL&year=2026")

        entry = cache.get_holiday("school-nl-zu:NL:2026")
        assert entry is not None
        assert entry.data == SAMPLE_SCHOOL_HOLIDAYS

    def test_l1_cache_hit_skips_upstream(self, db_client: TestClient):
        """Second request for identical params does not hit openholidaysapi.org (L1 hit)."""
        mock_ctx = _mock_httpx_client(200, SAMPLE_SCHOOL_HOLIDAYS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx) as mock_cls:
            db_client.get("/api/holidays/school?country=NL&year=2026")
            db_client.get("/api/holidays/school?country=NL&year=2026")

        mock_http_client = mock_cls.return_value.__aenter__.return_value
        assert mock_http_client.get.call_count == 1

    def test_503_when_upstream_error_status(self, db_client: TestClient):
        """503 is returned when the upstream responds with a non-2xx status."""
        mock_ctx = _mock_httpx_client(500)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx):
            response = db_client.get("/api/holidays/school?country=NL&year=2026")

        assert response.status_code == 503

    def test_503_when_upstream_unreachable(self, db_client: TestClient):
        """503 is returned when the upstream raises a network exception."""
        mock_ctx = _mock_httpx_client(raise_exc=Exception("network error"))
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx):
            response = db_client.get("/api/holidays/school?country=NL&year=2026")

        assert response.status_code == 503

    def test_subdivision_query_param_reuses_same_cache_entry(self, db_client: TestClient):
        """Subdivision query values do not create separate cache entries."""
        cache = get_cache()
        mock_ctx = _mock_httpx_client(200, SAMPLE_SCHOOL_HOLIDAYS)

        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx) as mock_cls:
            db_client.get("/api/holidays/school?country=NL&year=2026&subdivision=NL-NH")
            db_client.get("/api/holidays/school?country=NL&year=2026&subdivision=NL-ZH")

        mock_http_client = mock_cls.return_value.__aenter__.return_value
        assert mock_http_client.get.call_count == 1
        assert cache.get_holiday("school-nl-zu:NL:2026") is not None


# ── staleness helpers ─────────────────────────────────────────────────────────

class TestIsStale:
    """Unit tests for the _is_stale staleness check."""

    def test_fresh_current_year(self):
        """Entry fetched 1 hour ago for the current year is not stale."""
        year = datetime.now(UTC).year
        fetched_at = datetime.now(UTC) - timedelta(hours=1)
        assert not _is_stale(fetched_at, year)

    def test_stale_current_year(self):
        """Entry fetched 25 hours ago for the current year is stale."""
        year = datetime.now(UTC).year
        fetched_at = datetime.now(UTC) - timedelta(hours=25)
        assert _is_stale(fetched_at, year)

    def test_fresh_past_year(self):
        """Entry fetched 3 days ago for a past year is not stale."""
        year = datetime.now(UTC).year - 1
        fetched_at = datetime.now(UTC) - timedelta(days=3)
        assert not _is_stale(fetched_at, year)

    def test_stale_past_year(self):
        """Entry fetched 8 days ago for a past year is stale."""
        year = datetime.now(UTC).year - 1
        fetched_at = datetime.now(UTC) - timedelta(days=8)
        assert _is_stale(fetched_at, year)

    def test_naive_datetime_treated_as_utc(self):
        """Naive fetched_at timestamps are treated as UTC."""
        year = datetime.now(UTC).year - 1
        fetched_at_naive = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=3)  # naive
        assert not _is_stale(fetched_at_naive, year)


# ── payday computation ────────────────────────────────────────────────────────

class TestPaydayComputation:
    """Unit tests for payday calculation helpers."""

    def test_build_holiday_date_set_nager_single_date(self):
        """Nager.At format: single 'date' field maps to one date."""
        holidays = [{"date": "2026-01-01", "name": "New Year's Day", "types": ["Public"]}]
        dates = _build_holiday_date_set(holidays)
        assert dates == {"2026-01-01"}

    def test_build_holiday_date_set_single_day(self):
        """Legacy OpenHolidays format: single-day range expands to one date."""
        holidays = [{"startDate": "2026-01-01", "endDate": "2026-01-01"}]
        dates = _build_holiday_date_set(holidays)
        assert dates == {"2026-01-01"}

    def test_build_holiday_date_set_range(self):
        """Legacy OpenHolidays format: multi-day range expands to all dates."""
        holidays = [{"startDate": "2026-12-24", "endDate": "2026-12-26"}]
        dates = _build_holiday_date_set(holidays)
        assert dates == {"2026-12-24", "2026-12-25", "2026-12-26"}

    def test_is_business_day_weekday_no_holiday(self):
        """A regular Monday is a business day."""
        from datetime import date
        # 2026-01-05 is a Monday
        assert _is_business_day(date(2026, 1, 5), set())

    def test_is_business_day_saturday(self):
        """Saturday is not a business day."""
        from datetime import date
        # 2026-01-03 is a Saturday
        assert not _is_business_day(date(2026, 1, 3), set())

    def test_is_business_day_sunday(self):
        """Sunday is not a business day."""
        from datetime import date
        # 2026-01-04 is a Sunday
        assert not _is_business_day(date(2026, 1, 4), set())

    def test_is_business_day_public_holiday(self):
        """A public holiday weekday is not a business day."""
        from datetime import date
        # 2026-01-01 is a Thursday (New Year's Day)
        assert not _is_business_day(date(2026, 1, 1), {"2026-01-01"})

    def test_payday_regular_month_on_weekday(self):
        """Feb 2026: 25th is a Wednesday — payday is the 25th."""
        from datetime import date
        payday = _payday_for_month(2026, 2, set())
        assert payday == date(2026, 2, 25)

    def test_payday_regular_month_shifts_back_over_weekend(self):
        """Jan 2026: 25th is a Sunday — payday moves back to Friday the 23rd."""
        from datetime import date
        payday = _payday_for_month(2026, 1, set())
        assert payday == date(2026, 1, 23)

    def test_payday_december_christmas_on_25th(self):
        """Dec 2026: 25th is a Friday and is a holiday — start from 23rd."""
        from datetime import date
        # 2026-12-25 is a Friday and is Christmas Day (public holiday)
        holiday_dates = {"2026-12-25"}
        payday = _payday_for_month(2026, 12, holiday_dates)
        # Start from 23rd, which is a Wednesday — that's a business day
        assert payday == date(2026, 12, 23)

    def test_payday_december_no_holiday_on_25th(self):
        """Dec 2026: 25th is a Friday and NOT a holiday — treat as normal (walk back for weekend)."""
        from datetime import date
        # 2026-12-25 is a Friday (no holiday listed)
        payday = _payday_for_month(2026, 12, set())
        # 25th is a Friday, not a weekend or holiday — payday is the 25th
        assert payday == date(2026, 12, 25)

    def test_compute_paydates_returns_12_entries(self):
        """compute_paydates always returns exactly 12 dates."""
        paydates = compute_paydates(2026, SAMPLE_PUBLIC_HOLIDAYS)
        assert len(paydates) == 12

    def test_compute_paydates_format_is_iso(self):
        """All returned dates are valid ISO YYYY-MM-DD strings."""
        from datetime import date
        paydates = compute_paydates(2026, SAMPLE_PUBLIC_HOLIDAYS)
        for d in paydates:
            # date.fromisoformat raises ValueError for invalid formats
            parsed = date.fromisoformat(d)
            assert parsed.year == 2026


# ── paydates endpoint ─────────────────────────────────────────────────────────

class TestGetPaydates:
    """Tests for GET /api/holidays/paydates."""

    def test_returns_12_dates(self, db_client: TestClient):
        """Paydates endpoint returns exactly 12 ISO date strings."""
        mock_ctx = _mock_httpx_client(200, SAMPLE_PUBLIC_HOLIDAYS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx):
            response = db_client.get("/api/holidays/paydates?country=NL&year=2026")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 12

    def test_paydates_are_valid_iso_dates(self, db_client: TestClient):
        """All returned paydates parse as YYYY-MM-DD."""
        from datetime import date
        mock_ctx = _mock_httpx_client(200, SAMPLE_PUBLIC_HOLIDAYS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx):
            response = db_client.get("/api/holidays/paydates?country=NL&year=2026")

        for d in response.json():
            parsed = date.fromisoformat(d)
            assert parsed.year == 2026

    def test_503_when_upstream_unreachable(self, db_client: TestClient):
        """503 is returned when the upstream raises a network exception."""
        mock_ctx = _mock_httpx_client(raise_exc=Exception("network error"))
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx):
            response = db_client.get("/api/holidays/paydates?country=NL&year=2026")

        assert response.status_code == 503

    def test_reuses_cached_public_holidays(self, db_client: TestClient):
        """Paydates endpoint reuses a previously fetched public holiday cache."""
        cache = get_cache()
        mock_ctx = _mock_httpx_client(200, SAMPLE_PUBLIC_HOLIDAYS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx) as mock_cls:
            # Prime the cache via the public holidays endpoint
            db_client.get("/api/holidays/public?country=NL&year=2026")
            # Paydates should hit L1 cache, not upstream
            db_client.get("/api/holidays/paydates?country=NL&year=2026")

        mock_http_client = mock_cls.return_value.__aenter__.return_value
        assert mock_http_client.get.call_count == 1  # upstream called only once
        assert cache.get_holiday("public:NL:2026") is not None


# ── long weekend endpoint ─────────────────────────────────────────────────────

SAMPLE_LONG_WEEKENDS = [
    {
        "startDate": "2026-05-14",
        "endDate": "2026-05-17",
        "dayCount": 4,
        "needBridgeDay": True,
        "bridgeDays": ["2026-05-15"],
    }
]


class TestGetLongWeekends:
    """Tests for GET /api/holidays/longweekend."""

    def test_returns_long_weekend_data(self, db_client: TestClient):
        """Successful upstream call returns JSON array of long weekend periods."""
        mock_ctx = _mock_httpx_client(200, SAMPLE_LONG_WEEKENDS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx):
            response = db_client.get(
                "/api/holidays/longweekend?country=NL&year=2026&availableBridgeDays=1"
            )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["startDate"] == "2026-05-14"
        assert data[0]["bridgeDays"] == ["2026-05-15"]

    def test_no_bridge_days_param_omits_query_param(self, db_client: TestClient):
        """When availableBridgeDays=0, the upstream is called without that param."""
        mock_ctx = _mock_httpx_client(200, [])
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx) as mock_cls:
            db_client.get("/api/holidays/longweekend?country=NL&year=2026")

        mock_http_client = mock_cls.return_value.__aenter__.return_value
        _, call_kwargs = mock_http_client.get.call_args
        assert "availableBridgeDays" not in call_kwargs.get("params", {})

    def test_bridge_days_param_passed_to_upstream(self, db_client: TestClient):
        """availableBridgeDays is forwarded to the upstream as a query param."""
        mock_ctx = _mock_httpx_client(200, SAMPLE_LONG_WEEKENDS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx) as mock_cls:
            db_client.get(
                "/api/holidays/longweekend?country=NL&year=2026&availableBridgeDays=3"
            )

        mock_http_client = mock_cls.return_value.__aenter__.return_value
        _, call_kwargs = mock_http_client.get.call_args
        assert call_kwargs.get("params", {}).get("availableBridgeDays") == "3"

    def test_l1_cached_on_first_request(self, db_client: TestClient):
        """Response is stored in the in-memory cache after the first request."""
        cache = get_cache()
        cache._holiday_entries.pop("longweekend:NL:2026:1", None)

        mock_ctx = _mock_httpx_client(200, SAMPLE_LONG_WEEKENDS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx):
            db_client.get(
                "/api/holidays/longweekend?country=NL&year=2026&availableBridgeDays=1"
            )

        assert cache.get_holiday("longweekend:NL:2026:1") is not None

    def test_l1_cache_hit_skips_upstream(self, db_client: TestClient):
        """Second identical request uses the in-memory cache and skips the upstream."""
        mock_ctx = _mock_httpx_client(200, SAMPLE_LONG_WEEKENDS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx) as mock_cls:
            db_client.get(
                "/api/holidays/longweekend?country=NL&year=2026&availableBridgeDays=1"
            )
            db_client.get(
                "/api/holidays/longweekend?country=NL&year=2026&availableBridgeDays=1"
            )

        mock_http_client = mock_cls.return_value.__aenter__.return_value
        assert mock_http_client.get.call_count == 1

    def test_different_bridge_days_are_cached_separately(self, db_client: TestClient):
        """Requests with different availableBridgeDays values are cached independently."""
        cache = get_cache()
        ctx1 = _mock_httpx_client(200, SAMPLE_LONG_WEEKENDS)
        ctx2 = _mock_httpx_client(200, [])

        with patch("app.routers.holidays.httpx.AsyncClient", side_effect=[ctx1, ctx2]):
            db_client.get(
                "/api/holidays/longweekend?country=NL&year=2026&availableBridgeDays=1"
            )
            db_client.get(
                "/api/holidays/longweekend?country=NL&year=2026&availableBridgeDays=2"
            )

        assert cache.get_holiday("longweekend:NL:2026:1") is not None
        assert cache.get_holiday("longweekend:NL:2026:2") is not None

    def test_503_when_upstream_error_status(self, db_client: TestClient):
        """503 is returned when the upstream responds with a non-2xx status."""
        mock_ctx = _mock_httpx_client(500)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx):
            response = db_client.get(
                "/api/holidays/longweekend?country=NL&year=2026&availableBridgeDays=1"
            )

        assert response.status_code == 503

    def test_503_when_upstream_unreachable(self, db_client: TestClient):
        """503 is returned when the upstream raises a network exception."""
        mock_ctx = _mock_httpx_client(raise_exc=Exception("network error"))
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx):
            response = db_client.get(
                "/api/holidays/longweekend?country=NL&year=2026&availableBridgeDays=1"
            )

        assert response.status_code == 503

    def test_upstream_url_uses_nager_longweekend_path(self, db_client: TestClient):
        """The upstream request targets the Nager.Date LongWeekend endpoint."""
        mock_ctx = _mock_httpx_client(200, [])
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx) as mock_cls:
            db_client.get("/api/holidays/longweekend?country=NL&year=2026")

        mock_http_client = mock_cls.return_value.__aenter__.return_value
        call_args, _ = mock_http_client.get.call_args
        assert "LongWeekend/2026/NL" in call_args[0]