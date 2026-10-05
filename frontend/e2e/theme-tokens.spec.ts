import { expect, test } from "@playwright/test";

const themeColors = {
  light: {
    page: "rgb(255, 255, 255)",
    text: "rgb(33, 37, 41)",
    muted: "rgba(33, 37, 41, 0.75)",
    surfaces: ["rgb(255, 255, 255)", "rgb(255, 255, 255)", "rgb(248, 249, 250)"],
  },
  dark: {
    page: "rgb(24, 26, 27)",
    text: "rgb(224, 224, 224)",
    muted: "rgba(224, 224, 224, 0.75)",
    surfaces: ["rgb(24, 26, 27)", "rgb(38, 43, 49)", "rgb(51, 58, 66)"],
  },
} as const;

for (const theme of ["light", "dark"] as const) {
  test(`theme tokens, base styles and the dark variant resolve (${theme})`, async ({ page }) => {
    await page.goto("/settings");
    await page.locator("main").waitFor();
    await page.evaluate(
      (theme) => document.documentElement.setAttribute("data-theme", theme),
      theme,
    );
    // Classes are scanned from this spec by Tailwind.
    await page.evaluate(() => {
      const probes: [string, string][] = [
        ["utility-probe", "px-2 text-muted-foreground"],
        ["surface-probe-0", "bg-wt-surface-1"],
        ["surface-probe-1", "bg-wt-surface-2"],
        ["surface-probe-2", "bg-wt-surface-3"],
        ["dark-variant-probe", "bg-background dark:bg-wt-surface-2"],
      ];
      for (const [id, className] of probes) {
        const element = document.createElement("div");
        element.id = id;
        element.className = className;
        document.body.append(element);
      }
    });
    await expect(page.locator("body")).toHaveCSS("background-color", themeColors[theme].page);
    await expect(page.locator("body")).toHaveCSS("color", themeColors[theme].text);
    await expect(page.locator("#utility-probe")).toHaveCSS("padding-left", "8px");
    await expect(page.locator("#utility-probe")).toHaveCSS("color", themeColors[theme].muted);
    for (const [index, color] of themeColors[theme].surfaces.entries()) {
      await expect(page.locator(`#surface-probe-${index}`)).toHaveCSS("background-color", color);
    }
    await expect(page.locator("#dark-variant-probe")).toHaveCSS(
      "background-color",
      themeColors[theme].surfaces[1],
    );
  });
}
