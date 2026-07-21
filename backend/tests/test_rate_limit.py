"""Tests for the per-client-IP rate limiting middleware (app.middleware.rate_limit)."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.requests import Request

from app.middleware.rate_limit import get_client_ip, handle_rate_limit_exceeded


def _build_app(*, limit: str = "2/minute", enabled: bool = True) -> FastAPI:
    """Build a throwaway app wired the same way as the real one, but with a tiny limit."""
    limiter = Limiter(key_func=get_client_ip, default_limits=[limit], enabled=enabled)
    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, handle_rate_limit_exceeded)
    app.add_middleware(SlowAPIMiddleware)

    @app.get("/ping")
    async def ping():
        return {"ok": True}

    @app.get("/health")
    @limiter.exempt
    async def health():
        return {"ok": True}

    return app


def test_requests_within_limit_succeed():
    client = TestClient(_build_app())
    assert client.get("/ping").status_code == 200
    assert client.get("/ping").status_code == 200


def test_requests_over_limit_are_rejected_with_429():
    client = TestClient(_build_app())
    assert client.get("/ping").status_code == 200
    assert client.get("/ping").status_code == 200

    response = client.get("/ping")

    assert response.status_code == 429
    assert "Rate limit exceeded" in response.json()["error"]


def test_exempt_route_is_never_limited():
    client = TestClient(_build_app())
    for _ in range(5):
        assert client.get("/health").status_code == 200


def test_disabled_limiter_never_rejects():
    client = TestClient(_build_app(enabled=False))
    for _ in range(5):
        assert client.get("/ping").status_code == 200


def test_different_client_ips_get_independent_buckets():
    # TestClient's default simulated peer is the string "testclient", not an
    # IP, so it would never pass the trusted-proxy check on its own. Pin it
    # to a private address to simulate "arrived via Caddy" and vary
    # X-Real-IP per request to simulate different real clients behind it.
    client = TestClient(_build_app(), client=("172.20.0.2", 12345))
    assert client.get("/ping", headers={"X-Real-IP": "1.1.1.1"}).status_code == 200
    assert client.get("/ping", headers={"X-Real-IP": "1.1.1.1"}).status_code == 200
    assert client.get("/ping", headers={"X-Real-IP": "1.1.1.1"}).status_code == 429

    # A different client IP draws from its own, untouched bucket.
    assert client.get("/ping", headers={"X-Real-IP": "2.2.2.2"}).status_code == 200


def test_get_client_ip_prefers_x_real_ip_header():
    """Behind Caddy, request.client.host is Caddy's own address, not the real client's."""
    scope = {
        "type": "http",
        "headers": [(b"x-real-ip", b"9.9.9.9")],
        "client": ("127.0.0.1", 12345),
    }
    request = Request(scope)

    assert get_client_ip(request) == "9.9.9.9"


def test_get_client_ip_falls_back_to_request_client():
    scope = {"type": "http", "headers": [], "client": ("10.0.0.5", 12345)}
    request = Request(scope)

    assert get_client_ip(request) == "10.0.0.5"


def test_get_client_ip_ignores_x_real_ip_from_untrusted_public_peer():
    """A caller reaching the app directly (bypassing Caddy) can't spoof X-Real-IP.

    If the request didn't come from a private-network peer, the header is
    attacker-controlled — trusting it would let a single caller draw a fresh
    rate-limit bucket on every request by varying the header value.
    """
    scope = {
        "type": "http",
        "headers": [(b"x-real-ip", b"9.9.9.9")],
        "client": ("8.8.8.8", 12345),
    }
    request = Request(scope)

    assert get_client_ip(request) == "8.8.8.8"
