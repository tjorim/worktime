import { expect, test, type Page } from "@playwright/test";

/**
 * #1696: reassigning a label before deleting it, a notice on unavailable settings
 * sections, a folded Weekly Summary and an Undo for the team reset on a schedule switch.
 * Screenshots land in docs/screenshots/1696 for the PR.
 */
const NOW = new Date(2026, 8, 30, 15, 0, 0);
const shot = (name: string) => `../docs/screenshots/1696/${name}.png`;

async function open(page: Page, url: string, theme: "light" | "dark") {
  await page.emulateMedia({ colorScheme: theme });
  await page.clock.install({ time: NOW });
  await page.goto(url);
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [1280, 390]) {
    const tag = `${theme}-${width}`;
    test.describe(`${tag}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width, height: 850 });
      });

      test("an in-use label is deleted after choosing where its entries go", async ({ page }) => {
        await open(page, "/settings?section=timeTracking", theme);
        await expect(
          page.getByRole("heading", { level: 1, name: "Labels & templates" }),
        ).toBeVisible();
        await expect(page.getByText(/Used by .*tasks/).first()).toBeVisible();
        await page.screenshot({ path: shot(`${tag}-labels`) });

        // The mocked API does not apply pushes, so check what the app sent instead.
        const pushes: {
          labels: { id: string; action: string }[];
          tasks: { label_id?: string }[];
        }[] = [];
        page.on("request", (request) => {
          if (request.method() === "POST" && request.url().includes("/api/sync/push")) {
            pushes.push(request.postDataJSON());
          }
        });

        await page.getByRole("button", { name: "Delete Meetings" }).click();
        const dialog = page.getByRole("alertdialog");
        await expect(dialog).toContainText(/"Meetings" is used by \d+ tasks?/);
        const confirm = dialog.getByRole("button", { name: "Move and delete" });
        await expect(confirm).toBeDisabled();
        await page.screenshot({ path: shot(`${tag}-reassign-dialog`) });

        await dialog.getByLabel("Move them to").selectOption({ label: "Deep work" });
        await expect(confirm).toBeEnabled();
        await page.screenshot({ path: shot(`${tag}-reassign-chosen`) });

        await confirm.click();
        await expect(dialog).toBeHidden();
        await expect(
          page.getByText(/Moved \d+ tasks? to "Deep work" and deleted "Meetings"\./),
        ).toBeVisible();
        await page.screenshot({ path: shot(`${tag}-reassign-done`) });
        expect(pushes[0]!.tasks.length).toBeGreaterThan(0);
        expect(pushes[0]!.tasks.every((task) => task.label_id !== undefined)).toBe(true);
        expect(pushes.at(-1)!.labels).toEqual([expect.objectContaining({ action: "delete" })]);
      });

      test("a non-admin opening the admin section is told why they were moved", async ({
        page,
      }) => {
        await open(page, "/settings?section=admin", theme);
        await expect(
          page.getByText("You don't have access to that settings section."),
        ).toBeVisible();
        await expect(page).toHaveURL(/section=scheduleTeam/);
        await expect(
          page.getByRole("heading", { level: 1, name: "Schedule & Team" }),
        ).toBeVisible();
        await page.screenshot({ path: shot(`${tag}-admin-notice`) });
      });

      test("the weekly summary folds its detail away and opens it on demand", async ({ page }) => {
        await open(page, "/", theme);
        await expect(page.getByRole("heading", { name: "Hours at a Glance" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Category Breakdown" })).toBeVisible();
        await expect(page.locator("table")).toHaveCount(0);
        await page.screenshot({ path: shot(`${tag}-weekly-collapsed`), fullPage: true });

        for (const name of [
          "Recent Weeks",
          "Daily Breakdown",
          "Detailed Breakdown",
          "Hours by Category",
        ]) {
          await page.getByRole("button", { name }).click();
        }
        await expect(page.locator("table tfoot")).toBeVisible();
        await page.screenshot({ path: shot(`${tag}-weekly-expanded`), fullPage: true });
      });

      test("switching schedule can be undone without losing the team", async ({ page }) => {
        await open(page, "/settings", theme);
        await page.getByText("5-shift", { exact: true }).click();
        await page.getByRole("combobox", { name: "Team" }).click();
        await page.getByRole("option", { name: "Team 2" }).click();
        await expect(page.getByRole("combobox", { name: "Team" })).toHaveText(/Team 2/);

        await page.getByText("2-shift", { exact: true }).click();
        await expect(page.getByText(/Team selection reset/)).toBeVisible();
        await page.screenshot({ path: shot(`${tag}-schedule-undo`) });

        await page.getByRole("button", { name: "Undo" }).click();
        await expect(page.getByRole("combobox", { name: "Team" })).toHaveText(/Team 2/);
      });
    });
  }
}
