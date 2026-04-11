"""Tests for holiday proxy endpoints."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.cache.store import get_cache
from app.config import settings
from app.main import app


@pytest.fixture
def client():
    """Create a test client for the FastAPI application."""
    return TestClient(app)


# ── sample upstream payloads ──────────────────────────────────────────────────

SAMPLE_PUBLIC_HOLIDAYS = [
    {
        "id": "ph-nl-2026-01",
        "startDate": "2026-01-01",
        "endDate": "2026-01-01",
        "type": "Public",
        "name": [{"language": "EN", "text": "New Year's Day"}, {"language": "NL", "text": "Nieuwjaarsdag"}],
        "regionalScope": "National",
        "temporalScope": "FullDay",
        "nationwide": True,
    }
]

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

    def test_returns_holiday_data(self, client):
        """Successful upstream call returns JSON array."""
        mock_ctx = _mock_httpx_client(200, SAMPLE_PUBLIC_HOLIDAYS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx):
            response = client.get("/api/holidays/public?country=NL&year=2026&language=EN")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["id"] == "ph-nl-2026-01"

    def test_upstream_called_with_correct_params(self, client):
        """Upstream API receives the expected OpenHolidays query parameters."""
        mock_ctx = _mock_httpx_client(200, SAMPLE_PUBLIC_HOLIDAYS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx) as mock_cls:
            client.get("/api/holidays/public?country=NL&year=2026&language=EN")

        mock_http_client = mock_cls.return_value.__aenter__.return_value
        call_kwargs = mock_http_client.get.call_args
        assert call_kwargs is not None
        params = call_kwargs.kwargs["params"]
        assert params["countryIsoCode"] == "NL"
        assert params["validFrom"] == "2026-01-01"
        assert params["validTo"] == "2026-12-31"
        assert params["languageIsoCode"] == "EN"

    def test_cached_on_first_request(self, client):
        """Response is stored in cache after first upstream fetch."""
        cache = get_cache()
        mock_ctx = _mock_httpx_client(200, SAMPLE_PUBLIC_HOLIDAYS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx):
            client.get("/api/holidays/public?country=NL&year=2026&language=EN")

        entry = cache.get_holiday("public:NL:2026:EN")
        assert entry is not None
        assert entry.data == SAMPLE_PUBLIC_HOLIDAYS

    def test_cache_hit_skips_upstream(self, client):
        """Second request for identical params does not hit openholidaysapi.org."""
        mock_ctx = _mock_httpx_client(200, SAMPLE_PUBLIC_HOLIDAYS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx) as mock_cls:
            client.get("/api/holidays/public?country=NL&year=2026&language=EN")
            client.get("/api/holidays/public?country=NL&year=2026&language=EN")

        mock_http_client = mock_cls.return_value.__aenter__.return_value
        assert mock_http_client.get.call_count == 1

    def test_503_when_upstream_error_status(self, client):
        """503 is returned when the upstream responds with a non-2xx status."""
        mock_ctx = _mock_httpx_client(500)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx):
            response = client.get("/api/holidays/public?country=NL&year=2026&language=EN")

        assert response.status_code == 503
        assert "detail" in response.json()

    def test_503_when_upstream_unreachable(self, client):
        """503 is returned when the upstream raises a network exception."""
        mock_ctx = _mock_httpx_client(raise_exc=Exception("connection refused"))
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx):
            response = client.get("/api/holidays/public?country=NL&year=2026&language=EN")

        assert response.status_code == 503
        assert "detail" in response.json()

    def test_different_params_produce_different_cache_entries(self, client):
        """Requests with different countries are cached independently."""
        cache = get_cache()
        nl_ctx = _mock_httpx_client(200, SAMPLE_PUBLIC_HOLIDAYS)
        be_data = [{"id": "ph-be-2026-01", "startDate": "2026-01-01"}]
        be_ctx = _mock_httpx_client(200, be_data)

        with patch("app.routers.holidays.httpx.AsyncClient", side_effect=[nl_ctx, be_ctx]):
            client.get("/api/holidays/public?country=NL&year=2026&language=EN")
            client.get("/api/holidays/public?country=BE&year=2026&language=EN")

        assert cache.get_holiday("public:NL:2026:EN") is not None
        assert cache.get_holiday("public:BE:2026:EN") is not None

    def test_no_cache_when_cache_disabled(self, client, monkeypatch):
        """When CACHE_ENABLED=False, every request hits upstream."""
        monkeypatch.setattr(settings, "CACHE_ENABLED", False)
        mock_ctx = _mock_httpx_client(200, SAMPLE_PUBLIC_HOLIDAYS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx) as mock_cls:
            client.get("/api/holidays/public?country=NL&year=2026&language=EN")
            client.get("/api/holidays/public?country=NL&year=2026&language=EN")

        mock_http_client = mock_cls.return_value.__aenter__.return_value
        assert mock_http_client.get.call_count == 2

    def test_default_language_is_en(self, client):
        """language parameter defaults to EN when omitted."""
        mock_ctx = _mock_httpx_client(200, SAMPLE_PUBLIC_HOLIDAYS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx) as mock_cls:
            client.get("/api/holidays/public?country=NL&year=2026")

        mock_http_client = mock_cls.return_value.__aenter__.return_value
        params = mock_http_client.get.call_args.kwargs["params"]
        assert params["languageIsoCode"] == "EN"


# ── school holidays ───────────────────────────────────────────────────────────

class TestGetSchoolHolidays:
    """Tests for GET /api/holidays/school."""

    def test_returns_holiday_data(self, client):
        """Successful upstream call returns JSON array."""
        mock_ctx = _mock_httpx_client(200, SAMPLE_SCHOOL_HOLIDAYS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx):
            response = client.get(
                "/api/holidays/school?country=NL&year=2026&language=EN&subdivision=NL-NH"
            )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["id"] == "sh-nl-nh-2026-01"

    def test_upstream_called_with_subdivision(self, client):
        """Upstream API receives subdivisionCode when provided."""
        mock_ctx = _mock_httpx_client(200, SAMPLE_SCHOOL_HOLIDAYS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx) as mock_cls:
            client.get(
                "/api/holidays/school?country=NL&year=2026&language=EN&subdivision=NL-NH"
            )

        mock_http_client = mock_cls.return_value.__aenter__.return_value
        params = mock_http_client.get.call_args.kwargs["params"]
        assert params["countryIsoCode"] == "NL"
        assert params["validFrom"] == "2026-01-01"
        assert params["validTo"] == "2026-12-31"
        assert params["languageIsoCode"] == "EN"
        assert params["subdivisionCode"] == "NL-NH"

    def test_upstream_called_without_subdivision(self, client):
        """Upstream API omits subdivisionCode when not provided."""
        mock_ctx = _mock_httpx_client(200, SAMPLE_SCHOOL_HOLIDAYS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx) as mock_cls:
            client.get("/api/holidays/school?country=NL&year=2026")

        mock_http_client = mock_cls.return_value.__aenter__.return_value
        params = mock_http_client.get.call_args.kwargs["params"]
        assert "subdivisionCode" not in params

    def test_cached_on_first_request(self, client):
        """Response is stored in cache after first upstream fetch."""
        cache = get_cache()
        mock_ctx = _mock_httpx_client(200, SAMPLE_SCHOOL_HOLIDAYS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx):
            client.get(
                "/api/holidays/school?country=NL&year=2026&language=EN&subdivision=NL-NH"
            )

        entry = cache.get_holiday("school:NL:2026:EN:NL-NH")
        assert entry is not None
        assert entry.data == SAMPLE_SCHOOL_HOLIDAYS

    def test_cache_hit_skips_upstream(self, client):
        """Second request for identical params does not hit openholidaysapi.org."""
        mock_ctx = _mock_httpx_client(200, SAMPLE_SCHOOL_HOLIDAYS)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx) as mock_cls:
            client.get(
                "/api/holidays/school?country=NL&year=2026&language=EN&subdivision=NL-NH"
            )
            client.get(
                "/api/holidays/school?country=NL&year=2026&language=EN&subdivision=NL-NH"
            )

        mock_http_client = mock_cls.return_value.__aenter__.return_value
        assert mock_http_client.get.call_count == 1

    def test_503_when_upstream_error_status(self, client):
        """503 is returned when the upstream responds with a non-2xx status."""
        mock_ctx = _mock_httpx_client(500)
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx):
            response = client.get(
                "/api/holidays/school?country=NL&year=2026&language=EN&subdivision=NL-NH"
            )

        assert response.status_code == 503

    def test_503_when_upstream_unreachable(self, client):
        """503 is returned when the upstream raises a network exception."""
        mock_ctx = _mock_httpx_client(raise_exc=Exception("network error"))
        with patch("app.routers.holidays.httpx.AsyncClient", return_value=mock_ctx):
            response = client.get(
                "/api/holidays/school?country=NL&year=2026&language=EN&subdivision=NL-NH"
            )

        assert response.status_code == 503

    def test_subdivision_creates_separate_cache_key(self, client):
        """Requests with different subdivisions are cached independently."""
        cache = get_cache()
        nh_ctx = _mock_httpx_client(200, SAMPLE_SCHOOL_HOLIDAYS)
        zh_data = [{"id": "sh-nl-zh-2026-01"}]
        zh_ctx = _mock_httpx_client(200, zh_data)

        with patch("app.routers.holidays.httpx.AsyncClient", side_effect=[nh_ctx, zh_ctx]):
            client.get(
                "/api/holidays/school?country=NL&year=2026&language=EN&subdivision=NL-NH"
            )
            client.get(
                "/api/holidays/school?country=NL&year=2026&language=EN&subdivision=NL-ZH"
            )

        assert cache.get_holiday("school:NL:2026:EN:NL-NH") is not None
        assert cache.get_holiday("school:NL:2026:EN:NL-ZH") is not None
