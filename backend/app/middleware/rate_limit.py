"""Per-client-IP rate limiting for the public API, via slowapi."""

import ipaddress

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.requests import Request
from starlette.responses import Response

from ..config import settings


def _peer_is_trusted_proxy(request: Request) -> bool:
    """Whether the immediate TCP peer looks like an internal reverse proxy.

    ``worktime-api`` is only ``expose``d (not published) on the infra Docker
    network today, so Caddy should be the only thing that can ever connect
    directly — but that's a network-topology assumption, not something this
    process can verify on its own. Require the peer to be on a private
    address before trusting a client-supplied ``X-Real-IP`` header, so a
    request landing here some other way (a network misconfiguration, or a
    peer sharing the same Docker network) can't set an arbitrary key and get
    a fresh rate-limit bucket on every request.
    """
    if not request.client or not request.client.host:
        return False
    try:
        return ipaddress.ip_address(request.client.host).is_private
    except ValueError:
        return False


def get_client_ip(request: Request) -> str:
    """Return the client IP, preferring the ``X-Real-IP`` header set by Caddy.

    slowapi's built-in key functions read either ``request.client.host`` (the
    reverse proxy's own address behind Caddy, which would bucket every real
    client together) or a malformed ``X-Forwarded-For`` lookup. Caddy already
    resolves the true client IP (trusting Cloudflare's edge) and forwards it
    via ``X-Real-IP``, so prefer that — but only when the request actually
    came from a trusted internal peer; a header from anyone else is
    caller-controlled and must not be trusted for rate-limit bucketing.
    """
    real_ip = request.headers.get("x-real-ip")
    if real_ip and _peer_is_trusted_proxy(request):
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
