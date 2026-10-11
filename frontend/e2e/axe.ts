import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export const axeTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

export const accessibilityContexts = [
  { name: "light", colorScheme: "light", viewport: { width: 1280, height: 800 } },
  { name: "dark", colorScheme: "dark", viewport: { width: 1280, height: 800 } },
  { name: "narrow", colorScheme: "light", viewport: { width: 390, height: 844 } },
] as const;

/**
 * Violations accepted for now, keyed by axe rule id, each with the reason.
 * Deliberately empty: the baseline was fixed rather than allow-listed. Prefer
 * fixing the markup or tokens over adding to this list.
 */
export const allowedViolations: Record<string, string> = {};

export async function expectNoAccessibilityViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(axeTags).analyze();
  const unexpected = results.violations.filter((v) => !(v.id in allowedViolations));
  expect(
    unexpected.map((v) => ({
      rule: v.id,
      targets: v.nodes.map((n) => {
        const d = (n.any[0]?.data ?? {}) as Record<string, unknown>;
        return `${n.target.join(" ")} fg=${d.fgColor} bg=${d.bgColor} ratio=${d.contrastRatio}`;
      }),
    })),
    `axe violations on ${label}`,
  ).toEqual([]);
}
