"""Timing middleware for measuring total request duration.

This middleware captures the total time taken to process each request,
adds it as a custom response header, and records it in the in-memory
request metrics collector.
"""

import logging
import time

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from ..core.observability import request_metrics

logger = logging.getLogger(__name__)


class TimingMiddleware(BaseHTTPMiddleware):
    """Middleware to measure and report total request processing time.

    Adds an ``X-Total-Ms`` header to all responses containing the total
    request processing time in milliseconds with high precision, and feeds
    the duration and status code into the :data:`~app.core.observability.request_metrics`
    singleton for the ``/api/metrics`` endpoint.
    """

    async def dispatch(self, request: Request, call_next):
        """Process request and measure timing.

        Args:
            request: The incoming HTTP request
            call_next: The next middleware or endpoint handler

        Returns:
            Response with X-Total-Ms header added
        """
        # Capture start time with high precision
        start_time = time.perf_counter()

        # Process the request
        response = await call_next(request)

        # Calculate elapsed time in milliseconds
        elapsed_time = time.perf_counter() - start_time
        elapsed_ms = elapsed_time * 1000

        # Add timing header to response
        response.headers["X-Total-Ms"] = f"{elapsed_ms:.3f}"

        # Feed into rolling metrics window
        request_metrics.record(elapsed_ms, response.status_code)

        return response
