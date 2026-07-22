# AGENTS.md

## Layout

- `frontend/` contains the web app
- `backend/` contains the FastAPI service
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

> **Prerequisites:** Backend development and tests require a running PostgreSQL instance.
> Start one with `docker compose -f backend/docker-compose.yml up db -d` from the repo root.
> Tests default to `postgresql+asyncpg://worktime:worktime@localhost/worktime_test`;
> override via the `TEST_DATABASE_URL` environment variable.

## Source Of Truth

- `VERSION` (repo root) for the current app release version — `frontend/package.json`, `backend/pyproject.toml`, and the Android `versionName`/`versionCode` all derive from it (see `frontend/scripts/check-version-consistency.ts`, `backend/pyproject.toml`'s `[tool.hatch.version]`, and `android/app/build.gradle.kts`'s `versionCodeFor()`). Bump `VERSION`, then run `pnpm run sync-version` (from `frontend/`) to sync `package.json`.
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
