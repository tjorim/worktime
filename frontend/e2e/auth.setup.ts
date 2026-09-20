import { test as setup } from "@playwright/test";

/**
 * Playwright's documented "authenticate once, reuse everywhere" pattern
 * (https://playwright.dev/docs/auth) applied to this app's react-oidc-context
 * setup. Seeds the same localStorage entry a real Keycloak login would leave
 * behind, plus the app's own onboarding/schedule/feature-toggle state so
 * authenticated specs land straight on real content instead of the first-run
 * wizard — then saves it all as reusable storageState.
 *
 * This never touches application source code: it's Playwright constructing a
 * valid, already-onboarded session up front, the same way any e2e suite
 * authenticates against a real login flow.
 *
 * Run via the "setup" project (see playwright.config.ts) before any spec file
 * that opts in with `test.use({ storageState: authFile })` (or, for this repo,
 * any file named `*.authenticated.spec.ts` — see playwright.config.ts).
 */

export const authFile = "e2e/.auth/user.json";

// Matches frontend/src/config/oidc.ts's own defaults, overridable the same way.
const OIDC_AUTHORITY =
  process.env.VITE_OIDC_AUTHORITY ?? "http://localhost:9000/application/o/worktime";
const OIDC_CLIENT_ID = process.env.VITE_OIDC_CLIENT_ID ?? "worktime";
const oidcStorageKey = `oidc.user:${OIDC_AUTHORITY}:${OIDC_CLIENT_ID}`;

// This repo has no backend dev-auth-bypass token wired through the frontend
// (unlike champagnefestival/daynest) — worktime's e2e runs entirely against
// VITE_MSW=true, so the exact token value only needs to satisfy the mock
// worker, not a real backend. Any fixed string works for that purpose.
const accessToken = process.env.DEV_AUTH_BYPASS_TOKEN ?? "mock-access-token";

function buildFakeOidcUser() {
  return {
    id_token: accessToken,
    session_state: null,
    access_token: accessToken,
    refresh_token: null,
    token_type: "Bearer",
    scope: "openid profile email",
    profile: {
      sub: "e2e-dev-user",
      preferred_username: "e2e-dev-user",
      name: "E2E Dev User",
      email: "e2e-dev-user@localhost",
    },
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
  };
}

// Matches SettingsContext.tsx's WorktimeUserState shape, persisted as plain
// JSON under USER_STATE_STORAGE_KEY (constants/storageKeys.ts). Setting
// hasCompletedOnboarding skips the "Welcome to Worktime" wizard entirely
// (App.tsx: `useState(() => !hasCompletedOnboarding)`), scheduleType clears
// the "select your schedule" prompt, and settings.enableTimeTracking exposes
// the Time Tracking tab (MainTabs.tsx) without a trip through Settings ->
// Features. lastUsed also lands the app straight on the Weekly Summary view.
const userStateStorageKey = "worktime_user_state";

function buildOnboardedUserState() {
  return {
    hasCompletedOnboarding: true,
    myTeam: null,
    scheduleType: "9-5",
    settings: {
      timeFormat: "24h",
      theme: "auto",
      notifications: "off",
      enableTimeOff: true,
      enableTimeTracking: true,
      enableGantt: false,
      enableCrossBorderTracking: false,
      enableUnifiedCalendar: false,
      homeCountry: null,
      officeCountry: null,
      hdayUsername: null,
    },
    lastUsed: {
      activeTab: "timetracking",
      scheduleView: "schedule",
      otherSchedule: null,
      timeOffView: "table",
      timeTrackingView: "weekly",
      otherTeam: null,
      ganttViewMode: "Day",
      ganttView: "chart",
    },
  };
}

setup("authenticate and skip onboarding", async ({ page, baseURL }) => {
  // Navigate first so the localStorage writes land on the app's own origin.
  await page.goto(baseURL ?? "/");
  await page.evaluate(
    ([oidcKey, oidcUser, userStateKey, userState]) => {
      window.localStorage.setItem(oidcKey, oidcUser);
      window.localStorage.setItem(userStateKey, userState);
    },
    [
      oidcStorageKey,
      JSON.stringify(buildFakeOidcUser()),
      userStateStorageKey,
      JSON.stringify(buildOnboardedUserState()),
    ] as [string, string, string, string],
  );
  await page.context().storageState({ path: authFile });
});
