"""Per-client-IP REST limits using public FastAPI/limits APIs."""

from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.config import settings
from app.request_limits import RateLimitExceeded, RequestRateLimiter
from app.request_limits import get_client_ip as get_client_ip

limiter = RequestRateLimiter(settings.RATE_LIMIT_DEFAULT, enabled=settings.RATE_LIMIT_ENABLED)


async def rate_limit(request: Request) -> None:
    request.app.state.limiter.check(request)


def handle_rate_limit_exceeded(request: Request, exc: Exception) -> Response:
    if not isinstance(exc, RateLimitExceeded):
        raise exc
    return JSONResponse(
        {"error": f"Rate limit exceeded: {exc.detail}", "code": "rate_limited"},
        status_code=429,
        headers={**exc.headers, "Cache-Control": "no-store"},
    )
