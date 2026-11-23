import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  for (const width of [1280, 390]) {
    for (const lang of ["en", "nl"]) {
      test(`display consistency (${theme}, ${width}, ${lang})`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        const capture = async (state: string) =>
          page.screenshot({
            path: `test-results/review-screenshots/1683/${lang}-${theme}-${width}-${state}.png`,
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
              page.getByText(lang === "en" ? "AM (half day)" : "Ochtend (halve dag)"),
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

for (const theme of ["light", "dark"]) {
  for (const width of [1366, 390]) {
    test(`time-off vocabulary (${theme}, ${width})`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 1366 ? 768 : 844 });
      for (const mode of ["table", "calendar", "add", "edit"]) {
        await page.goto(`/e2e/fixtures/timeoff-overlap.html?theme=${theme}&mode=${mode}`);
        if (mode === "table") {
          await expect(page.getByText("Vacation", { exact: true })).toBeVisible();
          await expect(page.getByText("No fly", { exact: true })).toBeVisible();
          await expect(page.getByText(/N Training/)).toHaveCount(0);
          if (width === 1366) {
            await expect(page.getByRole("columnheader", { name: "Note" })).toBeVisible();
            const row = page.getByRole("row").filter({ hasText: "Autumn break" });
            await expect(row.getByRole("cell").nth(4)).toHaveText("—");
          }
        } else if (mode === "calendar") {
          await expect(page.getByRole("button", { name: /View Training.*No fly/ })).toBeVisible();
          await expect(
            page.getByRole("button", { name: /View Weekly appointment.*AM \(half day\)/ }).first(),
          ).toBeVisible();
        } else {
          const dialog = page.getByRole("dialog", {
            name: mode === "add" ? "New entry" : "Edit entry",
          });
          const note = dialog.getByLabel("Note (optional)");
          await expect(note).toBeVisible();
          await expect(note).toHaveValue(mode === "add" ? "" : "Sick leave");
          await expect(dialog.getByRole("radio", { name: "Vacation" })).toBeVisible();
        }
        const screenshotName = `${theme}-${width}-${mode}`;
        const path = testInfo.outputPath(`${screenshotName}.png`);
        await page.screenshot({ path });
        await testInfo.attach(screenshotName, { path, contentType: "image/png" });
      }
    });
  }
}
