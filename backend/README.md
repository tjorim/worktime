# Worktime Backend

FastAPI backend for shared `.hday` access and database-backed Worktime features.

## Responsibilities

- Read and write user `.hday` files
- Read team configuration from the shared file structure
- Expose team and user time-off APIs
- Provide database-backed APIs for users, time tracking, work locations, sync, and personal Gantt tasks
- Run PostgreSQL schema migrations with Alembic

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
- `SHARE_DIR` — directory containing `.hday` files and the `config/` subdirectory
- `CACHE_ENABLED` / `CACHE_TTL` — file-cache behavior
- `DATABASE_ENABLED` / `DATABASE_URL` — PostgreSQL database behavior
- `JWT_SECRET_KEY` / `JWT_ALGORITHM` / `JWT_ACCESS_TOKEN_EXPIRE_SECONDS` — auth settings for DB endpoints

See `.env`, `QUICKSTART.md`, and `BACKEND_GUIDE.md` for local setup details.

## Share Structure

The shared directory is expected to look like this:

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

- `config/{team_id}.conf` contains team metadata in `key=value` format
- `config/{team_id}.people` contains members in `username,display name` format
- `{username}.hday` files live in the share root

## API Groups

- File/share endpoints: `/hday/*`, `/team/*`, `/health`
- Auth endpoints:
  - local development default: `/auth/*`
  - shared production infra: `/api/auth/*`
- Registration endpoint (public): `POST /users/register`
- Database endpoints: `/db/users/*`, `/db/time-tracking/*`, `/db/work-locations/*`, `/db/gantt-tasks/*`, `/db/sync/*`
- Debug endpoint in non-production only: `/debug/benchmark`

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
