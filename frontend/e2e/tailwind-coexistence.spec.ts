import { expect, test } from "@playwright/test";

const themeColors = {
  light: {
    muted: "rgba(33, 37, 41, 0.75)",
    surfaces: ["rgb(255, 255, 255)", "rgb(255, 255, 255)", "rgb(248, 249, 250)"],
  },
  dark: {
    muted: "rgba(224, 224, 224, 0.75)",
    surfaces: ["rgb(24, 26, 27)", "rgb(38, 43, 49)", "rgb(51, 58, 66)"],
  },
} as const;

for (const theme of ["light", "dark"] as const) {
  test(`Tailwind overrides Bootstrap and resolves theme tokens (${theme})`, async ({ page }) => {
    await page.goto("/settings");
    await page.locator("main").waitFor();
    await page.evaluate(
      (theme) => document.documentElement.setAttribute("data-bs-theme", theme),
      theme,
    );
    // Use a real Bootstrap button; classes are scanned from this spec by Tailwind.
    await page.evaluate(() => {
      const button = document.createElement("button");
      button.id = "cascade-probe";
      button.className = "btn btn-primary tw:px-2 tw:text-muted-foreground";
      document.body.append(button);
      const classes = ["tw:bg-wt-surface-1", "tw:bg-wt-surface-2", "tw:bg-wt-surface-3"];
      for (const [index, className] of classes.entries()) {
        const surface = document.createElement("div");
        surface.id = `surface-probe-${index}`;
        surface.className = className;
        document.body.append(surface);
      }
      const variant = document.createElement("div");
      variant.id = "dark-variant-probe";
      variant.className = "tw:bg-background tw:dark:bg-wt-surface-2";
      document.body.append(variant);
    });
    await expect(page.locator("#cascade-probe")).toHaveCSS("padding-left", "8px");
    await expect(page.locator("#cascade-probe")).toHaveCSS("color", themeColors[theme].muted);
    for (const [index, color] of themeColors[theme].surfaces.entries()) {
      await expect(page.locator(`#surface-probe-${index}`)).toHaveCSS("background-color", color);
    }
    await expect(page.locator("#dark-variant-probe")).toHaveCSS(
      "background-color",
      themeColors[theme].surfaces[1],
    );
  });
}
