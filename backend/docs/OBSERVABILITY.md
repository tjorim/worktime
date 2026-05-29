# Observability Contract

This document describes the observability guarantees that apply to every HTTP request handled by the Worktime backend. **Any new route must be added through the standard FastAPI router so it automatically inherits this contract.**

---

## X-Request-ID

| Behaviour | Detail |
|---|---|
| **Generation** | If the incoming request carries no `X-Request-ID` header, `RequestIdMiddleware` generates a UUID4 and assigns it. |
| **Propagation** | If the incoming request supplies `X-Request-ID`, that value is used unchanged. |
| **Echo** | Every response carries `X-Request-ID` in its headers regardless of status code. |
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

Every request emits one log line via the `worktime.access` logger after the response is sent. Format:

```
METHOD PATH STATUS_CODE DURATION_MS req_id=<uuid> user=<id|-> auth=<oidc|->
```

Example:

```
GET /api/health 200 12.345ms req_id=550e8400-e29b-41d4-a716-446655440000 user=42 auth=oidc
```

### Log fields

| Field | Notes |
|---|---|
| Method, path, status, duration | Standard access log fields. |
| `req_id` | UUID4 (generated or propagated). |
| `user` | Local user ID when authenticated; `-` for unauthenticated requests. |
| `auth` | `oidc` when a valid Bearer JWT was presented; `-` for unauthenticated requests. |

**Path is logged without query parameters** to prevent token leakage.

---

## Timing Header

`X-Total-Ms` is set by `TimingMiddleware` on every response. It reflects wall-clock time inside the middleware stack (excluding `RequestIdMiddleware` overhead). Exposed via CORS `expose_headers` so browsers can read it.

---

## Health Endpoints

| Endpoint | Auth | Behaviour |
|---|---|---|
| `GET /api/health/liveness` | None | Returns `{"status": "alive"}` immediately. |
| `GET /api/health/readiness` | None | Checks database, OIDC provider, and share directory. Returns 200 or 503. |
| `GET /api/health` | None | Returns liveness status and links to readiness and metrics endpoints. |

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

`getRequestId(response)` in `frontend/src/utils/apiClient.ts` reads the `X-Request-ID` header. The 401 and 403 error messages include the request ID:

```
Unauthorized (request-id: 3fa85f64-…)
```

---

## Adding a New Route — Checklist

- [ ] Route is added via `app.include_router(...)` — not via `app.mount()` with a sub-app that bypasses middleware.
- [ ] If the route accepts credentials in a query parameter, verify that `scope["path"]` (not `scope["query_string"]`) is what gets logged.
- [ ] If the route introduces a new auth mechanism, ensure it sets `request.state.user_id` and `request.state.auth_type` so access logs are complete.
- [ ] High-impact mutations (data import/export, account operations) write to the audit log — see `app/routers/audit.py`.
