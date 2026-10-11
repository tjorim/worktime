import { test } from "@playwright/test";
import { accessibilityContexts, expectNoAccessibilityViolations } from "./axe";

/**
 * axe scans of the onboarded, signed-in app — see accessibility.spec.ts for the
 * public routes and axe.ts for the shared rules and allow-list.
 */
const settingsSections = [
  "scheduleTeam",
  "general",
  "features",
  "timeTracking",
  "account",
  "data",
  "about",
] as const;

for (const context of accessibilityContexts) {
  test.describe(`accessibility, authenticated (${context.name})`, () => {
    test.use({ colorScheme: context.colorScheme, viewport: context.viewport });

    test("home has no axe violations", async ({ page }) => {
      await page.goto("/");
      await page.locator("main").waitFor();
      await expectNoAccessibilityViolations(page, `/ (${context.name})`);
    });

    test("calendar tab has no axe violations", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("tab", { name: "Calendar" }).click();
      await page.getByText("My Working Calendar").waitFor();
      await expectNoAccessibilityViolations(page, `calendar tab (${context.name})`);
    });

    for (const section of settingsSections) {
      test(`settings ${section} has no axe violations`, async ({ page }) => {
        await page.goto(`/settings?section=${section}`);
        await page.locator("main").waitFor();
        await expectNoAccessibilityViolations(page, `settings ${section} (${context.name})`);
      });
    }
  });
}
