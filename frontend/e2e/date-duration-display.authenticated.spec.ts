import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"] as const) {
  for (const width of [1366, 390]) {
    test.describe(`date and duration display (${theme}, ${width}px)`, () => {
      test.use({ colorScheme: theme, viewport: { width, height: width === 390 ? 844 : 768 } });

      test("localises dates and durations across the app", async ({ page }, testInfo) => {
        const capture = async (screen: string) => {
          await testInfo.attach(`${screen}-${theme}-${width}`, {
            body: await page.screenshot({ animations: "disabled" }),
            contentType: "image/png",
          });
        };

        await page.clock.setFixedTime(new Date(2026, 8, 30, 15, 0, 0));
        await page.goto("/");
        await expect(page.getByText("17h 30m / 40h")).toBeVisible();
        const releaseNotice = page
          .getByRole("alert")
          .filter({ hasText: "New since your last visit" });
        if (await releaseNotice.isVisible()) {
          await releaseNotice.getByRole("button", { name: "Close" }).click();
        }
        await capture("time-tracking-weekly");

        await page.getByRole("button", { name: "Daily Log", exact: true }).click();
        await expect(page.getByText("Wednesday, 30 September 2026")).toBeVisible();
        await expect(page.getByTestId("timeline-total-duration")).toHaveText("5h 30m (68.8%)");
        await capture("time-tracking-daily");

        await page.getByRole("tab", { name: "Schedule", exact: true }).click();
        await expect(page.getByText("Wednesday, 30 September 2026")).toBeVisible();
        await capture("schedule");

        await page.goto(`/e2e/fixtures/timeoff-overlap.html?theme=${theme}&mode=table`);
        await expect(page.getByText("9 Nov 2026", { exact: false }).first()).toBeVisible();
        await capture("time-off");

        await page.goto(`/e2e/fixtures/display-consistency.html?theme=${theme}&state=populated`);
        await expect(page.locator("time").first()).toHaveText("2 Nov 2026, 22:24");
        await capture("account-activity");
      });
    });
  }
}
