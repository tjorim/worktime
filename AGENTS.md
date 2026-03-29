# AGENTS.md

## Layout

- `frontend/` contains the web app
- `backend/` contains the FastAPI service

## Commands

### Frontend (`cd frontend`)

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Do not manually edit `CHANGELOG.md` or files under `public/assets/icons/`.

### Backend (`cd backend`)

```bash
uv run uvicorn app.main:app --reload
uv run ruff check app
uv run ty check app
uv run pytest
uv run alembic upgrade head
```

## Source Of Truth

- `frontend/src/data/rosters.ts` for roster and schedule definitions
- `frontend/src/utils/shiftCalculations.ts` for shift logic
- `frontend/src/contexts/SettingsContext.tsx` for user settings and state migrations
- `frontend/src/lib/hday/parser.ts` for frontend `.hday` parsing
- `frontend/src/data/changelog.ts` for release notes input

## Conventions

- Use American English in code, comments, and UI text
- Prefer targeted tests first, then broader checks before handoff
- Do not commit automatically unless explicitly asked
