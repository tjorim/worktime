import { expect, test, type Locator } from "@playwright/test";
import { expectNoAccessibilityViolations } from "./axe";

async function expectUnclippedMenu(list: Locator) {
  await expect
    .poll(() =>
      list.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const x = bounds.left + bounds.width / 2;
        return (
          bounds.top >= 0 &&
          bounds.bottom <= window.innerHeight + 1 &&
          [bounds.top + 2, bounds.bottom - 2].every((y) =>
            element.contains(document.elementFromPoint(x, y)),
          )
        );
      }),
    )
    .toBe(true);
}

for (const theme of ["light", "dark"]) {
  for (const width of [1280, 390]) {
    for (const mode of ["template", "task"]) {
      test(`${mode} picker escapes clipping and stays in the modal (${theme}, ${width})`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 600 });
        await page.goto(`/e2e/fixtures/dialog-pickers.html?mode=${mode}&theme=${theme}`);
        const picker = page.getByRole("combobox", { name: "Label", exact: true });
        await picker.click();
        const list = page.getByRole("listbox");
        await expect(list).toBeVisible();
        await expectUnclippedMenu(list);
        await expectNoAccessibilityViolations(page, `${mode} open picker (${theme}, ${width})`);
        await page.screenshot({ path: testInfo.outputPath("picker-open.png") });
        // A visible DOM node can still be clipped. Hit-test the lower option after scrolling.
        const last = page.getByRole("option", { name: "Label 20", exact: true });
        await last.scrollIntoViewIfNeeded();
        await expect(last).toBeInViewport();
        await last.click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await expect(picker).toHaveValue("Label 20");
        await picker.fill("Label 19");
        await picker.press("ArrowDown");
        await picker.press("Enter");
        await expect(picker).toHaveValue("Label 19");
        if (mode === "task") {
          await page.getByRole("combobox", { name: "Gantt task" }).click();
          await expectUnclippedMenu(page.getByRole("listbox"));
          const project = page.getByRole("option", { name: "Project 20", exact: true });
          await project.scrollIntoViewIfNeeded();
          await project.click();
          await expect(page.getByRole("combobox", { name: "Gantt task" })).toHaveValue(
            "Project 20",
          );
        }
        await picker.focus();
        await picker.press("Tab");
        expect(
          await page
            .getByRole("dialog")
            .evaluate((dialog) => dialog.contains(document.activeElement)),
        ).toBe(true);
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
      });
    }
    test(`welcome country picker supports search and clear (${theme}, ${width})`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/e2e/fixtures/dialog-pickers.html?mode=wizard&theme=${theme}`);
      await page.getByRole("switch").check();
      const country = page.getByRole("combobox", { name: "Home country" });
      await country.fill("Belg");
      await expect(page.getByRole("option", { name: "Belgium", exact: true })).toBeVisible();
      await expectNoAccessibilityViolations(page, `welcome country (${theme}, ${width})`);
      await page.screenshot({ path: testInfo.outputPath("country-open.png") });
      await country.press("ArrowDown");
      await country.press("Enter");
      await expect(country).toHaveValue("Belgium");
      await page.getByRole("button", { name: "Clear selection", exact: true }).click();
      await expect(country).toHaveValue("");
    });
    test(`Gantt dependencies support multiple choices and chip removal (${theme}, ${width})`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/e2e/fixtures/dialog-pickers.html?mode=gantt&theme=${theme}`);
      const dependencies = page.getByRole("combobox", { name: "Dependencies" });
      await dependencies.fill("Label 20");
      await expectNoAccessibilityViolations(page, `dependencies (${theme}, ${width})`);
      await dependencies.press("ArrowDown");
      await dependencies.press("Enter");
      await dependencies.fill("Label 19");
      await dependencies.press("ArrowDown");
      await dependencies.press("Enter");
      await expect(
        page.getByRole("button", { name: "Remove Label 20", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Remove Label 19", exact: true }),
      ).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("dependencies-selected.png") });
      await page.getByRole("button", { name: "Remove Label 20", exact: true }).click();
      await expect(page.getByRole("button", { name: "Remove Label 20", exact: true })).toHaveCount(
        0,
      );
      await expect(
        page.getByRole("button", { name: "Remove Label 19", exact: true }),
      ).toBeVisible();
    });
    test(`warning confirmation uses caution colours (${theme}, ${width})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 600 });
      await page.goto(`/e2e/fixtures/dialog-pickers.html?mode=warning&theme=${theme}`);
      const confirm = page.getByRole("button", { name: "Confirm", exact: true });
      await expect(confirm).toHaveCSS(
        "background-color",
        theme === "light" ? "rgb(255, 243, 205)" : "rgb(51, 39, 1)",
      );
      await expect(confirm).toHaveCSS(
        "color",
        theme === "light" ? "rgb(102, 77, 3)" : "rgb(255, 218, 106)",
      );
    });
  }
}
