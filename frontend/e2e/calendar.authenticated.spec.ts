import { test, expect } from "@playwright/test";

/**
 * Runs under the "chromium-authenticated" project — see
 * weekly-summary.authenticated.spec.ts for the pattern.
 */
test.describe("Working calendar (authenticated)", () => {
  test("shows the seeded 9-5 schedule with no setup prompt", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Calendar" }).click();

    await expect(page.getByText("My Working Calendar")).toBeVisible();
    await expect(page.getByText(/select your schedule/i)).toHaveCount(0);
    // A weekday cell from the 9-5 roster should show a "D" (day-shift) marker.
    await expect(page.locator("text=/^D$/").first()).toBeVisible();
  });
});
