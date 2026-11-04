import { expect, test } from "@playwright/test";
for (const theme of ["light", "dark"]) {
  for (const width of [1280, 390]) {
    test(`overlap notices allow saving (${theme}, ${width})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      const capture = async (state: string) =>
        page.screenshot({ path: `../docs/screenshots/1685/${theme}-${width}-${state}.png` });
      await page.goto(`/e2e/fixtures/timeoff-overlap.html?theme=${theme}`);
      await expect(page.getByRole("dialog")).toBeVisible();
      await capture("empty");
      await page.locator("#eventStart").fill("2026-11-11");
      await expect(page.getByRole("status")).toContainText("Overlaps with Autumn break");
      await expect(page.getByRole("button", { name: "Add", exact: true })).toBeInViewport();
      await capture("date");
      await page.locator("#eventEnd").fill("2026-11-20");
      await capture("range");
      await page.locator("#eventType").selectOption("weekly");
      await page.locator("#eventWeekday").selectOption("3");
      await expect(page.getByRole("status")).toContainText("Overlaps with Autumn break");
      await capture("weekly");
      await page.getByRole("button", { name: "Add", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      for (const mode of ["edit", "view", "table", "calendar"]) {
        await page.goto(`/e2e/fixtures/timeoff-overlap.html?theme=${theme}&mode=${mode}`);
        if (mode === "edit" || mode === "view") {
          await expect(page.getByRole("status")).toContainText("Overlaps with Autumn break");
        } else if (mode === "calendar") {
          const entry = page.getByRole("button", { name: /Overlapping entry/ }).first();
          await expect(entry).toBeVisible();
          await expect(entry.locator("svg")).toBeVisible();
        } else await expect(page.getByText(/Overlapping entry/).first()).toBeVisible();
        await capture(mode);
      }
      await page.goto(`/e2e/fixtures/timeoff-overlap.html?theme=${theme}&lang=nl`);
      await page.locator("#eventStart").fill("2026-11-11");
      await expect(page.getByRole("status")).toContainText("Overlapt met Autumn break");
      await capture("dutch");
    });
  }
}
