import { test, expect } from "@playwright/test";

/**
 * Runs under the "chromium-authenticated" project (see playwright.config.ts),
 * which loads storageState produced by e2e/auth.setup.ts — no onboarding
 * wizard, no "select your schedule" prompt, Time Tracking already enabled.
 * Name new files `*.authenticated.spec.ts` to opt into the same fast path.
 */
test.describe("Weekly time-tracking summary (authenticated)", () => {
  test("lands straight on Weekly Summary with the seeded week's data", async ({ page }) => {
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
