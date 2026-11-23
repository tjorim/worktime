import { expect, test } from "@playwright/test";
import { USER_STATE_STORAGE_KEY } from "@/config/storageKeys";
import { localStorageKey } from "@/paraglide/runtime.js";

const entries = `2026/11/09 # Holiday
k2026/11/10 # Office
h2026/11/11 # Birthday
ea2026/11/12 # Weekend
b2026/11/13 # Business trip
s2026/11/16 # Training`;

for (const colorScheme of ["light", "dark"] as const) {
  for (const width of [1366, 390]) {
    test.describe(`Time off statistics (${colorScheme}, ${width})`, () => {
      test.use({ colorScheme, viewport: { width, height: width === 390 ? 844 : 768 } });

      test("shows only leave in the headline and retains the other types", async ({
        page,
      }, testInfo) => {
        await page.clock.setFixedTime(new Date(2026, 10, 23, 12));
        await page.addInitScript(
          ({ stateKey, localeKey }) => {
            localStorage.setItem(localeKey, "en");
            const state = JSON.parse(localStorage.getItem(stateKey) ?? "{}");
            state.lastUsed = { ...state.lastUsed, timeOffView: "table" };
            localStorage.setItem(stateKey, JSON.stringify(state));
          },
          { stateKey: USER_STATE_STORAGE_KEY, localeKey: localStorageKey },
        );
        await page.goto("/");
        await page.getByRole("tab", { name: "Time Off", exact: true }).click();
        await page.locator('input[type="file"][accept*=".hday"]').setInputFiles({
          name: "statistics.hday",
          mimeType: "text/plain",
          buffer: Buffer.from(entries),
        });
        await page.getByRole("button", { name: "Merge entries" }).click();
        await page
          .getByRole("status")
          .filter({ hasText: "Imported statistics.hday" })
          .getByRole("button", { name: "Close notification" })
          .click();
        await page.getByRole("button", { name: "Statistics", exact: true }).click();

        const stats = page.getByRole("region", { name: "Time off statistics" });
        await expect(stats.getByText("1 day of leave in 2026")).toBeVisible();
        await expect(stats.getByRole("heading", { name: "Other entries" })).toBeVisible();
        for (const label of ["In office", "Birthday", "Weekend", "Business trip", "Training"]) {
          await expect(stats.getByText(label, { exact: true })).toBeVisible();
        }
        await expect(stats.getByText("0.5 days", { exact: true })).toBeVisible();
        await expect(page.getByText("Review your logged days by year and type.")).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
        await stats.scrollIntoViewIfNeeded();
        await expect(stats).toBeInViewport({ ratio: 1 });
        const name = `time-off-statistics-${colorScheme}-${width}`;
        const path = `test-results/review-screenshots/1982/${name}.png`;
        await page.screenshot({ path });
        await testInfo.attach(name, { path, contentType: "image/png" });
      });
    });
  }
}
