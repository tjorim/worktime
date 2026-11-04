import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
for (const theme of ["light", "dark"]) {
  for (const width of [1280, 390]) {
    test(`display name validation (${theme}, ${width})`, async ({ page }) => {
      await page.addInitScript((theme) => {
        localStorage.setItem(
          "oidc.user:http://localhost:9000/application/o/worktime:worktime",
          JSON.stringify({
            access_token: "mock-access-token",
            token_type: "Bearer",
            scope: "openid profile",
            expires_at: Math.floor(Date.now() / 1000) + 86400,
            profile: {
              sub: "sync-status-e2e",
              name: "Sync Tester",
              preferred_username: "sync-tester",
            },
          }),
        );
        localStorage.setItem("worktime_user_state_owner", "sync-status-e2e");
        localStorage.setItem("worktime_sync_cursor_sync-status-e2e", "2026-01-01T00:00:00Z");
        localStorage.setItem(
          "worktime_user_state",
          JSON.stringify({
            hasCompletedOnboarding: true,
            scheduleType: "9-5",
            settings: { theme, enableTimeTracking: true },
            lastUsed: { activeTab: "timetracking", timeTrackingView: "weekly" },
          }),
        );
      }, theme);
      await page.goto("/settings?section=account");

      await page.setViewportSize({ width, height: 900 });
      const input = page.locator("#account-display-name");
      await expect(input).toBeEnabled({ timeout: 20000 });
      await input.fill("x".repeat(151));
      await page.getByRole("button", { name: "Save profile" }).click();
      await expect(
        page.getByText("Use no more than 150 characters for the display name."),
      ).toBeVisible();
      await mkdir("../docs/screenshots/1695", { recursive: true });
      await input.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `../docs/screenshots/1695/display-name-invalid-${theme}-${width}.png`,
      });
      await input.fill("Valid Name");
      await page.getByRole("button", { name: "Save profile" }).click();
      await expect(
        page.getByText("Use no more than 150 characters for the display name."),
      ).toHaveCount(0);
    });
  }
}
