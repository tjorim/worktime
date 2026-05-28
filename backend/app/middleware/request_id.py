"""Request ID middleware for per-request correlation and structured access logging.

Each request receives a unique identifier — either forwarded from the incoming
``X-Request-ID`` header (useful when a gateway already assigned one) or generated
as a new UUID4.  The ID is stored on ``request.state.request_id`` so route
handlers and dependencies can include it in error responses or downstream calls,
and is echoed as ``X-Request-ID`` on every response.

A structured access log line is emitted after each response using the
``worktime.access`` logger so that backend logs can be correlated with frontend
errors using the shared request ID.

Log format per request::

    GET /api/health 200 12.345ms req_id=<uuid> user=-
"""

import logging
import time
import uuid

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

REQUEST_ID_HEADER = "X-Request-ID"

logger = logging.getLogger("worktime.access")


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Accept or generate a correlation ID; echo it; emit a structured access log."""

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get(REQUEST_ID_HEADER) or str(uuid.uuid4())
        request.state.request_id = request_id

        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            elapsed_ms = (time.perf_counter() - start) * 1000
            user_id = getattr(request.state, "user_id", None)
            logger.info(
                "%s %s 500 %.3fms req_id=%s user=%s",
                request.method,
                request.url.path,
                elapsed_ms,
                request_id,
                user_id if user_id is not None else "-",
            )
            raise

        elapsed_ms = (time.perf_counter() - start) * 1000
        response.headers[REQUEST_ID_HEADER] = request_id

        user_id = getattr(request.state, "user_id", None)
        logger.info(
            "%s %s %d %.3fms req_id=%s user=%s",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
            request_id,
            user_id if user_id is not None else "-",
        )
        return response
