# Worktime

Shift tracking and time-off management with a web frontend and a local/shared backend.

## Project Structure

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

## Quick Start

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
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

- Frontend dev server: `http://localhost:5173`
- Backend API/docs: `http://localhost:8000/docs`

## What It Does

- Shift and roster tracking across multiple schedule types, with Gantt and unified-calendar views
- `.hday` import, export, and parsing for time-off management
- OIDC accounts with cross-device sync (live updates over SSE) and shared team/time-off reads
- Database-backed time tracking, work locations, and personal Gantt tasks
- Public/school holidays, long weekends, and pay dates
- An MCP server exposing schedule and status tools to LLM clients
- Companion apps: Android and a Pebble (Alloy) watch app
- Internationalized UI (English/Dutch)

## More Details

- [backend/README.md](backend/README.md) for backend architecture, API surface, and deployment
- `frontend/` for the web app source
- `examples/` for sample `.hday` and share-style data

## CI Workflows

Each workflow is scoped to the paths it validates:

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

Production hosting for `worktime.tjor.im` is handled by the separate infra stack in
`/opt/apps/infra` (see `AGENTS.md`) — there is no GitHub Pages deploy workflow in this repo.

### Release and Artifact Workflows

These workflows are intentionally separated from normal CI:

- `Draft Release` — runs on `v*` tag pushes to prepare a draft GitHub release.
- `Build .hday Helper` (Windows EXE + Linux binary) remains scoped to `hday-helper/**`, `frontend/src/lib/hday/**`, and its workflow file.
- `Android Release APK` is a manual (`workflow_dispatch`) artifact build, separate from Android CI. When signing secrets are unavailable, it skips artifact publishing gracefully instead of failing unrelated checks.
