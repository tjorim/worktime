import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  for (const width of [1280, 390]) {
    test(`timer starts at zero and short tasks are explained (${theme}, ${width})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.clock.install({ time: new Date("2026-01-05T10:15:40") });
      await page.goto(`/e2e/fixtures/overnight-tasks.html?theme=${theme}`);
      await expect(page.getByLabel("Task", { exact: true })).toHaveAccessibleDescription(
        "Optional for Start Now, which names it “Untitled task”. Required for completed tasks.",
      );
      await page.mouse.move(0, 0);
      await page.screenshot({ path: `../docs/screenshots/1699/${theme}-${width}-timer-idle.png` });

      await page.getByRole("button", { name: /Start Now/ }).click();
      await expect(page.getByRole("button", { name: /Stop Timer · 00:00:0[0-2]/ })).toBeVisible();
      await page.mouse.move(0, 0);
      await page.screenshot({
        path: `../docs/screenshots/1699/${theme}-${width}-timer-running.png`,
      });

      await page.clock.fastForward(15_000);
      await page.getByRole("button", { name: /Stop Timer/ }).click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toContainText("Tasks are saved in whole minutes");
      await page.mouse.move(0, 0);
      await page.screenshot({ path: `../docs/screenshots/1699/${theme}-${width}-timer-short.png` });
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(page.getByRole("button", { name: /Stop Timer/ })).toBeVisible();
    });
  }
}
