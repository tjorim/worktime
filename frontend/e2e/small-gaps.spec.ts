import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { accessibilityContexts, expectNoAccessibilityViolations } from "./axe";

const contexts = [
  ...accessibilityContexts,
  { name: "narrow-dark", colorScheme: "dark", viewport: { width: 390, height: 844 } },
] as const;

for (const context of contexts) {
  test.describe(`small gaps (${context.name})`, () => {
    test.use({ colorScheme: context.colorScheme, viewport: context.viewport });
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem(
          "worktime_user_state",
          JSON.stringify({
            hasCompletedOnboarding: true,
            scheduleType: "5-shift",
            myTeam: 1,
          }),
        );
      });
      await mkdir("../docs/screenshots/1686", { recursive: true });
    });
    test("unknown routes offer a working link home", async ({ page }) => {
      await page.goto("/this-page-does-not-exist");
      await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
      await expectNoAccessibilityViolations(page, `404 ${context.name}`);
      await page.screenshot({ path: `../docs/screenshots/1686/not-found-${context.name}.png` });
      await page.getByRole("link", { name: "Back to Worktime" }).click();
      await expect(page).toHaveURL("/");
    });
    test("denied sign-in stays visible and offers retry", async ({ page }) => {
      await page.goto(
        "/auth/callback?error=access_denied&error_description=private-provider-diagnostic",
      );
      await expect(page.getByRole("heading", { name: "Sign-in failed" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Try signing in again" })).toBeVisible();
      await expect(page.getByRole("main")).not.toContainText("private-provider-diagnostic");
      await expectNoAccessibilityViolations(page, `sign-in failure ${context.name}`);
      await page.screenshot({
        path: `../docs/screenshots/1686/sign-in-failed-${context.name}.png`,
      });
    });
    test("anonymous header and date-code help work without hover", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("button", { name: "Sign In", exact: true })).toBeVisible();
      const expand = page.getByRole("button", { name: "Expand status" });
      if (await expand.isVisible()) await expand.click();
      const trigger = page.getByRole("button", { name: /^Date code:/ });
      await expect(trigger).toBeVisible();
      await page.screenshot({
        path: `../docs/screenshots/1686/header-date-code-${context.name}.png`,
      });
      await trigger.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectNoAccessibilityViolations(page, `date code ${context.name}`);
      await page.screenshot({
        path: `../docs/screenshots/1686/date-code-help-${context.name}.png`,
      });
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      await trigger.click();
      await expect(page.getByRole("dialog")).toBeVisible();
    });
  });
}
