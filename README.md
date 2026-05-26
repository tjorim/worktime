# Worktime

Shift tracking and time-off management with a web frontend and a local/shared backend.

## Project Structure

```text
worktime/
├── frontend/      # Web app (Vite, pnpm)
├── backend/       # FastAPI service (uv, SQLite, Alembic)
├── examples/      # Example `.hday` files and sample share data
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

- Shift and roster tracking across multiple schedule types
- `.hday` import, export, and parsing for time-off management
- Shared team/time-off reads through the backend
- Database-backed time tracking, work locations, and personal Gantt tasks

## More Details

- [backend/README.md](backend/README.md) for backend architecture, API surface, and deployment
- `frontend/` for the web app source
- `examples/` for sample `.hday` and share-style data

## CI Workflows

Branch protection should require the scoped workflows that match changed areas:

- `Backend CI`
- `Frontend CI`
- `.hday Helper CI`
- `Android CI`
- `CodeQL Python`
- `CodeQL JavaScript`
- `CodeQL Actions`
- `CodeQL Android`

Release and artifact workflows are intentionally separated from normal CI:

- `Deploy Worktime to GitHub Pages` runs only on release publish or manual dispatch and enforces frontend lint/test/build before deploy.
- `Build .hday Helper EXE` remains scoped to `hday-helper/**`, `frontend/src/lib/hday/**`, and its workflow file.
- Android release/manual artifact workflows should be separate from Android CI and scoped to `android/**`; when signing secrets are unavailable they should skip artifact publishing gracefully instead of failing unrelated checks.
