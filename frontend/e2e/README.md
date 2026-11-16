# E2E tests

Playwright, config in `../playwright.config.ts`. Tests run against
`pnpm exec vite --no-open` with `VITE_MSW=true` (mocked API responses via
`src/mocks/`, no real backend needed).

## Auth and onboarding

Worktime's core schedule/calendar UI doesn't actually sit behind a login wall
— it works fully offline, and signing in only adds cross-device sync. The
real friction for e2e is the first-run experience: a "Welcome to Worktime"
wizard, a "select your schedule" prompt, and the Time Tracking tab being
disabled until turned on in Settings → Features. Clicking through all of that
in every test would make the suite slow and brittle, so we use Playwright's
own recommended pattern instead — set up once, save the session, reuse it:

- **New authenticated e2e specs**: name the file `*.authenticated.spec.ts`. It
  automatically runs under the `chromium-authenticated` project (see
  `playwright.config.ts`), which depends on the `setup` project
  (`auth.setup.ts`) and loads its `storageState`. See
  `weekly-summary.authenticated.spec.ts` / `calendar.authenticated.spec.ts`
  for the pattern. Existing specs are unaffected — the default `chromium`
  project still starts from a clean, unseeded session, which is what
  `onboarding.spec.ts` needs to confirm the real first-run wizard still shows.

- **Service worker and production-build specs**: name the file `*.pwa.spec.ts`. It
  runs under the `chromium-pwa` project against `vite build` + `vite preview`
  (second `webServer` in `playwright.config.ts`, built into
  `node_modules/.e2e-pwa-dist` so it never overwrites `dist/`), because the dev
  server keeps the service worker off. See `pwa-offline.pwa.spec.ts`: offline use of the
  code-split routes from the Workbox precache, and recovery when a route chunk
  fails to load. These specs have no MSW, so stick to public routes such as `/privacy`.

- **Manual debugging in a real browser**:
  ```bash
  VITE_MSW=true pnpm exec vite --no-open      # terminal 1
  pnpm exec playwright test --project=setup   # once, generates e2e/.auth/user.json
  node e2e/open-app.mjs                       # terminal 2 — opens an onboarded window
  ```

`auth.setup.ts` seeds three things into localStorage before saving storageState:

1. The same `oidc.user:<authority>:<client_id>` entry a real Keycloak login
   would leave behind (matching `src/config/oidc.ts`'s storage format), so
   the header shows "Synced" instead of an anonymous/offline state.
2. The app's own `worktime_user_state` entry (see
   `src/contexts/SettingsContext.tsx`) with `hasCompletedOnboarding: true`,
   a `scheduleType`, and `settings.enableTimeTracking: true` — the same shape
   the app itself persists after a real user finishes the wizard.
3. The preferences owner (`USER_STATE_OWNER_STORAGE_KEY` in
   `src/constants/storageKeys.ts`), set to the fake OIDC user's subject. This
   makes the seeded preferences account-owned rather than unclaimed legacy
   state, which the account-isolation flow deliberately restores instead of
   uploading.

This is test/dev tooling only — `src/config/oidc.ts`,
`src/contexts/AuthContext.tsx`, and `src/contexts/SettingsContext.tsx` are
untouched, and a real first-time visitor sees exactly the same wizard as
before.

## Accessibility scans

`accessibility.spec.ts` (public routes) and `accessibility.authenticated.spec.ts`
(onboarded, signed-in routes) run `@axe-core/playwright` with the `wcag2a`,
`wcag2aa`, `wcag21a` and `wcag21aa` tags in light, dark and a 390px-wide
viewport, and fail on any violation. The shared helper and the (empty)
allow-list live in `axe.ts`; an allow-list entry needs a reason. Add new routes
to the route lists in those specs. Screen-reader behaviour and anything axe
cannot compute still needs a manual review.

## API fixture contracts

`pnpm typecheck:tests` includes all E2E specs, fixture pages and Playwright configs.
Use `jsonResponse<GeneratedResponse>(body)` for test-local fetch/MSW responses,
`jsonBody<GeneratedResponse>(body)` for injected `json()` doubles, and
`routeJson<GeneratedResponse>(body)` for Playwright fulfilment. Import records
from `@/api-types`. These helpers deliberately prevent type inference from
accepting an arbitrary successful body. Browser-evaluated functions cannot
capture runtime imports: use `satisfies GeneratedResponse` inside them instead.
Shared MSW handlers retain their generated response generics and also name the
response type at `HttpResponse.json`.

`syncPushResults(overrides)` supplies the six collections the backend always
sends; `syncRecordResult(overrides)` supplies required nullable result metadata.
Preferences envelopes and account fixtures must include their response metadata;
request bodies may still omit fields with defaults.

Use `uncheckedJson(reason, body, init)` or `uncheckedBody(reason, body)` only for
intentional errors, malformed inputs, unconsumed control responses, or the
separate hday-helper service. Keep the reason visible beside the fixture and
retain the assertions testing the exceptional behaviour. SSE framing and raw
non-JSON diagnostic constructors have local `fixture-contract` comments. Local
storage, IndexedDB, backup files and OIDC provider sessions are persistence or
external-service contracts, not this backend's API records.

`tests/mocks/fixtureContracts.test.ts` scans shared handlers, unit/integration
tests and E2E sources for unchecked response constructors, `json()` doubles and
browser fulfilment. Its synthetic regressions check the guard itself; compile-only
negative cases in `tests/types/apiFixtures.ts` check generated required fields and
nested shapes. This is static enforcement, not runtime JSON-schema validation,
and does not infer which endpoint a developer intended a fixture to represent.

The obsolete `/api/time-tracking/state` and `/api/time-off/requests` mocks and
mock-only scenarios were removed: the app has no callers or backend routes for
them. Tracking and time off use local collections and the real sync handlers.
