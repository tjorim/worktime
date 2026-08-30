# AGENTS.md

## Layout

- `frontend/` contains the web app
- `backend/` contains the FastAPI service
- `pebble/` contains the Pebble (Alloy) companion watch app — see `pebble/README.md`.
  CI installs the Pebble SDK, builds the package, boots it on Emery, checks a
  screenshot, and runs the watch-logic tests.
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
- `frontend/src/utils/shiftCalculations.ts` for shift logic (frontend). The backend keeps its own
  Python implementation — `backend/app/services/read_models_service.py` — that serves
  Android/Pebble/MCP read-only clients. Changes flow frontend → backend: after editing
  `rosters.ts`, update `_SCHEDULES` (and the resolution logic, if it changed) to match, then run
  `pnpm run generate-roster-fixture` in `frontend/` and commit the regenerated
  `backend/tests/fixtures/roster_golden.json`. `backend/tests/test_roster_golden_fixture.py` and
  frontend CI's `check-roster-fixture` step catch drift between the two (#1107)
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
- **Postgres LISTEN/NOTIFY** — the backend subscribes to the `worktime_sync_changed` channel for cross-process broadcast. If the connections are unavailable at startup (e.g. `DATABASE_ENABLED=false`, tests), the manager falls back to in-process delivery within that worker automatically; no operator action is required. If a connection drops later (Postgres restart, failover, idle-connection reaper, network blip), an asyncpg termination listener schedules a background reconnect with exponential backoff and re-registers the channel listener — see `SyncEventManager._on_pg_conn_terminated` in `backend/app/utils/sse_manager.py`.

### Adding new live-update behaviour

- **Reuse `SyncSignalTransport`** when the update follows the same notify-then-pull shape: the live signal is just a freshness hint and the data arrives via a normal fetch. Implement a new `SyncSignalTransport` adapter (or reuse `createFetchSseTransport`) and pass it to `useSyncSignal`.
- **Stay request/poll-based** for user-triggered actions, infrequent state changes, or anything that needs the full response payload inline (not a separate fetch). Adding SSE complexity for those cases is not worth it.
- The transport abstraction also decouples the wire protocol: replacing SSE with WebSockets later only requires a new adapter — no changes to `useSyncSignal` or its callers.

### Android background wake (FCM)

Android has no equivalent of an always-open SSE stream, so it uses the same notify-then-pull shape over
FCM instead: the backend (`app/services/fcm_wake_service.py`, `app/services/fcm_service.py`) sends a
silent data-only FCM message — no reminder content, just a wake signal — to a user's registered device
tokens (`FcmDeviceToken`, registered via `/api/push/fcm-token`) whenever a planned time-tracking task is
created, rescheduled, or synced. The app's `FirebaseMessagingService` reacts by re-running the same
refresh-and-reconcile flow the foreground case already uses (`ReminderScheduler.reconcile()`), so there's
one reminder-scheduling code path regardless of whether the app was open or woken. No-ops entirely when
`FCM_SERVICE_ACCOUNT_JSON` is unset, matching how `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` gate Web Push.
See #1205.

## Git branches

A branch you're handed to work from may already be stacked on another unmerged
branch instead of `main` — this repo uses stacked PRs. Before touching an
unfamiliar branch's existing commits:

- Check what it's actually based on — `git merge-base --is-ancestor origin/main
  origin/<branch>` (and the reverse) tells you whether `main` or something else
  is the real parent. Existing commits are not stale leftovers to reset away;
  assume they're an intentional stack until you've confirmed otherwise (e.g.
  checking whether they match a PR already merged into a different base).
- When opening a PR, set `base` to the branch's actual fork point, not `main`
  by default.
- If a PR shows a merge conflict or a base that looks wrong, find out *why*
  before changing anything. Don't "fix" a conflict by repointing the base to
  whatever branch happens to be conflict-free — that hides the mismatch
  instead of resolving it.
- A session's designated branch can already have commits and an open PR from
  earlier, unrelated work (a different issue) when that PR hasn't merged yet.
  This is expected, not a mistake to undo — but don't just pile new, unrelated
  commits onto that same branch/PR. Instead stack: branch a new one off its
  current tip, commit the new work there, and open a second PR based on it
  (per "When opening a PR, set base to the branch's actual fork point"
  above). That keeps the two issues' history and review separate while still
  letting the new PR build on the unmerged one.

## Conventions

- Use American English in code, comments, and identifiers; use British English in user-facing UI text and translations (`frontend/messages/`)
- Prefer targeted tests first, then broader checks before handoff
- Do not commit automatically unless explicitly asked
- Always include screenshots in PR comments when making UI changes (all visible states)
- Frontend imports: use the `@` alias (`@` → `src/`) instead of relative `../` paths, in both `src/` and `tests/`
- Frontend product slices with their own view and supporting components belong under
  `frontend/src/features/<feature>/`, with matching tests under `frontend/tests/features/<feature>/`.
  Feature folders may import shared code, but must not import another feature directly; move code used
  by multiple features to `components/shared/`, `hooks/`, `lib/`, `types/`, or `utils/` as appropriate.
- All storage keys live in `frontend/src/constants/storageKeys.ts`
- Code review findings (CodeRabbit or otherwise) are triaged by validity, not by severity label or who
  authored the touched code — a "nitpick" in code from a stacked PR is not automatically out of scope,
  and a "potential issue" flagged as high-confidence still needs verifying against current code before
  it's trusted. For each finding: verify it against the actual code, fix it if still valid (with tests
  and mutation-testing them where the fix is non-trivial, to confirm the test would actually catch a
  regression), or skip it with a one-line reason if it isn't. Keep fixes minimal and scoped to the
  finding itself.
- CodeRabbit's "nitpick" findings usually aren't posted as separate inline review-comment threads —
  they're plain text inside the main review body/summary, under a heading like "🧹 Nitpick comments".
  Fetching only inline review threads (e.g. `pull_request_read` with `get_review_comments`) will miss
  them entirely; also read the review body itself (`get_reviews`, or the `pull_request_review.submitted`
  webhook payload) to see the full finding set before deciding what to address.
