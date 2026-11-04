import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  for (const width of [1280, 390]) {
    test(`legacy dependency warnings in table (${theme}, ${width})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/e2e/fixtures/gantt-dependencies.html?theme=${theme}&view=table`);
      await expect(page.getByText("Choose dependencies that still exist.")).toBeVisible();
      await expect(page.getByText("A task cannot depend on itself.")).toBeVisible();
      await expect(page.getByText("These dependencies create a cycle.").first()).toBeVisible();
      await page.getByText("Choose dependencies that still exist.").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `../docs/screenshots/1701/table-${theme}-${width}.png` });
    });
    for (const [reason, message] of [
      ["unknown", "Choose dependencies that still exist."],
      ["self", "A task cannot depend on itself."],
      ["cycle", "These dependencies create a cycle."],
    ]) {
      test(`${reason} dependency (${theme}, ${width})`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/e2e/fixtures/gantt-dependencies.html?theme=${theme}&reason=${reason}`);
        await expect(page.getByRole("alert")).toHaveText(message);
        await page.getByRole("button", { name: "Save Changes", exact: true }).click();
        await expect(page.getByText("Saved", { exact: true })).toHaveCount(0);
        await page.screenshot({ path: `../docs/screenshots/1701/${reason}-${theme}-${width}.png` });
      });
    }
  }
}
