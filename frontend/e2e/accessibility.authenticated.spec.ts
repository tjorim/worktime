import { USER_STATE_STORAGE_KEY } from "@/constants/storageKeys";
import { expect, test } from "@playwright/test";
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

    test.beforeEach(async ({ page }) => {
      await page.clock.setFixedTime(new Date(2026, 8, 30, 15, 0, 0));
      await page.addInitScript((key) => {
        const state = JSON.parse(localStorage.getItem(key) ?? "{}");
        state.settings = {
          ...state.settings,
          enableUnifiedCalendar: true,
          enableGantt: true,
          enableTimeTracking: true,
        };
        localStorage.setItem(key, JSON.stringify(state));
      }, USER_STATE_STORAGE_KEY);
    });

    for (const tab of ["Unified", "Gantt", "Time Tracking"]) {
      test(`${tab} has no axe violations`, async ({ page }) => {
        await page.goto("/");
        await page.getByRole("tab", { name: tab, exact: true }).click();
        if (tab === "Unified") {
          await page.locator(".sx__event").first().waitFor();
        } else if (tab === "Gantt") {
          await page.getByRole("button", { name: "Add Task", exact: true }).click();
          await page.getByLabel("Name", { exact: true }).fill("Accessibility task");
          await page
            .getByRole("dialog")
            .getByRole("button", { name: "Add Task", exact: true })
            .click();
          await page.locator(".viewmode-select").waitFor();
        } else {
          await page.getByRole("button", { name: "Daily Log", exact: true }).click();
          await page.getByTestId("now-line").waitFor();
        }
        if (tab === "Gantt") {
          await page.getByRole("combobox", { name: "Gantt view" }).selectOption("Week");
          await expect(page.getByRole("combobox", { name: "Gantt view" })).toHaveValue("Week");
        }
        if (tab === "Time Tracking") {
          await page.getByRole("button", { name: "Daily Log", exact: true }).hover();
        } else {
          await page.mouse.move(0, 0);
        }
        await expectNoAccessibilityViolations(page, `${tab} (${context.name})`);
      });
    }

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
        if (section === "account") {
          // The initial pull enables this button with an opacity transition. Scan settled UI.
          const sync = page.getByRole("button", { name: "Sync now", exact: true });
          await expect(sync).toBeEnabled();
          await expect(sync).toHaveCSS("opacity", "1");
        }
        await expectNoAccessibilityViolations(page, `settings ${section} (${context.name})`);
      });
    }
  });
}
