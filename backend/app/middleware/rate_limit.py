"""Per-client-IP rate limiting for the public API, via slowapi."""

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.requests import Request
from starlette.responses import Response

from ..config import settings


def get_client_ip(request: Request) -> str:
    """Return the client IP, preferring the ``X-Real-IP`` header set by Caddy.

    slowapi's built-in key functions read either ``request.client.host`` (the
    reverse proxy's own address behind Caddy, which would bucket every real
    client together) or a malformed ``X-Forwarded-For`` lookup. Caddy already
    resolves the true client IP (trusting Cloudflare's edge) and forwards it
    via ``X-Real-IP``, so prefer that and fall back to ``request.client.host``
    for local development without a proxy in front.
    """
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


limiter = Limiter(
    key_func=get_client_ip,
    default_limits=[settings.RATE_LIMIT_DEFAULT],
    enabled=settings.RATE_LIMIT_ENABLED,
    headers_enabled=True,
)


def handle_rate_limit_exceeded(request: Request, exc: Exception) -> Response:
    """Adapt slowapi's handler to Starlette's ``ExceptionHandler`` signature.

    ``app.add_exception_handler`` types the handler's second parameter as the
    base ``Exception``, while slowapi's own handler narrows it to
    ``RateLimitExceeded``. Starlette only invokes this for that registered
    exception type, so the isinstance check just satisfies the type checker.
    """
    if not isinstance(exc, RateLimitExceeded):
        raise exc
    return _rate_limit_exceeded_handler(request, exc)
