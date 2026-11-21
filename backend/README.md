# Worktime Backend

FastAPI backend for database-backed Worktime features.

## What it does

- Provide database-backed APIs for users, time tracking, work locations, sync, and personal Gantt tasks
- Run PostgreSQL schema migrations with Alembic

Legacy shared-`.hday`-file access (`/api/hday/*`, `/api/team/*`) has been removed from this
backend — that's now handled entirely by a local helper each user runs themselves; see
`hday-helper/README.md`.

## Setup

```bash
cd backend

# 1. Install dependencies (creates .venv automatically)
uv sync

# 2. Configure the environment (all variables have development defaults)
cp .env.example .env

# 3. Optional: PostgreSQL. SQLite works for development and tests.
docker compose up db -d
```

For a local SQLite instance set `DATABASE_URL=sqlite+aiosqlite:///./dev.db` and run `uv run alembic upgrade head`
once. Auth does not need an identity provider locally: `DEV_AUTH_BYPASS_TOKEN` is described in
[QUICKSTART.md](QUICKSTART.md#local-api-users-without-an-identity-provider).

## Run

```bash
uv run alembic upgrade head           # apply database migrations (see "Migrations")
uv run uvicorn app.main:app --reload  # start the development server
```

The interactive API docs are at <http://localhost:8000/docs> (and `/redoc`). `run.sh` installs dependencies and starts the server; it only applies migrations when `AUTO_MIGRATE=true`, so run `uv run alembic upgrade head` first (see above).

## Test

```bash
uv run pytest
uv run pytest tests/test_health.py   # a single file
```

Tests run against a throwaway SQLite file by default, so they need no container (about 15 seconds). CI also runs the
suite against PostgreSQL, the production database. To do the same locally, start one and point the tests at it:

```bash
docker compose up db -d
docker compose exec db psql -U worktime -d worktime -c "CREATE DATABASE worktime_test;"   # the compose service only creates `worktime`
export TEST_DATABASE_URL=postgresql+asyncpg://worktime:worktime@localhost/worktime_test
```

Two tests that simulate two sessions racing on an index entry need PostgreSQL's row-level locking and skip on SQLite.

## Lint and type-check

```bash
uv run ruff check .          # lint
uv run ruff format --check . # formatting (uv run ruff format . rewrites)
uv run ty check .            # type check
```

## Migrations

```bash
uv run alembic upgrade head                       # apply
uv run alembic revision --autogenerate -m "..."   # create a revision after a model change
uv run alembic check                              # fail when the models and migrations disagree (CI runs this)
```

Only SQLAlchemy model or table changes need a new Alembic revision; scripts live in `migrations/`.

## API contract

The response models are the source of truth for the frontend's API types: `frontend/openapi.json` is generated from
them (`uv run python -m app.openapi_export`, normally via `pnpm api:generate` in `frontend/`), Orval turns it into
`frontend/src/api-schema/`, and `test_openapi_snapshot` fails when the snapshot is stale. See "API contract" in the
root [AGENTS.md](../AGENTS.md).

## Layout

```text
backend/
├── app/            # FastAPI application package
├── migrations/     # Alembic migration scripts
├── tests/          # Backend test suite
├── docs/           # Observability, profiling, rate limiting and sync tombstone notes
├── sql/            # Operational SQL
├── Dockerfile
├── alembic.ini
├── pyproject.toml
└── uv.lock
```

More guides: [QUICKSTART.md](QUICKSTART.md) (curl workflow without an IdP) and
[BACKEND_GUIDE.md](BACKEND_GUIDE.md) (architecture and conventions).

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
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` — Web Push planned-task-reminder notifications (feature is a no-op when unset)
- `FCM_SERVICE_ACCOUNT_JSON` — Firebase service-account credential for waking the Android app in the background (feature is a no-op when unset)

See `.env.example`, `QUICKSTART.md`, and `BACKEND_GUIDE.md` for local setup details, and `app/config/settings.py` for the full list.

Optional `DEV_AUTH_MEMBER_TOKEN` and `DEV_AUTH_SECOND_MEMBER_TOKEN` provide two local
member identities; see [Quick Start](QUICKSTART.md#local-api-users-without-an-identity-provider)
for configuration, guards and the curl workflow. Browser OIDC flows require an IdP.

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
uv sync --locked
uv run alembic upgrade head
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The repo also includes Docker support via `backend/Dockerfile`.

## Pydantic boundary conventions

External typed write payloads reject unknown fields so misspelled or stale keys
produce a validation error instead of a successful write that drops data. This
includes nested typed write records. Keep arbitrary JSON fields (preferences,
provider data, and versioned import documents) open according to their own
contracts; do not apply a request base to response models or identity-provider
claims. Clients must send the documented request fields rather than spread an
entire response object into a write.

Use `ConfigDict` for model configuration and `SettingsConfigDict` for
`BaseSettings`. Keep environment prefixes, settings sources, and initialization
behavior specific to each application. A dependency upgrade does not require
switching settings caching APIs.

Reuse constrained `Annotated` value types when fields have the same contract.
Concrete schemas own defaults, nullability, and field descriptions. Preserve the
difference between omitted fields and explicit `null` on partial updates. Use
`EmailStr` for user-entered email addresses, while retaining stored response and
identity-provider claim formats. Declare Pydantic directly when importing it and
request its `email` extra only when email validation is used.

These conventions change validation before a write is executed; they do not
change retry, ownership, or transaction semantics.

Rate-limit buckets, response headers, exemptions and rollout: [REST rate limiting](docs/RATE_LIMITING.md).
