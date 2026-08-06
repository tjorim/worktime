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
- `CACHE_ENABLED` / `CACHE_TTL` — holiday-cache behavior
- `DATABASE_ENABLED` / `DATABASE_URL` — PostgreSQL database behavior
- `JWT_SECRET_KEY` / `JWT_ALGORITHM` / `JWT_ACCESS_TOKEN_EXPIRE_SECONDS` — auth settings for DB endpoints

See `.env`, `QUICKSTART.md`, and `BACKEND_GUIDE.md` for local setup details.

## API Groups

- `/api/health`
- Auth endpoints:
  - internal SuperTokens base path: `/auth/*`
  - public shared-host path in this repo: `/auth/*`
- Registration endpoint (admin-only pre-provisioning): `POST /api/users/register`
- Database endpoints: `/api/users/*`, `/api/time-tracking/*`, `/api/work-locations/*`, `/api/gantt-tasks/*`, `/api/sync/*`, `/api/preferences`, `/api/time-off/*`, `/api/me`

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
