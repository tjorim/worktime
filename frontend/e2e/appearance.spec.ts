import { USER_STATE_STORAGE_KEY } from "@/constants/storageKeys";
import { expect, test } from "@playwright/test";
import { expectNoAccessibilityViolations } from "./axe";
import { mkdirSync } from "node:fs";

for (const theme of ["light", "dark"] as const) {
  test(`appearance controls persist and scale without overflow (${theme})`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(
      ({ theme, stateKey }) => {
        localStorage.setItem(
          stateKey,
          JSON.stringify({
            hasCompletedOnboarding: true,
            settings: { theme },
          }),
        );
      },
      { theme, stateKey: USER_STATE_STORAGE_KEY },
    );
    await page.goto("/settings?section=general");
    await page.getByRole("radio", { name: "Larger", exact: true }).click();
    await page.getByRole("switch", { name: "High contrast", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-high-contrast", "true");
    await expect(page.locator("html")).toHaveCSS("font-size", "20px");
    await expectNoAccessibilityViolations(page, `high contrast ${theme}`);
    await page.reload();
    await expect(page.getByRole("radio", { name: "Larger", exact: true })).toBeChecked();
    await expect(page.getByRole("switch", { name: "High contrast", exact: true })).toBeChecked();
    mkdirSync("../docs/screenshots/270", { recursive: true });
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      await page.screenshot({
        path: `../docs/screenshots/270/${theme}-contrast-larger-${width}.png`,
        fullPage: true,
      });
      if (width === 390) {
        await page.getByRole("radio", { name: "Larger", exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `../docs/screenshots/270/${theme}-contrast-larger-390-viewport.png`,
        });
      }
      await page.getByRole("switch", { name: "High contrast", exact: true }).click();
      await page.getByRole("radio", { name: "Normal", exact: true }).click();
      await page.screenshot({
        path: `../docs/screenshots/270/${theme}-normal-${width}.png`,
        fullPage: true,
      });
      await page.getByRole("radio", { name: "Large", exact: true }).click();
      await page.screenshot({
        path: `../docs/screenshots/270/${theme}-large-${width}.png`,
        fullPage: true,
      });
      await page.getByRole("radio", { name: "Larger", exact: true }).click();
      await page.getByRole("switch", { name: "High contrast", exact: true }).click();
    }
  });
}

test("reduced motion suppresses utilities and pseudo elements while preserving lifecycle events", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/settings");
  const motion = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.id = "motion-probe";
    probe.addEventListener("animationend", () => {
      probe.dataset.finished = "true";
    });
    probe.className = "animate-spin transition-all";
    document.body.append(probe);
    return [
      getComputedStyle(probe).animationDuration,
      getComputedStyle(probe).transitionDuration,
      getComputedStyle(probe, "::before").animationDuration,
      getComputedStyle(document.documentElement).scrollBehavior,
    ];
  });
  expect(motion).toEqual(["1e-05s", "1e-05s", "1e-05s", "auto"]);
  await expect(page.locator("#motion-probe")).toHaveAttribute("data-finished", "true");
});
