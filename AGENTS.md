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
pnpm generate-legacy-classes  # regenerate after changing legacy SCSS/dependencies
pnpm format          # rewrites files in place (Oxfmt)
pnpm format:check    # what CI runs: fails on unformatted files, doesn't rewrite
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
- `frontend/src/styles/event-palette.css` for event colors, in both themes.
  It is the only place they are defined: it defines `--wt-event-<type>-<variant>-bg/-fg` CSS variables, the
  `.event-*` classes in `_shifts.scss` are generated from them, and `getEventColor()` /
  `getEventTextColor()` in `lib/hday/presentation.ts` return `var(--wt-event-…)` references instead of hex.
  Change a color there and update the table in `docs/hday-format-spec.md`; nothing else.
  `tests/lib/eventPalette.test.ts` reads the CSS tokens and pins WCAG AA text contrast, that no two full-day
  colors are near-identical, and that the helpers, generated classes and compiled Tailwind utilities
  only use declared colors
- User-facing event type names come from the `event_type_*` messages via `getEventTypeLabel()` in
  `lib/hday/presentation.ts`, so they are translated; don't reintroduce English strings there

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
- List-style tables (search, click-to-sort headers, pagination) share `hooks/useDataTable.ts`,
  `components/shared/SortableHeaderCell.tsx` and `components/shared/TablePagination.tsx` — reuse them
  instead of hand-rolling sort/search/paging. Render body cells directly in the row markup rather than via
  column `cell` renderers: TanStack renders those as components, so a column list that changes identity
  remounts the buttons in every row and drops clicks. Join searchable fields with `\n` (not a space) so a
  query can't match across two columns
- Styling uses Bootstrap + SCSS alongside prefixed Tailwind v4 utilities; #1376 tracks the staged
  migration to Tailwind + Base UI. Follow "Tailwind / Bootstrap coexistence" below for generation,
  layers, tokens and lint. Keep logic in hooks/utils, use classes instead of new inline styles and
  keep light and dark themes working.
- Visual review: UI that needs the .hday helper (the Team tab) can be checked without the real helper by
  seeding `worktime_device_preferences` (`{"hdayHelper":{"url":"http://localhost:<port>"}}`) and
  `worktime_user_state` (`enableTimeOff: true`, `lastUsed.timeOffView: "team"`, `hasCompletedOnboarding:
  true`) in localStorage, and running a tiny stub that answers `/health` and
  `/team/:id/hday?format=parsed`. Check light, dark and a ~390px viewport. Full-page screenshots draw
  `position: fixed` elements (e.g. the mobile "+" button) at the top of the page, so judge overlap in a
  normal viewport capture
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

## Deferred work and repo scope

If a gap fits inside the change already in progress — same repository, fixable now, nothing else it
depends on is missing — fix it there instead of deferring it. Opening an issue for something you could
just do is its own way of leaving it undone.

