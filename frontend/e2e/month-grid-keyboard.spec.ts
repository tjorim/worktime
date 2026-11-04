import { expect, test } from "@playwright/test";
import { expectNoAccessibilityViolations } from "./axe";

for (const theme of ["light", "dark"] as const) {
  for (const width of [1280, 390]) {
    test(`month grid follows the ARIA grid keyboard model (${theme}, ${width})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme: theme });
      await page.clock.setFixedTime(new Date(2026, 10, 4, 12, 0, 0));
      await page.goto(`/e2e/fixtures/month-grid.html?theme=${theme}`);
      const grid = page.getByRole("grid");
      await expect(grid).toHaveAccessibleDescription(/arrow keys move between days/i);
      await expectNoAccessibilityViolations(page, `month grid (${theme}, ${width})`);

      // Today (Wed 4 Nov) is the single tab stop; arrows move from there.
      const today = grid.locator('[role="gridcell"][data-today]');
      await expect(grid.locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1);
      await today.focus();
      await page.keyboard.press("ArrowDown");
      await expect(page.locator(":focus")).toHaveAccessibleDescription(/November 11, 2026/);
      await page.keyboard.press("ArrowUp");
      await expect(page.locator(":focus")).toHaveAccessibleDescription(/November 4, 2026/);
      await page.keyboard.press("Home");
      await expect(page.locator(":focus")).toHaveAccessibleDescription(/November 2, 2026/);
      await page.keyboard.press("End");
      await expect(page.locator(":focus")).toHaveAccessibleDescription(/November 8, 2026/);
      await page.keyboard.press("PageDown");
      await expect(page.getByTestId("month-title")).toContainText("December 2026");
      await expect(page.locator(":focus")).toHaveAccessibleDescription(/December 8, 2026/);
      await page.keyboard.press("PageUp");
      await expect(page.locator(":focus")).toHaveAccessibleDescription(/November 8, 2026/);
      await page.screenshot({ path: `../docs/screenshots/1699/${theme}-${width}-grid.png` });
    });
  }
}
