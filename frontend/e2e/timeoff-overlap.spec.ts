import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  for (const width of [1366, 390]) {
    test(`overlap warnings show the collision (${theme}, ${width})`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 768 });
      const fixture = `/e2e/fixtures/timeoff-overlap.html?theme=${theme}`;
      const capture = async (state: string) => {
        const path = testInfo.outputPath(`${theme}-${width}-${state}.png`);
        await page.screenshot({ path, fullPage: true });
        await testInfo.attach(state, { path, contentType: "image/png" });
      };

      await page.goto(`${fixture}&mode=calendar`);
      const warned = page.getByRole("button", { name: /Overlapping/ });
      await expect(warned).toHaveCount(6);
      for (const [index, entry] of (await warned.all()).entries()) {
        const day = 11 + Math.floor(index / 2);
        const description = new Intl.DateTimeFormat("en-GB", { dateStyle: "full" }).format(
          new Date(2026, 10, day),
        );
        const cell = entry.locator('xpath=ancestor::*[@role="gridcell"]');
        await expect(cell).toHaveAccessibleDescription(description);
        await expect(entry.locator("svg")).toBeVisible();
        await expect(entry).toHaveText(/^(Autumn break|Sick leave)$/);
        const label = entry.getByText(/^(Autumn break|Sick leave)$/);
        await expect(label).toBeVisible();
        expect(
          await label.evaluate(
            (node) =>
              node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight,
          ),
        ).toBe(true);
      }
      await expect(page.getByRole("button", { name: /In office.*Overlapping/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /In office/ }).first()).toBeVisible();
      await capture("calendar");

      await page.goto(`${fixture}&mode=table`);
      await expect(
        page.getByText("Overlaps with Autumn break from 11 Nov 2026 to 13 Nov 2026"),
      ).toBeVisible();
      await expect(
        page.getByText("Overlaps with Sick leave from 11 Nov 2026 to 13 Nov 2026"),
      ).toBeVisible();
      await expect(page.getByText(/Overlaps with In office/)).toHaveCount(0);
      await capture("table");

      await page.goto(fixture);
      const warning = page.getByRole("status");
      await page.locator("#eventStart").fill("2026-11-11");
      await expect(warning).toHaveCount(0);
      await page.locator("#eventEnd").fill("2026-11-20");
      await expect(warning).toContainText(
        "Overlaps with Autumn break from 11 Nov 2026 to 13 Nov 2026",
      );
      await page.locator("#eventType").selectOption("weekly");
      await page.locator("#eventWeekday").selectOption("3");
      await expect(warning).toContainText(/Overlaps with In office every Wed/);
      await page.getByRole("button", { name: "Add", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);

      for (const mode of ["edit", "view"]) {
        await page.goto(`${fixture}&mode=${mode}`);
        await expect(warning).toContainText(
          "Overlaps with Autumn break from 11 Nov 2026 to 13 Nov 2026",
        );
      }

      await page.goto(`${fixture}&lang=nl`);
      await page.locator("#eventStart").fill("2026-11-14");
      await expect(warning).toContainText("Overlapt met Business trip op 14 nov 2026");
    });
  }
}
