# Worktime

Shift tracking and time-off management with a web frontend and a local/shared backend.

## What it is

- Shift and roster tracking across multiple schedule types, with Gantt and unified-calendar views
- `.hday` import, export, and parsing for time-off management
- OIDC accounts with cross-device sync (live updates over SSE) and shared team/time-off reads
- Database-backed time tracking, work locations, and personal Gantt tasks
- Public/school holidays, long weekends, and pay dates
- An MCP server exposing schedule and status tools to LLM clients
- Companion apps: Android and a Pebble (Alloy) watch app
- Internationalized UI (English/Dutch)

## Quick start

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

### Backend

```bash
cd backend
uv sync
export DATABASE_URL=sqlite+aiosqlite:///./dev.db
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

- Frontend dev server: `http://localhost:5173`
- Backend API/docs: `http://localhost:8000/docs`

Run both servers in separate terminals. Vite proxies `/api` (including SSE) to
`http://127.0.0.1:8000`; browser requests stay on the frontend origin. Port 5173 is
strict, so a busy port produces an error instead of silently changing the URL.
No `VITE_API_DOMAIN` setting is needed or read. For OIDC sign-in, configure the
`VITE_OIDC_*` variables in `frontend/.env.local` (see `src/config/oidc.ts`) and
register `http://localhost:5173/auth/callback` and
`http://localhost:5173/auth/silent-callback` with your provider. The dev auth bypass
is for API clients; it does not create a browser OIDC session. Optional
`DEV_AUTH_MEMBER_TOKEN` and `DEV_AUTH_SECOND_MEMBER_TOKEN` add two distinct member
accounts alongside the existing `DEV_AUTH_BYPASS_TOKEN` admin. All require
`ENVIRONMENT=development` and an explicitly configured admin bypass; see the
[local API users workflow](backend/QUICKSTART.md#local-api-users-without-an-identity-provider).

## Development commands

```bash
# Frontend (cd frontend)
pnpm dev                 # Vite dev server on :5173, proxies /api to the backend
pnpm typecheck           # Paraglide + API types + fixtures + tsc (app, tests, e2e, configs)
pnpm lint && pnpm format:check
pnpm build               # production build; then pnpm bundle:check
pnpm api:generate        # regenerate frontend/openapi.json and src/api-schema/ from the backend

# Backend (cd backend)
uv run uvicorn app.main:app --reload
uv run ruff check . && uv run ruff format --check . && uv run ty check .
uv run alembic upgrade head
```

[AGENTS.md](AGENTS.md) lists every command and the conventions behind them.

## Testing

```bash
cd frontend && pnpm test          # Vitest unit and component tests
cd frontend && pnpm test:e2e      # Playwright (see frontend/e2e/README.md)
cd backend && uv run pytest       # SQLite by default; CI also runs PostgreSQL
```

## Project layout

```text
worktime/
├── frontend/      # Web app (Vite, pnpm)
├── backend/       # FastAPI service (uv, PostgreSQL, Alembic)
├── android/       # Android app
├── pebble/        # Pebble (Alloy) companion watch app
├── hday-helper/   # Local helper for shared `.hday` file access
├── examples/      # Example `.hday` files and sample share data
├── docs/          # Design docs, specs, and audit records
├── infra/         # Example env file for the separate production infra stack
└── AGENTS.md      # Repo-specific contributor guidance
```

## Deployment and release

Production hosting for `worktime.tjor.im` is handled by the separate infra stack in
`/opt/apps/infra` (see `AGENTS.md`) — there is no GitHub Pages deploy workflow in this repo. Releases are
CalVer (`VERSION`, `CHANGELOG.md`, `node scripts/release.mjs`); pushing a `vYYYY.M.MICRO` tag creates a draft
GitHub release. See "Release" in [AGENTS.md](AGENTS.md).

### CI workflows

`ci.yml` detects which paths changed, calls the workflows below and ends in a `CI gate` job that fails when any
needed job failed or was cancelled. Each workflow is scoped to the paths it validates:

- `Backend CI` — `backend/**`
- `Frontend CI` — `frontend/**`
- `.hday Helper CI` — `hday-helper/**`, `frontend/src/lib/hday/**`
- `Android CI` — `android/**`
- `Pebble CI` — `pebble/**` plus the phone-side pairing files it depends on; installs the Pebble
  SDK, builds the package, boots it on the Emery emulator, checks a screenshot, and runs the
  watch-logic tests
- `PR Preview Build` — `frontend/**`, on PR open/sync/reopen
- `CodeQL Python` — `backend/**`
- `CodeQL JavaScript` — `frontend/**`, `hday-helper/**`
- `CodeQL Actions` — `.github/workflows/**`
- `CodeQL Android` — `android/**`

### Release and artifact workflows

These workflows are intentionally separated from normal CI:

- `Draft Release` — runs on `v*` tag pushes to prepare a draft GitHub release.
- `Build .hday Helper` (Windows EXE + Linux binary) remains scoped to `hday-helper/**`, `frontend/src/lib/hday/**`, and its workflow file.
- `Android Release APK` is a manual (`workflow_dispatch`) artifact build, separate from Android CI. When signing secrets are unavailable, it skips artifact publishing gracefully instead of failing unrelated checks.

## Contributing and docs

- [AGENTS.md](AGENTS.md) for repo conventions, commands, CI and release rules (`CLAUDE.md` points there)
- [backend/README.md](backend/README.md) for backend setup, architecture, API surface and deployment
- [frontend/README.md](frontend/README.md) and [frontend/e2e/README.md](frontend/e2e/README.md) for the web app and its browser tests
- [docs/](docs/) for design docs, specs and audit records, including [UI dependency and component maintenance](docs/ui-maintenance.md) and the [Node and pnpm toolchain](docs/toolchain.md)
- `examples/` for sample `.hday` and share-style data
