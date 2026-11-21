# Observability Contract

This document describes the observability guarantees that apply to every HTTP request handled by the Worktime backend. **Any new route must be added through the standard FastAPI router so it automatically inherits this contract.**

---

## X-Request-ID

| Behaviour | Detail |
|---|---|
| **Generation** | If the incoming request carries no `X-Request-ID` header, `RequestIdMiddleware` generates a UUID4 and assigns it. |
| **Propagation** | If the incoming request supplies `X-Request-ID`, that value is used unchanged. |
| **Echo** | Every response carries `X-Request-ID` in its headers regardless of status code. The 500 for an unhandled exception is sent by Starlette's outermost `ServerErrorMiddleware` after the middleware has unwound; `handle_unhandled_exception` (`app/core/errors.py`) attaches the id from `request.state` there. |
| **Scope** | The ID is stored in `scope["state"]["request_id"]` (accessible via `request.state.request_id` in route handlers). |
| **CORS** | `X-Request-ID` is listed in both `allow_headers` (clients may send it) and `expose_headers` (browsers may read it). |

---

## Middleware Stack

```
RequestIdMiddleware   ← outermost: sets/echoes X-Request-ID, emits access log
  TimingMiddleware    ← sets X-Total-Ms, records request_metrics
    CORSMiddleware
      route handler
```

`RequestIdMiddleware` is pure ASGI (not `BaseHTTPMiddleware`) to avoid response-buffering issues with SSE and Sentry context-var isolation.

---

## Structured Access Log

Every request emits one log line via the `worktime.access` logger after the response is sent. The line follows the layout shared by all apps, `asctime - logger - level - message`, and the message is a one-line JSON object:

```
2026-11-21 10:15:02,123 - worktime.access - INFO - {"event":"http_request","request_id":"550e8400-e29b-41d4-a716-446655440000","user_id":42,"auth_type":"keycloak_user","method":"GET","route":"/ical/{token}.ics","status_code":200,"latency_ms":12.35}
```

### Log fields

| Field | Notes |
|---|---|
| `event` | Always `http_request`. |
| `request_id` | The caller's `X-Request-ID` when it is 1-128 characters of `A-Za-z0-9._:-`, otherwise a generated UUID4 (anything else could forge log lines). |
| `user_id` | Local user ID when authenticated; `null` otherwise. |
| `auth_type` | `keycloak_user`, `keycloak_service` or `delegated` (personal access token); `null` when unauthenticated. |
| `method`, `status_code`, `latency_ms` | Standard access log fields. |
| `route` | The route template (for example `/ical/{token}.ics`), never the raw path or the query string, so calendar feed tokens and ids stay out of the logs. It is the path as the router declares it, without the `/api` prefix. |

Level: 5xx are logged as errors, 4xx as warnings, everything else as info. `current_request_id` (a context variable in `app.middleware.request_id`) holds the id for code that logs below a request.

---

## Timing Header

`X-Total-Ms` is set by `TimingMiddleware` on every response. It reflects wall-clock time inside the middleware stack (excluding `RequestIdMiddleware` overhead). Exposed via CORS `expose_headers` so browsers can read it.

---

## Health Endpoints

| Endpoint | Auth | Behaviour |
|---|---|---|
| `GET /api/health/liveness` | None | Returns `{"status": "alive"}` immediately. |
| `GET /api/health/readiness` | None | Checks the database (PostgreSQL gets a 2 s statement timeout) and the OIDC provider. Returns `ok` with 200 or `degraded` with 503, plus `auth` and `database` (`ok` or `unreachable`). |
| `GET /api/health` | None | Returns `status`, `version`, `commit` and the two probe paths (`liveness_endpoint`, `readiness_endpoint`; `links` repeats them for older readers). Used by the image `HEALTHCHECK`. |

Use `/api/health/readiness` for load-balancer health checks — not liveness.

---

## Metrics Endpoint

| Endpoint | Auth |
|---|---|
| `GET /api/metrics` | `X-Metrics-Secret` header (HMAC constant-time comparison) |

Returns in-process counters: uptime, request total, error total, request rate, error rate, and latency stats.

**Important:** metrics are **process-local** and reset on every restart. Not aggregated across workers.

---

## Error Tracking (Sentry)

Sentry is initialised at startup if `SENTRY_DSN` is set (optional install: `uv add sentry-sdk[fastapi]`). `send_default_pii=False` is hardcoded — IP addresses and cookies are never captured.

---

## Frontend Error Correlation

`getRequestId(response)` in `frontend/src/lib/api/apiClient.ts` reads the `X-Request-ID` header. The 401 and 403 error messages include the request ID:

```
Unauthorized (request-id: 3fa85f64-…)
```

---

## Profiling

To find out *why* a request identified by `X-Request-ID` and `Server-Timing` is slow, profile it locally with the standard-library sampling profiler. See [PROFILING.md](PROFILING.md).

---

## Adding a New Route — Checklist

- [ ] Route is added via `app.include_router(...)` — not via `app.mount()` with a sub-app that bypasses middleware.
- [ ] If the route accepts credentials in a query parameter, verify that `scope["path"]` (not `scope["query_string"]`) is what gets logged.
- [ ] If the route introduces a new auth mechanism, ensure it sets `request.state.user_id` and `request.state.auth_type` so access logs are complete.
- [ ] High-impact mutations (data import/export, account operations) write to the audit log — see `app/routers/audit.py`.
