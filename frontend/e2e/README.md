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

- **Manual debugging in a real browser**:
  ```bash
  VITE_MSW=true pnpm exec vite --no-open      # terminal 1
  pnpm exec playwright test --project=setup   # once, generates e2e/.auth/user.json
  node e2e/open-app.mjs                       # terminal 2 — opens an onboarded window
  ```

`auth.setup.ts` seeds two things into localStorage before saving storageState:

1. The same `oidc.user:<authority>:<client_id>` entry a real Keycloak login
   would leave behind (matching `src/config/oidc.ts`'s storage format), so
   the header shows "Synced" instead of an anonymous/offline state.
2. The app's own `worktime_user_state` entry (see
   `src/contexts/SettingsContext.tsx`) with `hasCompletedOnboarding: true`,
   a `scheduleType`, and `settings.enableTimeTracking: true` — the same shape
   the app itself persists after a real user finishes the wizard.

This is test/dev tooling only — `src/config/oidc.ts`,
`src/contexts/AuthContext.tsx`, and `src/contexts/SettingsContext.tsx` are
untouched, and a real first-time visitor sees exactly the same wizard as
before.
