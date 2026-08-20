# Worktime Backend Guide

Current documentation for the `worktime/backend` service.

This file is intended to replace the old phase-summary documents with one up-to-date overview of how the backend is structured, what it serves, and how to run it.

## Purpose

The backend's responsibility is to expose authenticated PostgreSQL-backed APIs for Worktime's
database features.

The service is built with FastAPI and currently combines:

- PostgreSQL access through SQLAlchemy and Alembic
- OIDC (Keycloak) authentication, plus personal access tokens for non-interactive clients
- in-memory caching for holiday API responses

Legacy shared-`.hday`-file and team endpoints (`/api/hday/*`, `/api/team/*`) have been removed —
that's handled entirely client-side now, via a local helper each user runs themselves
(`hday-helper/README.md`), not by this backend.

There is no `/v1` prefix. All backend routers are mounted under `/api`, plus an `/mcp` mount for
the Model Context Protocol server. See "Route Groups" below for the full list.

## Runtime Shape

At startup, [main.py](app/main.py):

- logs runtime configuration
- initializes the database when `DATABASE_ENABLED=true`
- registers routers for the core, auth, and (when enabled) database-backed APIs
- mounts the MCP server at `/mcp` when available

The app always exposes:

- `GET /`
- `GET /api/health`, `/api/health/liveness`, `/api/health/readiness`
- `GET /api/metrics` (HMAC-protected; 404s unless `METRICS_HMAC_SECRET` is set)
- `GET /api/holidays/*`
- `GET /api/auth/oidc-config`

The app conditionally exposes, when `DATABASE_ENABLED=true`:

- `/api/me`, `/api/access-tokens/*`, `/api/integration-clients/*`, `/api/audit/*`,
  `POST /api/users/register`, `/api/users/*`, `/api/time-tracking/*`, `/api/work-locations/*`,
  `/api/gantt-tasks/*`, `/api/sync/*`, `/api/preferences`, `/api/read-models/*`, `/api/pebble/*`,
  `/api/time-off/*`, `/api/push/*`

## Route Groups

### Core routes

- `GET /` returns the API title and version
- `GET /api/health` — lightweight summary with links to the liveness and readiness probes
- `GET /api/health/liveness` — instant alive check with no external I/O; use for liveness probes
- `GET /api/health/readiness` — verifies database connectivity (2-second statement timeout) and OIDC provider reachability; use for readiness probes
- `GET /api/metrics` — HMAC-protected snapshot of in-memory request metrics (requires `METRICS_HMAC_SECRET`)
- `GET /api/holidays/public`, `/school`, `/longweekend`, `/paydates`

### Auth routes

Auth is OIDC/Keycloak-based, not session-cookie-based:

