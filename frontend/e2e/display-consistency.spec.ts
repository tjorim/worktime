import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  for (const width of [1280, 390]) {
    for (const lang of ["en", "nl"]) {
      test(`display consistency (${theme}, ${width}, ${lang})`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        const capture = async (state: string) =>
          page.screenshot({
            path: `../docs/screenshots/1683/${lang}-${theme}-${width}-${state}.png`,
          });

        for (const state of ["populated", "team", "empty"]) {
          await page.goto(
            `/e2e/fixtures/display-consistency.html?theme=${theme}&lang=${lang}&state=${state}`,
          );
          await expect(page.getByRole("heading")).toBeVisible();
          if (state === "populated") {
            await expect(page.getByText("Alex Taylor")).toBeVisible();
            await expect(page.getByText(/a8ff-Ae1d1c24/)).toBeVisible();
            await expect(page.locator("time").first()).toHaveText(
              lang === "en" ? "2 Nov 2026 22:24" : "2 nov 2026 22:24",
            );
            await page.locator("summary").first().click();
          }
          await capture(`activity-${state}`);
        }

        for (const mode of ["table", "add", "edit", "view"]) {
          await page.goto(
            `/e2e/fixtures/timeoff-overlap.html?theme=${theme}&lang=${lang}&mode=${mode}`,
          );
          if (mode === "table") {
            await expect(
              page.getByText(
                lang === "en" ? "Other, AM (half day)" : "Overig, Ochtend (halve dag)",
              ),
            ).toBeVisible();
            await expect(page.getByText("half_am", { exact: true })).toHaveCount(0);
          } else {
            await expect(page.getByRole("dialog")).toBeVisible();
          }
          await capture(`event-${mode}`);
        }
      });
    }
  }
}
