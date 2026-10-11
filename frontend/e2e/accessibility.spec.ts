import { test } from "@playwright/test";
import { accessibilityContexts, expectNoAccessibilityViolations } from "./axe";

/**
 * axe scans (WCAG 2.0/2.1 A + AA) of the routes a first-time visitor can reach.
 * Authenticated routes live in accessibility.authenticated.spec.ts. Colour
 * contrast is covered here only as far as axe can compute it; screen-reader
 * review is out of scope.
 */
const publicRoutes = [
  { path: "/", name: "home (first-run wizard)", ready: "dialog" },
  { path: "/privacy", name: "privacy", ready: "main" },
] as const;

for (const context of accessibilityContexts) {
  test.describe(`accessibility (${context.name})`, () => {
    test.use({ colorScheme: context.colorScheme, viewport: context.viewport });

    for (const route of publicRoutes) {
      test(`${route.name} has no axe violations`, async ({ page }) => {
        await page.goto(route.path);
        await page
          .locator(route.ready === "dialog" ? '[role="dialog"]' : "main")
          .first()
          .waitFor();
        await expectNoAccessibilityViolations(page, `${route.path} (${context.name})`);
      });
    }
  });
}
