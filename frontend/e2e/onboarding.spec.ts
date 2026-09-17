import { test, expect } from "@playwright/test";

/**
 * Runs under the default "chromium" project — a fresh browser context with
 * no seeded storageState. Confirms auth.setup.ts's seeding is opt-in per
 * project (see playwright.config.ts) and doesn't leak into ordinary specs:
 * a first-time visitor still sees the real onboarding wizard.
 */
test("a fresh session still shows the first-run wizard", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Welcome to Worktime!")).toBeVisible();
  await expect(page.getByText(/select your schedule/i).first()).toBeVisible();
});
