# Worktime Backend Guide

Current documentation for the `worktime/backend` service.

This file is intended to replace the old phase-summary documents with one up-to-date overview of how the backend is structured, what it serves, and how to run it.

## Purpose

The backend has two responsibilities:

- expose the shared `.hday` file APIs used for team and personal time-off data
- expose authenticated PostgreSQL-backed APIs for Worktime's database features

The service is built with FastAPI and currently combines:

- shared-file access under `SHARE_DIR`
- PostgreSQL access through SQLAlchemy and Alembic
- SuperTokens authentication and session handling
- in-memory caching for file-backed operations
- a non-production debug benchmark endpoint

There is no `/v1` prefix. All backend routers are mounted under `/api`, so the effective route groups are `/api/health`, `/api/hday/*`, `/api/team/*`, `/api/users/*`, `/api/time-tracking/*`, `/api/work-locations/*`, `/api/gantt-tasks/*`, `/api/sync/*`, `/api/preferences`, `/api/time-off/*`, `/api/me`, and `/api/debug/*`.
SuperTokens auth uses:

- internal SuperTokens base path: `/auth/*`
- public shared-host path in this repo: `/auth/*`

## Runtime Shape

At startup, [main.py](app/main.py):

- initializes SuperTokens
- logs runtime configuration
- ensures the share directory exists when possible
- checks share-directory accessibility
- initializes the database when `DATABASE_ENABLED=true`
- starts cache warming in the background when caching is enabled
- registers routers for file, team, database, and debug APIs

The app always exposes:

- `GET /`
- `GET /api/health`
- `.hday` file endpoints
- team endpoints
- SuperTokens auth endpoints under the configured API base path

The app conditionally exposes:

- database-backed routes under `/api/users/*`, `/api/time-tracking/*`, `/api/work-locations/*`, `/api/gantt-tasks/*`, `/api/sync/*`, `/api/preferences`, `/api/time-off/*`, and `/api/me` when `DATABASE_ENABLED=true`
- `/api/debug/benchmark` when `ENVIRONMENT != production`

## Route Groups

### Core routes

- `GET /` returns the API title and version
- `GET /api/health` verifies share-directory accessibility and returns JSON health status

### Shared `.hday` routes

- `GET /api/hday/{username}`
- `PUT /api/hday/{username}`

These endpoints read and write `.hday` files in the share root and use ETags for optimistic concurrency on writes.

### Team routes

- `GET /api/team/{team_id}`
- `GET /api/team/{team_id}/hday`

Team metadata is read from `config/{team_id}.conf` and `config/{team_id}.people` under the share directory.

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

### Debug routes

In non-production only:

- `GET /api/debug/benchmark`

## Storage Model

### Shared-file side

`SHARE_DIR` is expected to contain:

```text
<share>/
├── config/
│   ├── team1.conf
│   ├── team1.people
│   ├── team2.conf
│   └── team2.people
├── alice.hday
├── bob.hday
└── charlie.hday
```

Conventions:

- `config/{team_id}.conf` stores team metadata in `key=value` format
- `config/{team_id}.people` stores `username,display name` rows
- `{username}.hday` files live at the share root

### Database side

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
- `SHARE_DIR`
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
- cache warming runs asynchronously on startup when enabled

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
- runtime data directory rooted at `/var/data/worktime`
- default `SHARE_DIR=/var/data/worktime/hday_files`
- healthcheck against `GET /api/health`
- non-root runtime user

## Testing

The backend test suite lives under `tests/` and currently covers:

- configuration
- CORS
- health
- audit logging
- `.hday` models, parser, and service layer
- file-backed API endpoints
- team endpoints and services
- cache and cache warming
- benchmark/debug behavior
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
- [hday.py](app/routers/hday.py)
- [team.py](app/routers/team.py)
- the `app/routers/db_*.py` modules
- the `tests/` directory
