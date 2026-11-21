"""Request correlation: an ``X-Request-ID`` on every response and one structured access-log line per request.

The id is the caller's ``X-Request-ID`` when it is a short token of letters, digits and ``._:-`` (a gateway or the
frontend may already have assigned one), otherwise a new UUID4; anything else would let a caller forge log lines. It is
stored on ``request.state.request_id`` and in ``current_request_id`` for code that logs below a request, and echoed as
``X-Request-ID`` on every response, so backend logs can be correlated with frontend errors.

The access line is JSON on the ``worktime.access`` logger with the field names the other apps use (``event``,
``request_id``, ``user_id``, ``auth_type``, ``method``, ``route``, ``status_code``, ``latency_ms``)::

    {"event":"http_request","request_id":"...","user_id":42,"auth_type":"keycloak_user","method":"GET",
     "route":"/api/health","status_code":200,"latency_ms":1.23}

``route`` is the route template as FastAPI routes it, never the raw path or query string, which can carry calendar feed
tokens and ids. 5xx log as errors, 4xx as warnings, the rest as info.

Pure ASGI: no ``BaseHTTPMiddleware`` overhead, no context-var isolation (which breaks Sentry) and no buffering of
streamed (SSE) responses. The 500 for an unhandled exception is sent by Starlette's outermost ``ServerErrorMiddleware``
after this middleware has unwound, so ``handle_unhandled_exception`` (``app.core.errors``) adds the id from
``request.state`` itself; the access line records the 500 too.
"""

import json
import logging
import re
import time
import uuid
from contextvars import ContextVar

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.logging import ACCESS_LOGGER
from app.middleware.request_timing import _route_template

REQUEST_ID_HEADER = "X-Request-ID"
_VALID_REQUEST_ID = re.compile(r"[A-Za-z0-9._:-]{1,128}")

logger = logging.getLogger(ACCESS_LOGGER)

current_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)


def _request_id(headers: Headers) -> str:
    supplied = headers.get(REQUEST_ID_HEADER)
    if supplied is not None and _VALID_REQUEST_ID.fullmatch(supplied):
        return supplied
    return str(uuid.uuid4())


class RequestIdMiddleware:
    """Accept or generate a correlation ID; echo it; emit a structured access log."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = _request_id(Headers(scope=scope))
        scope.setdefault("state", {})["request_id"] = request_id
        token = current_request_id.set(request_id)
        root_path = scope.get("root_path", "")
        started = time.perf_counter()
        status = 500  # an exception that escapes before a response starts is answered with a 500

        async def send_with_id(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                headers = MutableHeaders(raw=list(message.get("headers", [])))
                headers[REQUEST_ID_HEADER] = request_id
                message = {**message, "headers": headers.raw}
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            current_request_id.reset(token)
            level = logging.ERROR if status >= 500 else logging.WARNING if status >= 400 else logging.INFO
            if logger.isEnabledFor(level):
                state = scope["state"]
                logger.log(
                    level,
                    json.dumps(
                        {
                            "event": "http_request",
                            "request_id": request_id,
                            "user_id": state.get("user_id"),
                            "auth_type": state.get("auth_type"),
                            "method": scope["method"],
                            "route": _route_template(scope, root_path),
                            "status_code": status,
                            "latency_ms": round((time.perf_counter() - started) * 1000, 2),
                        },
                        separators=(",", ":"),
                    ),
                )
