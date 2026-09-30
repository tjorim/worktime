import { expect, test, type Locator } from "@playwright/test";

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
      }) => {
        await page.setViewportSize({ width, height: 600 });
        await page.goto(`/e2e/fixtures/dialog-pickers.html?mode=${mode}&theme=${theme}`);
        const picker = page.getByRole("combobox", { name: "Label", exact: true });
        await picker.click();
        const list = page.getByRole("listbox");
        await expect(list).toBeVisible();
        await expectUnclippedMenu(list);
        // A visible DOM node can still be clipped. Hit-test the lower option after scrolling.
        const last = page.getByRole("option", { name: "Label 20", exact: true });
        await last.scrollIntoViewIfNeeded();
        await expect(last).toBeInViewport();
        await last.click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await expect(page.getByText("Label 20", { exact: true })).toBeVisible();
        await picker.fill("Label 19");
        await picker.press("ArrowDown");
        await picker.press("Enter");
        await expect(page.getByText("Label 19", { exact: true })).toBeVisible();
        if (mode === "task") {
          await page.getByRole("combobox", { name: "Gantt task" }).click();
          await expectUnclippedMenu(page.getByRole("listbox"));
          const project = page.getByRole("option", { name: "Project 20", exact: true });
          await project.scrollIntoViewIfNeeded();
          await project.click();
          await expect(page.getByText("Project 20", { exact: true })).toBeVisible();
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
