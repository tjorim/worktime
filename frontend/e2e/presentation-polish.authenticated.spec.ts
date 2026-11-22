import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { DEVICE_PREFERENCES_STORAGE_KEY, USER_STATE_STORAGE_KEY } from "@/config/storageKeys";

test.use({ reducedMotion: "reduce" });

async function capture(page: Page, info: TestInfo, state: string) {
  const path = info.outputPath(`${state}.png`);
  await page.screenshot({ path });
  await info.attach(state, { path, contentType: "image/png" });
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [390, 1366]) {
    test(`presentation polish at ${width}px in ${theme} mode`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 768 });
      await page.clock.setFixedTime(new Date(2026, 8, 30, 15, 0, 0));
      const startUpToasts: string[] = [];
      await page.exposeFunction("recordStartUpToast", (notice: string) => {
        startUpToasts.push(notice);
      });
      await page.addInitScript(() => {
        new MutationObserver(() => {
          const notice = document.querySelector('[data-slot="toast-viewport"]')?.textContent;
          if (notice && /Checking server|Sync set up successfully/.test(notice)) {
            const record = Reflect.get(window, "recordStartUpToast") as (notice: string) => void;
            record(notice);
          }
        }).observe(document, { subtree: true, childList: true });
      });
      await page.addInitScript(
        ({ key, theme }) => {
          const state = JSON.parse(localStorage.getItem(key) ?? "{}");
          state.settings = { ...state.settings, theme, enableUnifiedCalendar: true };
          localStorage.setItem(key, JSON.stringify(state));
        },
        { key: USER_STATE_STORAGE_KEY, theme },
      );
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Label Breakdown" })).toBeVisible();
      const chartToggle = page.getByRole("button", { name: "Daily Hours by Label" });
      await chartToggle.click();
      const chart = page.getByRole("img", { name: /stacked by label/ });
      await expect(chart.locator('[fill="#2563eb"]').first()).toBeVisible();
      await expect(chart.locator('[fill="#f97316"]').first()).toBeVisible();
      await chart.scrollIntoViewIfNeeded();
      await capture(page, info, "weekly-label-chart");

      await page.getByRole("button", { name: "Daily Log" }).click();
      await expect(page.getByRole("button", { name: "Start Now", exact: true })).toBeVisible();
      await expect(page.getByRole("combobox", { name: /Label/ })).toBeVisible();
      await capture(page, info, "daily-form");
      const quickActions = page.getByRole("button", { name: "Open quick actions" });
      if (width === 390) {
        await expect(quickActions).toBeVisible();
        const trigger = await quickActions.boundingBox();
        const label = await page.getByRole("combobox", { name: /Label/ }).boundingBox();
        expect(trigger!.y + trigger!.height).toBeLessThan(label!.y);
        await page.getByRole("button", { name: "Start Now", exact: true }).scrollIntoViewIfNeeded();
        await capture(page, info, "daily-form-actions");
      }

      await page.getByRole("tab", { name: "Calendar", exact: true }).click();
      const grid = page.getByRole("grid", { name: /September/ });
      await expect(grid).toBeVisible();
      await expect(grid).toHaveAccessibleDescription(/arrow keys move between days/);
      if (width === 390) {
        const trigger = await quickActions.boundingBox();
        const month = await grid.boundingBox();
        expect(trigger!.y + trigger!.height).toBeLessThan(month!.y);
      }
      await capture(page, info, "month-calendar");
      await page.keyboard.press("?");
      const shortcuts = page.getByRole("dialog", { name: "Keyboard Shortcuts" });
      await expect(shortcuts).toContainText(/arrow keys move between days/);
      await capture(page, info, "keyboard-shortcuts");
      await page.keyboard.press("Escape");

      await page.getByRole("tab", { name: "Schedule", exact: true }).click();
      const shiftCodeHelp = page.getByRole("button", { name: "Full Shift Code", exact: true });
      await expect(shiftCodeHelp).toBeVisible();
      await capture(page, info, "schedule");
      await shiftCodeHelp.click();
      await expect(page.getByRole("dialog")).toContainText(/followed by the shift letter/);
      await capture(page, info, "schedule-code-help");
      await page.keyboard.press("Escape");

      await page.getByRole("tab", { name: "Unified", exact: true }).click();
      const intro = page
        .getByRole("alert")
        .filter({ hasText: "Shifts, time off, and time tracking" });
      await expect(intro).toBeVisible();
      await capture(page, info, "unified-intro");
      await intro.getByRole("button", { name: "Close" }).click();
      await expect(intro).toHaveCount(0);
      await capture(page, info, "unified-intro-dismissed");
      await page.reload();
      await page.getByRole("tab", { name: "Unified", exact: true }).click();
      await expect(intro).toHaveCount(0);
      expect(
        await page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key) ?? "{}").dismissedHints?.unifiedCalendar,
          DEVICE_PREFERENCES_STORAGE_KEY,
        ),
      ).toBe(true);
      expect(startUpToasts).toEqual([]);
    });
  }
}
