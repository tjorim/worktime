import { expect, test, type Page } from "@playwright/test";

/**
 * Settings is a code-split route (#1513). These run against the dev server, where
 * the route's module is served from /src/pages/SettingsPage.tsx; the production
 * chunk, service worker and offline behaviour are covered by pwa-offline.pwa.spec.ts.
 */
// The header ("Back to app") and a `main` landmark also render around the route error page,
// so only the section heading, which SettingsPage itself renders, proves Settings loaded.
const sectionHeading = (page: Page, name: string) =>
  page.getByRole("heading", { level: 1, name, exact: true });

test.describe("lazy settings route", () => {
  // The MSW worker would otherwise intercept the module request before page.route sees it.
  test.use({ serviceWorkers: "block" });

  test("back and forward move between home and settings", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(sectionHeading(page, "Schedule & team")).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(sectionHeading(page, "Schedule & team")).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Schedule" })).toBeVisible();

    await page.goForward();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(sectionHeading(page, "Schedule & team")).toBeVisible();
  });

  test("a direct link keeps the requested section", async ({ page }) => {
    await page.goto("/settings?section=data");
    await expect(sectionHeading(page, "Data & backup")).toBeVisible();
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
    await expect(sectionHeading(page, "Schedule & team")).toHaveCount(0);

    await page.unroute(chunk);
    await Promise.all([
      page.waitForEvent("load"),
      page.getByRole("button", { name: "Reload Page" }).click(),
    ]);

    await expect(sectionHeading(page, "Schedule & team")).toBeVisible();
    await expect(page.getByText("Could not load this page")).toHaveCount(0);
  });
});
