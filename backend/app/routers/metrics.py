"""HMAC-protected metrics endpoint.

Returns a snapshot of in-memory request metrics: uptime, request rate,
error rate, and latency percentiles (p50/p99).

Authentication
--------------
Clients must supply an ``X-Metrics-Token`` header whose value is a
colon-delimited string ``<timestamp>:<signature>`` where:

- ``timestamp`` is a Unix epoch integer (seconds).
- ``signature`` is ``HMAC-SHA256(METRICS_HMAC_SECRET, str(timestamp))``
  encoded as a lowercase hex string.

The server rejects tokens whose timestamp is more than 60 seconds old or
in the future, preventing replay attacks while tolerating reasonable
clock skew.

When ``METRICS_HMAC_SECRET`` is empty (the default) the endpoint returns
``404 Not Found`` so that it is invisible to automated scanners.
"""

import hashlib
import hmac
import logging
import time

from fastapi import APIRouter, Header, status
from fastapi.responses import JSONResponse

from ..config import settings
from ..core.observability import request_metrics

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Metrics"])

_MAX_TOKEN_AGE_SECONDS = 60


def _verify_token(token: str, secret: str) -> bool:
    """Verify an HMAC metrics token.

    Args:
        token: ``<timestamp>:<hex-signature>`` string from the request header.
        secret: The configured ``METRICS_HMAC_SECRET``.

    Returns:
        ``True`` if the token is valid and within the allowed time window.
    """
    try:
        ts_str, provided_sig = token.split(":", 1)
        ts = int(ts_str)
    except (ValueError, AttributeError):
        return False

    # Reject tokens that are too old or in the future.
    now = int(time.time())
    if abs(now - ts) > _MAX_TOKEN_AGE_SECONDS:
        return False

    expected_sig = hmac.new(secret.encode(), ts_str.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected_sig, provided_sig)


@router.get("/metrics")
async def get_metrics(
    x_metrics_token: str | None = Header(default=None),
) -> JSONResponse:
    """Return in-memory request metrics (HMAC-protected).

    Returns a rolling-window snapshot of request throughput and latency.

    Requires a valid ``X-Metrics-Token`` header — see module docstring for
    the token format.  Returns ``404`` when ``METRICS_HMAC_SECRET`` is not
    configured and ``403`` when the token is missing or invalid.

    Returns:
        JSONResponse containing:

        - ``uptime_seconds``: Seconds the process has been running.
        - ``request_rate_per_second``: Requests per second in the window.
        - ``error_rate``: Fraction of 5xx responses in the window (0–1).
        - ``latency_p50_ms``: Median response latency in milliseconds.
        - ``latency_p99_ms``: 99th-percentile response latency in milliseconds.
        - ``window_seconds``: Rolling window duration.
        - ``request_count_in_window``: Total requests counted in the window.
    """
    secret = settings.METRICS_HMAC_SECRET.strip()

    # If no secret is configured, treat the endpoint as non-existent.
    if not secret:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": "Not Found"},
        )

    if not x_metrics_token or not _verify_token(x_metrics_token, secret):
        logger.warning("Metrics: rejected request with invalid or missing token")
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": "Forbidden"},
        )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=request_metrics.snapshot(),
    )
