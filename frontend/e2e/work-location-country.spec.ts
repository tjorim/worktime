import { expect, test } from "@playwright/test";
import { expectNoAccessibilityViolations } from "./axe";

for (const theme of ["light", "dark"]) {
  for (const width of [1280, 390]) {
    test(`corrects a legacy country using the keyboard (${theme}, ${width})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 850 });
      await page.goto(`/e2e/fixtures/dialog-pickers.html?mode=work-location&theme=${theme}`);
      await expect(
        page.getByText("Current value: UK. Select a country to correct it."),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
      await expect(page.getByRole("link")).toHaveAttribute("href", "/settings?section=features");
      await page.screenshot({ path: `../docs/screenshots/1694/${theme}-${width}-legacy.png` });
      const picker = page.getByRole("combobox", { name: "Country", exact: true });
      await picker.fill("Japan");
      await expect(page.getByRole("option", { name: "Japan", exact: true })).toBeVisible();
      await expectNoAccessibilityViolations(page, "work-location country picker");
      await page.screenshot({ path: `../docs/screenshots/1694/${theme}-${width}-picker.png` });
      await picker.press("ArrowDown");
      await picker.press("Enter");
      await expect(picker).toHaveValue("Japan");
      await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
      await page.screenshot({ path: `../docs/screenshots/1694/${theme}-${width}-selected.png` });
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeHidden();
    });
  }
}
