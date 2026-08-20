# Worktime Backend

FastAPI backend for database-backed Worktime features.

## Responsibilities

- Provide database-backed APIs for users, time tracking, work locations, sync, and personal Gantt tasks
- Run PostgreSQL schema migrations with Alembic

Legacy shared-`.hday`-file access (`/api/hday/*`, `/api/team/*`) has been removed from this
backend — that's now handled entirely by a local helper each user runs themselves; see
`hday-helper/README.md`.

## Layout

```text
backend/
├── app/           # FastAPI application package
├── alembic/       # Alembic migration scripts
├── tests/         # Backend test suite
├── Dockerfile
├── alembic.ini
├── pyproject.toml
└── uv.lock
```

## Development

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

Useful commands:

```bash
uv run ruff check app
uv run ty check app
uv run pytest
uv run pytest tests/test_health.py
uv run alembic revision --autogenerate -m "describe change"
uv run alembic upgrade head
```

## Runtime Configuration

Environment is configured through `.env`.

Important variables:

- `ENVIRONMENT` — `development` or `production`
- `HOST` / `PORT` — bind address and port
- `CORS_ORIGINS` / `TRUSTED_HOSTS` — allowed origins and Host-header allowlist
- `CACHE_ENABLED` / `CACHE_TTL` — holiday-cache behavior
- `DATABASE_ENABLED` / `DATABASE_URL` — PostgreSQL database behavior (or `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD_FILE`)
- `OIDC_ISSUER_URL` / `OIDC_AUDIENCE` / `OIDC_JWKS_URI` / `OIDC_ALGORITHMS` — OIDC provider settings
- `DEV_AUTH_BYPASS_TOKEN` — local-dev-only shortcut that skips OIDC/JWKS verification (refuses to start outside `ENVIRONMENT=development`)
- `RATE_LIMIT_ENABLED` / `RATE_LIMIT_DEFAULT` — per-client-IP rate limiting
- `SENTRY_DSN` / `SENTRY_TRACES_SAMPLE_RATE` — error tracking (disabled when `SENTRY_DSN` is empty)
- `METRICS_HMAC_SECRET` — required for `/api/metrics` to respond (404s otherwise)
- `INTEGRATION_KEY_HASH_SECRET` — HMAC secret for hashing stored integration-client keys
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` — Web Push shift-reminder notifications (feature is a no-op when unset)

See `.env`, `QUICKSTART.md`, and `BACKEND_GUIDE.md` for local setup details, and `app/config/settings.py` for the full list.

## API Groups

Auth is OIDC/Keycloak-based (`app/config/settings.py`, `app/config/oidc_config.py`), plus personal
access tokens (`wtpat_...`) for non-interactive clients like the Pebble companion app — see
`AGENTS.md` for how the two are gated.

- `/api/health`, `/api/health/liveness`, `/api/health/readiness`
- `/api/auth/oidc-config` — OIDC discovery info for frontend clients
- `/api/metrics` — HMAC-protected request metrics
- `/api/holidays/*` — public/school holidays, long weekends, pay dates
- Registration endpoint (admin-only pre-provisioning): `POST /api/users/register`
- Database endpoints (require `DATABASE_ENABLED=true`): `/api/me`, `/api/access-tokens/*`,
  `/api/audit/*`, `/api/integration-clients/*`, `/api/users/*`, `/api/time-tracking/*`,
  `/api/work-locations/*`, `/api/gantt-tasks/*`, `/api/sync/*` (including the `/api/sync/events`
  SSE stream), `/api/preferences`, `/api/read-models/*`, `/api/pebble/*`, `/api/time-off/*`,
  `/api/push/*`
- `/mcp` — Model Context Protocol server mount

Use `/docs` or `/redoc` for the full OpenAPI view while the server is running.

## Deployment

Typical production flow:

```bash
cd backend
uv sync --frozen
uv run alembic upgrade head
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The repo also includes Docker support via `backend/Dockerfile`.