- `GET /api/auth/oidc-config` — discovery info the frontend uses to talk to the OIDC provider directly
- Every other authenticated endpoint accepts a Bearer token: either an OIDC access token (verified
  against the provider's JWKS, see [oidc_config.py](app/config/oidc_config.py)) or a personal
  access token (`wtpat_...`, issued via `/api/access-tokens`)
- `get_authenticated_principal` ([auth.py](app/routers/auth.py)) accepts either kind of token;
  `require_oidc_principal` additionally gates endpoints — account deletion, token management — that
  a leaked personal access token must not be able to reach
- In local dev, `DEV_AUTH_BYPASS_TOKEN` skips real OIDC/JWKS verification entirely (see AGENTS.md)

### Database user routes

- `POST /api/users/`
- `GET /api/users/`
- `GET /api/users/{user_id}`
- `GET /api/users/{user_id}/export`
- `GET /api/users/by-username/{username}`
- `PUT /api/users/{user_id}`
- `DELETE /api/users/{user_id}`
- `POST /api/users/register` — admin-only pre-provisioning (separate router, same `/api/users` prefix)

These routes manage app users and keep local users aligned with their OIDC identity.

### Account route

- `GET /api/me`

### Access token routes

Personal access tokens (`wtpat_...`) for non-interactive clients (currently the Pebble companion
app), managed from Settings > Account > API tokens:

- `/api/access-tokens/*` — create, list, revoke

### Integration client routes

- `/api/integration-clients/*` — managed integration-client keys

### Audit routes

- `/api/audit/*` — audit log entries

### Database time-tracking routes

Under `/api/time-tracking`:

- label CRUD under `/labels`
- task CRUD under `/tasks`
- running-task lookup under `/tasks/running`
- template CRUD under `/templates`

### Database work-location routes

Under `/api/work-locations`:

- `POST /`
- `GET /`
- `GET /{value_date}`
- `DELETE /{value_date}`

### Database Gantt routes

Under `/api/gantt-tasks`:

- `POST`
- `GET`
- `GET /{task_id}`
- `PUT /{task_id}`
- `DELETE /{task_id}`

### Database sync routes

Under `/api/sync`:

- `POST /push`
- `GET /pull`
- `GET /status`
- `GET /events` — SSE stream for the notify-then-pull live-update pattern (see AGENTS.md)

### Database preferences route

- `GET /api/preferences`
- `PUT /api/preferences`

### Database time-off routes

- `POST /api/time-off/`
- `GET /api/time-off/`
- `GET /api/time-off/{entry_id}`
- `PATCH /api/time-off/{entry_id}`
- `DELETE /api/time-off/{entry_id}`

### Read model routes

- `/api/read-models/*` — reusable read-only views (dashboard, next shifts) for mobile and other
  read-only clients (Android, Pebble, MCP)

### Pebble routes

- `/api/pebble/*` — endpoints backing the Pebble watch companion app (see `pebble/README.md`)

### Push notification routes

- `/api/push/*` — Web Push subscription management for shift-reminder notifications (no-ops unless
  `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` are set)

### MCP server

- `/mcp` — Model Context Protocol server mount, exposing schedule/status tools over MCP; see
  `GET /api/mcp/capabilities` for the capability manifest

## Storage Model

The database layer is PostgreSQL-backed and expects an async SQLAlchemy URL using the `asyncpg` driver
(a `sqlite+aiosqlite://` URL is also accepted as a local-development convenience without a container).

Schema management is handled through Alembic. The backend can be started with DB routes disabled, but the current app is clearly designed to support DB-backed features as a first-class path.

## Authentication

Authentication is OIDC-based (Keycloak in production), plus personal access tokens for
non-interactive clients.

Current configuration lives in:

- [settings.py](app/config/settings.py)
- [oidc_config.py](app/config/oidc_config.py)

Important points:

- the backend verifies OIDC access tokens against the issuer's JWKS (`OIDC_ISSUER_URL`, `OIDC_JWKS_URI`)
- personal access tokens (`wtpat_...`) are looked up by hash and treated as a second, more
  restricted credential kind — see `AGENTS.md` for which endpoints they can and can't reach
- `DEV_AUTH_BYPASS_TOKEN` is a local-dev-only shortcut that skips real verification entirely;
  the app refuses to start with it set outside `ENVIRONMENT=development`
- DB endpoints depend on an authenticated principal (OIDC or PAT, depending on the endpoint)
- user creation, rename, and deletion must stay consistent between the local DB and the OIDC
  provider's identity

## Configuration

Primary runtime settings live in [.env.example](.env.example) and [settings.py](app/config/settings.py).

Important variables:

- `ENVIRONMENT`
- `HOST`
- `PORT`
- `CORS_ORIGINS`
- `TRUSTED_HOSTS`
- `CACHE_ENABLED`
- `CACHE_TTL`
- `DATABASE_ENABLED`
- `DATABASE_URL`
- `DATABASE_ECHO`
- `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD_FILE`
- `OIDC_ISSUER_URL`
- `OIDC_AUDIENCE`
- `OIDC_JWKS_URI`
- `OIDC_ALGORITHMS`
- `DEV_AUTH_BYPASS_TOKEN`
- `RATE_LIMIT_ENABLED` / `RATE_LIMIT_DEFAULT`
- `SENTRY_DSN` / `SENTRY_TRACES_SAMPLE_RATE`
- `METRICS_HMAC_SECRET`
- `INTEGRATION_KEY_HASH_SECRET`
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`

Behavior to note:

- wildcard CORS is blocked in production
- `DATABASE_URL` must use `postgresql+asyncpg://...` (or `sqlite+aiosqlite://...` for local dev)
- `TRUSTED_HOSTS` must be a real hostname allowlist in production (refuses to start otherwise)
- `INTEGRATION_KEY_HASH_SECRET` must be set to a real secret in production (refuses to start otherwise)
- `DEV_AUTH_BYPASS_TOKEN` must not be set outside `ENVIRONMENT=development` (refuses to start otherwise)

## Development

Requirements:

- Python 3.12+
- `uv`
- PostgreSQL when DB features are exercised (see AGENTS.md for the SQLite no-container shortcut)
- No local Keycloak/IdP needed — use `DEV_AUTH_BYPASS_TOKEN` instead (see AGENTS.md)

Typical local flow:

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

Useful commands:

```bash
uv run pytest
uv run pytest tests/test_health.py
uv run ruff check app
uv run ty check app
uv run alembic upgrade head
```

OpenAPI docs are available at:

- `/docs`
- `/redoc`

## Docker

The repo includes [Dockerfile](Dockerfile).

Current Docker characteristics:

- Python 3.12 slim base image
- multi-stage build
- dependency installation via `uv`
- healthcheck via `GET /health`
- non-root runtime user

## Testing

The backend test suite lives under `tests/` and currently covers:

- configuration
- CORS
- health
- audit logging
- holiday caching
- database initialization
- database-backed user, time-tracking, work-location, Gantt, sync, time-off, and read-model APIs
- access tokens, integration clients, and Pebble/MCP endpoints
- authentication behavior (OIDC and personal-access-token paths)

Run the full suite with:

```bash
uv run pytest
```

## Source of Truth

When this guide and the code disagree, trust the code and tests.

The most important files are:

- [main.py](app/main.py)
- [settings.py](app/config/settings.py)
- [oidc_config.py](app/config/oidc_config.py)
- [health.py](app/routers/health.py)
- the `app/routers/db_*.py` modules
- the `tests/` directory
