# AGENTS.md

## Commands

### Frontend (project root)

```bash
npm run dev                # Vite dev server (localhost:8000)
npm run lint               # oxlint
npm run format             # oxfmt
npm run test               # vitest
npm run build              # production build
npm run preview            # serve dist/ — run build first or changes won't appear
npm run generate-changelog # regenerate CHANGELOG.md from src/data/changelog.ts
npm run generate-icons     # regenerate icons in public/assets/icons/
```

Do not manually edit `CHANGELOG.md` or files under `public/assets/icons/`.

### Backend (`cd backend` first)

```bash
uvicorn app.main:app --reload          # dev server
PYTHONPATH=. pytest -q                 # full test suite
PYTHONPATH=. pytest tests/test_X.py   # targeted tests

# Alembic (schema migrations)
PYTHONPATH=. alembic revision --autogenerate -m "describe change"  # generate migration
PYTHONPATH=. alembic upgrade head      # apply pending migrations
PYTHONPATH=. alembic stamp head        # mark existing DB as current (no-op migration)
PYTHONPATH=. alembic current           # show current revision
PYTHONPATH=. alembic downgrade -1      # roll back one revision
```

## Source-of-truth files

- `src/data/rosters.ts` — roster/schedule definitions
- `src/utils/shiftCalculations.ts` — core shift logic
- `src/contexts/SettingsContext.tsx` — user settings and state migrations
- `src/lib/hday/parser.ts` — .hday parser
- `src/data/changelog.ts` — release notes source

## Conventions

- **American English** spelling in all code, comments, and UI text
- Lint must pass (`npm run lint`); suppress inline only with a clear explanation
- **Do not commit automatically** — Jorim handles all commits; only commit when explicitly asked

## Testing

- Run targeted tests for touched files first, then broader checks
- For type-sensitive or cross-cutting changes, run `npm run build` before handoff
- High-signal test files: `tests/data/rosters.test.ts`, `tests/utils/shiftCalculations.test.ts`, `tests/lib/hday.test.ts`, `tests/contexts/SettingsContext.test.tsx`
