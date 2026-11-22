import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  test(`labels the timeline, explains shading and restores zoom in ${theme} mode`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: theme === "light" ? 1366 : 390, height: 768 });
    await page.clock.setFixedTime(new Date("2026-11-12T12:00:00"));
    await page.goto(`/e2e/fixtures/gantt-timeline.html?theme=${theme}`);

    const zoom = page.getByRole("combobox", { name: "Timeline zoom" });
    await expect(zoom).toHaveValue("Week");
    const chart = page.locator(".gantt-container");
    const activeBar = chart.locator('[data-id="design"] rect.bar');
    await expect
      .poll(async () => {
        const bar = await activeBar.boundingBox();
        const viewport = await chart.boundingBox();
        return Boolean(bar && viewport && bar.x >= viewport.x && bar.x < viewport.x + 100);
      })
      .toBe(true);
    const weekendHatch = chart.locator('.holiday-highlight[style*="diagonalHatch"]').first();
    await expect(weekendHatch).toHaveCSS("width", "20px");
    const progress = chart.locator('[data-id="design"] rect.bar-progress');
    await expect
      .poll(async () => {
        const bar = await activeBar.boundingBox();
        const fill = await progress.boundingBox();
        return Boolean(bar && fill && fill.width >= bar.width * 0.55 && fill.width <= bar.width);
      })
      .toBe(true);
    await expect(chart.getByText("Design & review", { exact: true })).toBeInViewport();
    await expect(chart.getByText("Build", { exact: true })).toBeAttached();
    await expect(page.getByText("Weekend", { exact: true })).toBeVisible();
    await expect(page.getByText("Public Holiday", { exact: true })).toBeVisible();
    await expect(page.getByText("Time Off", { exact: true })).toBeVisible();
    const path = testInfo.outputPath(`gantt-${theme}.png`);
    await page.locator("main").screenshot({ path });
    await testInfo.attach(`Gantt timeline in ${theme} mode`, { path, contentType: "image/png" });

    await zoom.selectOption("Day");
    await page.reload();
    await expect(zoom).toHaveValue("Day");
    await expect(chart.locator(".ignored-bar").first()).toBeAttached();
  });
}
