# AGENTS.md

## Layout

- `frontend/` contains the web app
- `backend/` contains the FastAPI service
- `pebble/` contains the Pebble (Alloy) companion watch app — see `pebble/README.md`. Not built or tested
  in CI; requires the Pebble SDK/CLI, which isn't vendored in this repo.
- Production hosting for `worktime.tjor.im` is handled by the separate infra stack in `/opt/apps/infra`
- Frontend builds write to `frontend/dist`; in production, Caddy serves this content from `/srv/worktime`

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

> **Prerequisites:** Tests require a running PostgreSQL instance — start one with
> `docker compose -f backend/docker-compose.yml up db -d` from the repo root. They
> default to `postgresql+asyncpg://worktime:worktime@localhost/worktime_test`;
> override via the `TEST_DATABASE_URL` environment variable.
>
> For just running the app locally (`uv run uvicorn ...`), Postgres isn't required —
> set `DATABASE_URL=sqlite+aiosqlite:///./dev.db` (no container needed) and run
> `uv run alembic upgrade head` once against it first.
>
> Auth doesn't require a local Keycloak/IdP either — set `DEV_AUTH_BYPASS_TOKEN`
> to any string and pass it as `Authorization: Bearer <value>`; it's treated as
> a fixed admin dev user, auto-provisioned on first use. Refuses to start if
> set outside `ENVIRONMENT=development`.

Besides OIDC sessions, non-interactive clients (currently just the Pebble companion app) authenticate with
a personal access token (`wtpat_...`, `/api/access-tokens`, managed from Settings > Account > API tokens).
`get_authenticated_principal` (`backend/app/routers/auth.py`) accepts either; `require_oidc_principal` gates
endpoints — account deletion and token management itself — that a leaked token must not be able to reach.

## Versioning

The app uses CalVer: `YYYY.MM.MICRO` (e.g. `2026.7.1`), where `MICRO` is a counter
that resets to `1` at the start of each new month.

The root `VERSION` file is the single source of truth. Everything else derives
from it — nothing else should be hand-edited:

- `backend/app/version.py` reads it at runtime (`APP_VERSION`), used by
  `app/main.py`. `backend/pyproject.toml`'s `version` field is frozen at
  `0.0.0` — it's packaging metadata only, never read at runtime since the
  project is run from source, not installed as a wheel.
- `frontend/package.json`'s `version` field is synced from it via
  `pnpm run sync-version` (`frontend/scripts/sync-version.ts`); `check-version-consistency.ts`
  fails CI if it drifts.
- `android/app/build.gradle.kts` reads it directly to compute `versionName`/`versionCode`.

After bumping `VERSION`, run `pnpm run sync-version`, add a `frontend/src/data/changelog.ts`
entry for the new version, then `pnpm run generate-changelog` to regenerate `CHANGELOG.md`.

## Source Of Truth

- `VERSION` (repo root) for the app version — see "Versioning" above
- `frontend/src/data/rosters.ts` for roster and schedule definitions
- `frontend/src/utils/shiftCalculations.ts` for shift logic
- `frontend/src/contexts/SettingsContext.tsx` for user settings and state migrations
- `frontend/src/lib/hday/parser.ts` for frontend `.hday` parsing
- `frontend/src/data/changelog.ts` for release notes input

## Live Updates

Worktime uses a **notify-then-pull** pattern over SSE. The backend signals that fresh data is available; the client fetches it via the existing incremental pull path.

### SSE contract

| Field | Value |
|-------|-------|
| Endpoint | `GET /api/sync/events` |
| Auth | Bearer token via `Authorization` header, same as every other endpoint — the client opens the stream with `fetch()` (parsed via `eventsource-parser`), not native `EventSource`, since `EventSource` cannot send custom headers |
| Event name | `sync_changed` |
| Payload | `{ "type": "sync_changed", "server_timestamp": "<ISO-8601>" }` |
| Keepalive | `: keepalive` comment every 15 s |
| Client behaviour | Compare `server_timestamp` against stored sync cursor; skip pull if cursor is already at or ahead of the signal |

### Deployment notes

- **Proxy buffering** — set `X-Accel-Buffering: no` (already sent by the endpoint) so Nginx/Caddy does not buffer the stream.
- **Timeouts** — ensure the proxy does not close idle SSE connections before the 15 s keepalive fires. Caddy's default idle timeout is fine; Nginx needs `proxy_read_timeout` ≥ 60 s.
- **CORS** — cross-origin dev setups rely on the existing `CORSMiddleware` config (`Authorization` is already in `allow_headers`); same-origin production deployments (frontend and API behind the same Caddy host) need no CORS handling at all for this endpoint.
- **Postgres LISTEN/NOTIFY** — the backend subscribes to the `worktime_sync_changed` channel for cross-process broadcast. If the asyncpg LISTEN connection is unavailable (e.g. during startup or a Postgres restart), the manager falls back to in-process delivery automatically; no operator action is required.

### Adding new live-update behaviour

- **Reuse `SyncSignalTransport`** when the update follows the same notify-then-pull shape: the live signal is just a freshness hint and the data arrives via a normal fetch. Implement a new `SyncSignalTransport` adapter (or reuse `createFetchSseTransport`) and pass it to `useSyncSignal`.
- **Stay request/poll-based** for user-triggered actions, infrequent state changes, or anything that needs the full response payload inline (not a separate fetch). Adding SSE complexity for those cases is not worth it.
- The transport abstraction also decouples the wire protocol: replacing SSE with WebSockets later only requires a new adapter — no changes to `useSyncSignal` or its callers.

## Conventions

- Use American English in code, comments, and UI text
- Prefer targeted tests first, then broader checks before handoff
- Do not commit automatically unless explicitly asked
- Always include screenshots in PR comments when making UI changes (all visible states)
- Frontend imports: use the `@` alias (`@` → `src/`) instead of relative `../` paths, in both `src/` and `tests/`
- All storage keys live in `frontend/src/constants/storageKeys.ts`
