# Worktime Backend Guide

Current documentation for the `worktime/backend` service.

This file is intended to replace the old phase-summary documents with one up-to-date overview of how the backend is structured, what it serves, and how to run it.

## Purpose

The backend's responsibility is to expose authenticated PostgreSQL-backed APIs for Worktime's
database features.

The service is built with FastAPI and currently combines:

- PostgreSQL access through SQLAlchemy and Alembic
- SuperTokens authentication and session handling
- in-memory caching for holiday API responses

Legacy shared-`.hday`-file and team endpoints (`/api/hday/*`, `/api/team/*`) have been removed —
that's handled entirely client-side now, via a local helper each user runs themselves
(`hday-helper/README.md`), not by this backend.

There is no `/v1` prefix. All backend routers are mounted under `/api`, so the effective route groups are `/api/health`, `/api/users/*`, `/api/time-tracking/*`, `/api/work-locations/*`, `/api/gantt-tasks/*`, `/api/sync/*`, `/api/preferences`, `/api/time-off/*`, and `/api/me`.
SuperTokens auth uses:

- internal SuperTokens base path: `/auth/*`
- public shared-host path in this repo: `/auth/*`

## Runtime Shape

At startup, [main.py](app/main.py):

- initializes SuperTokens
- logs runtime configuration
- initializes the database when `DATABASE_ENABLED=true`
- registers routers for database and auth APIs

The app always exposes:

- `GET /`
- `GET /api/health`
- SuperTokens auth endpoints under the configured API base path

The app conditionally exposes:

- database-backed routes under `/api/users/*`, `/api/time-tracking/*`, `/api/work-locations/*`, `/api/gantt-tasks/*`, `/api/sync/*`, `/api/preferences`, `/api/time-off/*`, and `/api/me` when `DATABASE_ENABLED=true`

## Route Groups

### Core routes

- `GET /` returns the API title and version
- `GET /api/health` — lightweight summary with links to the liveness and readiness probes
- `GET /api/health/liveness` — instant alive check with no external I/O; use for liveness probes
- `GET /api/health/readiness` — verifies database connectivity (2-second statement timeout) and OIDC provider reachability; use for readiness probes
- `GET /api/metrics` — HMAC-protected snapshot of in-memory request metrics (requires `METRICS_HMAC_SECRET`)

### Auth routes

SuperTokens mounts its own auth/session routes under the configured API base path:

- internal SuperTokens base path: `/auth/*`
- public shared-host path in this repo: `/auth/*`

In this deployment, `SUPERTOKENS_API_BASE_PATH=/auth` and Caddy forwards `/auth*`
directly to `worktime-api`, so the internal base path and the effective public path
are the same.

The backend uses those sessions for database-backed endpoints.

### Database user routes

- `POST /api/users/`
- `GET /api/users/`
- `GET /api/users/{user_id}`
- `GET /api/users/by-username/{username}`
- `PUT /api/users/{user_id}`
- `DELETE /api/users/{user_id}`

These routes manage app users and keep local users aligned with SuperTokens identities.

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

### Database preferences route

- `GET /api/preferences`
- `PUT /api/preferences`

### Database time-off routes

- `POST /api/time-off/`
- `GET /api/time-off/`
- `GET /api/time-off/{entry_id}`
- `PATCH /api/time-off/{entry_id}`
- `DELETE /api/time-off/{entry_id}`

### Account route

- `GET /api/me`

## Storage Model

The database layer is PostgreSQL-only and expects an async SQLAlchemy URL using the `asyncpg` driver.

Schema management is handled through Alembic. The backend can be started with DB routes disabled, but the current app is clearly designed to support DB-backed features as a first-class path.

## Authentication

Authentication is handled by SuperTokens.

Current configuration lives in:

- [settings.py](app/config/settings.py)
- [supertokens_config.py](app/config/supertokens_config.py)

Important points:

- the backend talks to a self-hosted SuperTokens core
- auth/session routes live under `SUPERTOKENS_API_BASE_PATH`
- the standard SuperTokens setup uses `/auth` for both the frontend auth UI and the backend auth APIs
- the dashboard then lives at `/auth/dashboard`
- DB endpoints depend on authenticated sessions
- production requires `SUPERTOKENS_API_KEY`
- user creation, rename, and deletion must stay consistent between the local DB and SuperTokens

## Configuration

Primary runtime settings live in [.env.example](.env.example) and [settings.py](app/config/settings.py).

Important variables:

- `ENVIRONMENT`
- `HOST`
- `PORT`
- `CORS_ORIGINS`
- `CACHE_ENABLED`
- `CACHE_TTL`
- `DATABASE_ENABLED`
- `DATABASE_URL`
- `DATABASE_ECHO`
- `SUPERTOKENS_CONNECTION_URI`
- `SUPERTOKENS_API_KEY`
- `SUPERTOKENS_API_DOMAIN`
- `SUPERTOKENS_WEBSITE_DOMAIN`
- `SUPERTOKENS_API_BASE_PATH`

Behavior to note:

- wildcard CORS is blocked in production
- `DATABASE_URL` must use `postgresql+asyncpg://...`
- `SUPERTOKENS_API_KEY` is required in production

## Development

Requirements:

- Python 3.12+
- `uv`
- PostgreSQL when DB features are enabled
- SuperTokens core when auth-backed DB routes are exercised

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
- healthcheck against `GET /api/health`
- non-root runtime user

## Testing

The backend test suite lives under `tests/` and currently covers:

- configuration
- CORS
- health
- audit logging
- holiday caching
- database initialization
- database-backed user, time-tracking, work-location, Gantt, and sync APIs
- authentication behavior

Run the full suite with:

```bash
uv run pytest
```

## Source of Truth

When this guide and the code disagree, trust the code and tests.

The most important files are:

- [main.py](app/main.py)
- [settings.py](app/config/settings.py)
- [supertokens_config.py](app/config/supertokens_config.py)
- [health.py](app/routers/health.py)
- the `app/routers/db_*.py` modules
- the `tests/` directory
