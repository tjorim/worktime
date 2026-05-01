"""In-memory request metrics tracking for the Worktime backend.

Provides a thread-safe rolling-window metrics collector that is updated by
``TimingMiddleware`` on every request and exposed via the ``/api/metrics`` endpoint.
"""

import statistics
import time
from collections import deque
from threading import Lock


class InMemoryRequestMetrics:
    """Thread-safe, rolling-window request metrics collector.

    Tracks request counts, error rates, and latency percentiles over a
    configurable sliding time window.  The singleton ``request_metrics`` is
    imported by :class:`~app.middleware.timing.TimingMiddleware` and the
    metrics router.

    Args:
        window_seconds: Length of the rolling window in seconds (default 60).
    """

    def __init__(self, window_seconds: int = 60) -> None:
        self._start_time: float = time.time()
        self._window_seconds: int = window_seconds
        self._lock: Lock = Lock()
        # Each entry: (timestamp_seconds, duration_ms, http_status_code)
        self._entries: deque[tuple[float, float, int]] = deque()

    def record(self, duration_ms: float, status_code: int) -> None:
        """Record a completed request.

        Args:
            duration_ms: Total request duration in milliseconds.
            status_code: HTTP response status code.
        """
        now = time.time()
        with self._lock:
            self._entries.append((now, duration_ms, status_code))
            self._prune(now)

    def _prune(self, now: float) -> None:
        """Remove entries older than the rolling window.

        Must be called with ``_lock`` already held.
        """
        cutoff = now - self._window_seconds
        while self._entries and self._entries[0][0] < cutoff:
            self._entries.popleft()

    def snapshot(self) -> dict:
        """Return a point-in-time metrics snapshot.

        Returns:
            dict with the following keys:

            - ``uptime_seconds``: Seconds since process start.
            - ``request_rate_per_second``: Requests / window_seconds.
            - ``error_rate``: Fraction of 5xx responses in the window (0–1).
            - ``latency_p50_ms``: Median response time in milliseconds.
            - ``latency_p99_ms``: 99th-percentile response time in milliseconds.
            - ``window_seconds``: The configured window length.
            - ``request_count_in_window``: Absolute count of requests in the window.
        """
        now = time.time()
        with self._lock:
            self._prune(now)
            entries = list(self._entries)

        uptime_seconds = now - self._start_time
        count = len(entries)
        error_count = sum(1 for _, _, s in entries if s >= 500)
        latencies = [d for _, d, _ in entries]

        request_rate = count / self._window_seconds
        error_rate = error_count / count if count > 0 else 0.0

        if latencies:
            p50 = statistics.median(latencies)
            p99 = statistics.quantiles(latencies, n=100)[98] if len(latencies) >= 2 else latencies[0]
        else:
            p50 = 0.0
            p99 = 0.0

        return {
            "uptime_seconds": round(uptime_seconds, 3),
            "request_rate_per_second": round(request_rate, 4),
            "error_rate": round(error_rate, 4),
            "latency_p50_ms": round(p50, 3),
            "latency_p99_ms": round(p99, 3),
            "window_seconds": self._window_seconds,
            "request_count_in_window": count,
        }


# Module-level singleton shared between TimingMiddleware and the metrics router.
request_metrics = InMemoryRequestMetrics()
