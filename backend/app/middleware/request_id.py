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

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Receive, Scope, Send

REQUEST_ID_HEADER = "X-Request-ID"

logger = logging.getLogger("worktime.access")


class RequestIdMiddleware:
    """Accept or generate a correlation ID; echo it; emit a structured access log.

    Pure ASGI middleware — avoids BaseHTTPMiddleware overhead, contextvars
    isolation (which breaks Sentry), and streaming response (SSE) buffering.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        request_id = headers.get(REQUEST_ID_HEADER) or str(uuid.uuid4())

        scope.setdefault("state", {})
        scope["state"]["request_id"] = request_id

        start = time.perf_counter()
        status_code = 500

        async def send_wrapper(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                headers = list(message.get("headers", []))
                MutableHeaders(raw=headers)[REQUEST_ID_HEADER] = request_id
                message["headers"] = headers
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            status_code = 500
            raise
        finally:
            elapsed_ms = (time.perf_counter() - start) * 1000
            user_id = scope["state"].get("user_id")
            auth_type = scope["state"].get("auth_type")
            logger.info(
                "%s %s %d %.3fms req_id=%s user=%s auth=%s",
                scope["method"],
                scope["path"],
                status_code,
                elapsed_ms,
                request_id,
                user_id if user_id is not None else "-",
                auth_type if auth_type is not None else "-",
            )
