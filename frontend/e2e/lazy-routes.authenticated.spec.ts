import { expect, test } from "@playwright/test";

/**
 * Settings is a code-split route (#1513). These run against the dev server, where
 * the route's module is served from /src/pages/SettingsPage.tsx; the production
 * chunk, service worker and offline behaviour are covered by pwa-offline.pwa.spec.ts.
 */
test.describe("lazy settings route", () => {
  // The MSW worker would otherwise intercept the module request before page.route sees it.
  test.use({ serviceWorkers: "block" });

  test("back and forward move between home and settings", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.locator("main")).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("main")).toBeVisible();

    await page.goForward();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole("button", { name: "Back to app" })).toBeVisible();
  });

  test("a direct link keeps the requested section", async ({ page }) => {
    await page.goto("/settings?section=data");
    await expect(page.getByRole("button", { name: "Back to app" })).toBeVisible();
    await expect(page).toHaveURL(/section=data/);
  });

  test("a chunk that fails to load shows recovery and Reload Page loads it", async ({ page }) => {
    const chunk = "**/src/pages/SettingsPage.tsx*";
    await page.route(chunk, (route) => route.abort());
    await page.goto("/settings");
    await expect(
      page.getByRole("alert").filter({ hasText: "Could not load this page" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Try Again" })).toHaveCount(0);

    await page.unroute(chunk);
    await Promise.all([
      page.waitForEvent("load"),
      page.getByRole("button", { name: "Reload Page" }).click(),
    ]);

    await expect(page.getByRole("button", { name: "Back to app" })).toBeVisible();
  });
});