When a change surfaces work that is legitimately out of scope (it belongs in another repository, depends
on work that doesn't exist yet, or was deliberately excluded by a product decision), open a concrete
GitHub issue for it before considering the change done. A sentence in a comment, commit message or PR
description is not the same as something that will actually happen. Check for an existing issue first,
and link the originating issue/PR instead of copying its context.

Route each issue to the repository that owns the work: `tjorim/worktime` owns this app (web, backend,
Android, Pebble, hday-helper); shared VPS infrastructure (Caddy, Keycloak, scheduling, backups) lives in
the separate infra stack noted under Layout; the sibling apps (`tjorim/travel`,
`tjorim/champagnefestival`) own their own code even where they share this stack. Cross-app frontend
decisions are recorded as issues in each repo (for example #1375 route loaders and #1376 Tailwind + Base
UI here) — check them before adding new frontend infrastructure.

GitHub issues are living documents: never add comments to them. Record clarifications, decisions, new
sub-issue links and corrections by editing the issue body (read it first, keep the original text, and
add or adjust a clearly headed section). This applies to every repository above, including closed issues.

## Tailwind / Bootstrap coexistence

Tailwind v4 and Base UI are installed alongside Bootstrap. Generate new shared primitives on demand
with `cd frontend && pnpm dlx shadcn@latest add <component>`; `components.json` explicitly pins
`base-nova` (Base UI), Lucide and the `tw` prefix. Own/restyle the generated source in
`src/components/ui/`; all generated `cn` imports resolve to `@/lib/utils` (clsx + tailwind-merge,
configured for the prefix). Do not run init over our existing palette or bulk-generate components.

Use `tw:` utilities (for example `tw:px-2`, `tw:text-muted-foreground`), with prefixed variants such as
`tw:dark:bg-background`. The dark variant matches `[data-bs-theme="dark"]`. Theme tokens in
`src/styles/tailwind.css` reference existing `--bs-*` and `--wt-*` variables, including every event
palette entry; keep palette values in `event-palette.css` and update aliases if entries are added.
Do not add raw colour literals, arbitrary values or new inline styles.

`main.scss` establishes `theme, legacy, base, components, utilities` order and loads the configured
Bootstrap/Worktime Sass through `meta.load-css` inside `legacy`. External legacy CSS imports use
`layer(legacy)` at the top level (CSS imports nested in a layer do not work). Keep legacy styling in
`_legacy.scss` and its modules. Tailwind imports only theme and utilities, never preflight; Bootstrap
owns reboot. Normal Tailwind utilities win over normal legacy declarations. Bootstrap's `!important`
utilities still win: remove the conflicting Bootstrap utility when migrating, rather than adding
another important declaration. The prefix prevents accidental restyling of legacy `p-2`, `border`, etc.

`oxlint.config.ts` activates `@shadcn/lint`: no-arbitrary-values, no-raw-colors, no-inline-styles and
no-unknown-classes. `legacy-classes.json` is generated from compiled Sass plus Bootstrap Icons,
Frappe Gantt and Schedule-X CSS by `pnpm generate-legacy-classes`; lint checks it for drift. Its printed
count is a migration progress measure (icons contribute a fixed floor until their migration).
Never hand-edit this list. A separate short list in the config permits existing DOM hooks without CSS.
`legacy-inline-styles.json` freezes existing property allowances by file for the staged migration;
remove allowances as those components migrate, and do not extend them for new code.

Verify new components in light and dark, and run lint, typecheck, tests and build. The
`tailwind-coexistence.spec.ts` browser test checks a real Bootstrap/Tailwind padding conflict and token
resolution in both themes.

### Removing the coexistence scaffolding (#1384)

The `tw:` prefix and `legacy` layer are temporary migration scaffolding. As each component migrates,
delete its unused legacy selectors, regenerate the class list and remove its inline-style allowances.
Keep the prefix until Bootstrap and all potentially colliding legacy utilities are gone.

The final cleanup is tracked in #1384 and must include:

- Remove Bootstrap, react-bootstrap and Bootstrap Icons, then delete obsolete legacy Sass, the
  `meta.load-css` wrapper and the `legacy` layer declaration. Keep required third-party styles (for
  example Schedule-X and Frappe Gantt) in an appropriate layer below utilities.
- Delete `legacy-classes.json`, `legacy-inline-styles.json`, their generator/helper, the generation and
  drift-check commands and the associated lint allowances/overrides. Audit CSS-less DOM hooks:
  remove obsolete hooks or use explicit data attributes for integrations/tests instead of a blanket
  class allowance. Keep all four shadcn lint rules active without migration exceptions.
- Remove `prefix(tw)` from both Tailwind imports, clear `tailwind.prefix` in `components.json` and
  remove the prefix configuration from `@/lib/utils`'s tailwind-merge setup. Update every utility and
  variant in source and tests together (`tw:px-2` → `px-2`, `tw:dark:bg-background` →
  `dark:bg-background`), including dynamic class builders; audit for leftover `tw:` references.
- Replace Bootstrap token dependencies and `data-bs-theme` with the final theme mechanism. Preserve
  the single event palette source and token aliases. Decide whether to enable Tailwind preflight only
  after Bootstrap reboot is removed, and verify that base-style change explicitly.
- Update or replace coexistence-specific tests with final token, dark-variant and class-merging checks,
  and rewrite this guidance for the final stack. Run lint, formatting, app/test type checks, tests and
  build; capture the main views in both themes at desktop and mobile sizes.
