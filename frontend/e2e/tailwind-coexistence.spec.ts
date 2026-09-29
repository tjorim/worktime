import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  test(`Tailwind overrides Bootstrap and resolves theme tokens (${theme})`, async ({ page }) => {
    await page.goto("/settings");
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
    });
    await expect(page.locator("#cascade-probe")).toHaveCSS("padding-left", "8px");
    const colors = await page.locator("#cascade-probe").evaluate((button) => {
      const reference = document.createElement("span");
      reference.style.color = "var(--bs-secondary-color)";
      document.body.append(reference);
      const result = [getComputedStyle(button).color, getComputedStyle(reference).color];
      reference.remove();
      return result;
    });
    expect(colors[0]).toBe(colors[1]);
  });
}
