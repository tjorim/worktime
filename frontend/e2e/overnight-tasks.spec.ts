import { test, expect } from "@playwright/test";
for (const theme of ["light", "dark"]) {
  for (const width of [1280, 390]) {
    test(`overnight entry (${theme}, ${width})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/e2e/fixtures/overnight-tasks.html?theme=${theme}`);
      await page.getByLabel("Task", { exact: true }).fill("Night shift");
      await page.getByLabel("Start", { exact: true }).fill("23:00");
      await page.getByLabel("Stop", { exact: true }).fill("06:30");
      await expect(page.getByText(/An earlier stop time means/)).toBeVisible();
      await page.mouse.move(0, 0);
      await page.screenshot({ path: `../docs/screenshots/1700/${theme}-${width}-form.png` });
      await page.getByRole("button", { name: "Add Task", exact: true }).click();
      await expect(page.getByText(/Stop: 06:30 \(2026-01-05\)/)).toBeVisible();
      await page.mouse.move(0, 0);
      await page.screenshot({
        path: `../docs/screenshots/1700/${theme}-${width}-saved.png`,
        fullPage: true,
      });
      if (width === 390) {
        await page.getByText(/Stop: 06:30/).click({ button: "right" });
        await page.getByRole("menuitem", { name: /Edit/ }).click();
      } else {
        await page.getByRole("button", { name: "Edit Night shift", exact: true }).click();
      }
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText(/An earlier stop time means/)).toBeVisible();
      await dialog.getByLabel("Stop", { exact: true }).fill("07:00");
      await page.mouse.move(0, 0);
      await page.screenshot({ path: `../docs/screenshots/1700/${theme}-${width}-edit.png` });
      await dialog.getByRole("button", { name: "Save Changes", exact: true }).click();
      await expect(page.getByText(/Stop: 07:00 \(2026-01-05\)/)).toBeVisible();
      await page.goto(`/e2e/fixtures/dialog-pickers.html?mode=template&theme=${theme}`);
      await page.getByLabel("Start", { exact: true }).fill("23:00");
      await page.getByLabel("Stop", { exact: true }).fill("06:30");
      await expect(page.getByText(/An earlier stop time means/)).toBeVisible();
      await page.mouse.move(0, 0);
      await page.screenshot({ path: `../docs/screenshots/1700/${theme}-${width}-template.png` });
    });
  }
}

test("overnight timer stops with one action", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-01-05T06:30:00") });
  await page.goto("/e2e/fixtures/overnight-tasks.html?timer");
  await page.getByRole("button", { name: /Stop Timer/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/Stop: 06:30 \(2026-01-05\)/)).toBeVisible();
});
