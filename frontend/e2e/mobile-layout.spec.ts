import { expect, test } from "@playwright/test";
import { USER_STATE_STORAGE_KEY } from "@/constants/storageKeys";
import { localStorageKey } from "@/paraglide/runtime.js";
import { expectNoAccessibilityViolations } from "./axe";

for (const lang of ["en", "nl"]) {
  for (const theme of ["light", "dark"] as const) {
    for (const width of [390, 1280]) {
      test(`mobile layout ${lang} ${theme} ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        const capture = (state: string) =>
          page.screenshot({
            path: `../docs/screenshots/1682/${lang}-${theme}-${width}-${state}.png`,
          });
        await page.addInitScript(
          ({ stateKey, localeKey, lang, theme }) => {
            localStorage.setItem(localeKey, lang);
            localStorage.setItem(
              stateKey,
              JSON.stringify({
                hasCompletedOnboarding: true,
                scheduleType: "9-5",
                settings: {
                  theme,
                  enableTimeOff: true,
                  enableTimeTracking: true,
                  enableUnifiedCalendar: true,
                  enableGantt: true,
                },
              }),
            );
          },
          { stateKey: USER_STATE_STORAGE_KEY, localeKey: localStorageKey, lang, theme },
        );
        await page.goto("/");
        const tabs = page.getByRole("tablist", { name: "Worktime" });
        await expect(tabs).toBeVisible();
        for (const tab of await tabs.getByRole("tab").all()) {
          const label = tab.locator("span");
          await expect(label).toHaveCSS("white-space", "nowrap");
          await expect(tab).toBeInViewport();
        }
        await expect(
          page.getByText(lang === "en" ? "My Working Calendar" : "Mijn werkkalender", {
            exact: true,
          }),
        ).toBeVisible();
        await capture("tabs");
        const expand = page.getByRole("button", {
          name: lang === "en" ? "Expand status" : "Status uitklappen",
        });
        if (await expand.isVisible()) {
          const box = await expand.boundingBox();
          expect(box!.width).toBeGreaterThanOrEqual(44);
          expect(box!.height).toBeGreaterThanOrEqual(44);
          await expand.click();
          await capture("status-expanded");
        }
        await page.goto(
          `/e2e/fixtures/timeoff-overlap.html?mode=table&theme=${theme}&lang=${lang}`,
        );
        const cards = page.locator('[data-slot="timeoff-card-list"]');
        if (width === 390) {
          await expect(cards).toBeVisible();
          await expect(page.getByRole("table")).toHaveCount(0);
          for (const action of await cards.getByRole("button").all()) {
            const box = await action.boundingBox();
            expect(box!.x).toBeGreaterThanOrEqual(0);
            expect(box!.x + box!.width).toBeLessThanOrEqual(width);
            expect(box!.height).toBeGreaterThanOrEqual(44);
          }
        } else await expect(page.getByRole("table")).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
        await capture("entries");
        await expectNoAccessibilityViolations(page, `Time Off ${lang} ${theme} ${width}`);
        await page.getByRole("searchbox").fill("Autumn");
        await capture("filtered");
        await page.getByRole("searchbox").fill("no matching entry");
        await capture("no-results");
        await page.goto(`/e2e/fixtures/mobile-tables.html?theme=${theme}&lang=${lang}`);
        await expect(page.getByRole("table")).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
        await capture("users-activity");
        const details = page.locator("summary");
        expect((await details.boundingBox())!.height).toBeGreaterThanOrEqual(24);
        await details.click();
        await capture("activity-details");
      });
    }
  }
}

test.describe("touch button targets", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 1000 } });
  test("small buttons keep their icon size with a 44px hit area", async ({ page }) => {
    await page.goto("/e2e/fixtures/timeoff-overlap.html?mode=table&theme=light");
    await expect(page.locator('[data-slot="timeoff-card-list"]')).toBeVisible();
    for (const button of await page.locator('[data-slot="button"]').all()) {
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({
      path: "../docs/screenshots/1682/en-light-390-touch.png",
      fullPage: true,
    });
  });
});
