"""Request metrics endpoint schemas."""

from __future__ import annotations

from app.schemas.base import ResponseModel


class RequestMetricsSnapshot(ResponseModel):
    """Rolling-window request metrics from ``GET /api/metrics``."""

    uptime_seconds: float
    request_rate_per_second: float
    error_rate: float
    latency_p50_ms: float
    latency_p99_ms: float
    window_seconds: int
    request_count_in_window: int
