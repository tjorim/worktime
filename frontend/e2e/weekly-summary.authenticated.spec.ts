import { test, expect } from "@playwright/test";

/**
 * Runs under the "chromium-authenticated" project (see playwright.config.ts),
 * which loads storageState produced by e2e/auth.setup.ts — no onboarding
 * wizard, no "select your schedule" prompt, Time Tracking already enabled.
 * Name new files `*.authenticated.spec.ts` to opt into the same fast path.
 */
test.describe("Weekly time-tracking summary (authenticated)", () => {
  test("lands straight on Weekly Summary with the seeded week's data", async ({ page }) => {
    // The MSW seed only contains tasks that have already finished (see
    // seedTimeTrackingWeek), so on a Monday morning the week is empty. Pin the
    // clock to a mid-week afternoon so the spec doesn't depend on when CI runs.
    // The date is in the past so the fake OIDC session from auth.setup.ts is
    // still valid.
    await page.clock.install({ time: new Date(2026, 8, 30, 15, 0, 0) });
    await page.goto("/");

    // No first-run wizard, no schedule prompt.
    await expect(page.getByText("Welcome to Worktime!")).toHaveCount(0);
    await expect(page.getByText(/select your schedule/i)).toHaveCount(0);

    await expect(page.getByText("Weekly Overview")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Hours at a Glance" })).toBeVisible();
    await expect(page.getByText("Deep work").first()).toBeVisible();
    await expect(page.getByText("Total Hours").first()).toBeVisible();
  });
});
