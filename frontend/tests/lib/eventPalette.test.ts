import path from "node:path";
import * as sass from "sass";
import { describe, expect, it } from "vitest";
import { getEventColor, getEventColorClass, getEventTextColor, type EventFlag } from "@/lib/hday";
import {
  colorDistance,
  contrastRatio,
  loadEventPalette,
  type EventPalette,
} from "@tests/utils/eventPalette";

/**
 * The palette is defined once, in `src/styles/_variables.scss`. These tests read the compiled
 * values from there, so they guard the real colours rather than a copy.
 */
const TYPES = [
  "holiday",
  "business",
  "course",
  "in",
  "weekend",
  "recurring",
  "birthday",
  "ill",
  "other",
] as const;
const VARIANTS = ["full", "half"] as const;
const THEMES = ["light", "dark"] as const;

const palette = loadEventPalette();

describe.each(THEMES)("event palette (%s theme)", (theme) => {
  const colors: EventPalette = palette[theme];

  it("defines a background and text colour for every type and variant, plus a fallback", () => {
    for (const type of TYPES) {
      for (const variant of VARIANTS) {
        const entry = colors[`${type}-${variant}`];
        expect(entry?.bg, `${type}-${variant} bg`).toMatch(/^#[0-9a-f]{6}$/);
        expect(entry?.fg, `${type}-${variant} fg`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
    expect(colors["unknown"]?.bg).toMatch(/^#[0-9a-f]{6}$/);
    expect(colors["unknown"]?.fg).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("pairs every background with a WCAG AA compliant text colour", () => {
    for (const [key, { bg, fg }] of Object.entries(colors)) {
      expect(contrastRatio(bg, fg), `${key}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps every full-day colour visibly distinct from the others", () => {
    const full = TYPES.map((type) => [type, colors[`${type}-full`]!.bg] as const);
    for (const [i, [typeA, colorA]] of full.entries()) {
      for (const [typeB, colorB] of full.slice(i + 1)) {
        // In office and Other used to be #008899 / #008b8b: ~14 apart in RGB, i.e. the same teal.
        // The closest legitimate pairs (business orange vs course gold) are ~37 apart, so 30
        // catches look-alikes without flagging colours that are clearly different.
        expect(colorDistance(colorA, colorB), `${typeA} vs ${typeB}`).toBeGreaterThan(30);
      }
    }
  });
});

describe("event palette (light theme, legacy planner colours)", () => {
  it("keeps the colours the .hday planner documents", () => {
    const light = palette.light;
    expect(light["holiday-full"]?.bg).toBe("#ec0000");
    expect(light["business-full"]?.bg).toBe("#ff9500");
    // Dark yellow/gold, not bright yellow; teal, not cyan.
    expect(light["course-full"]?.bg).toBe("#d9ad00");
    expect(light["in-full"]?.bg).toBe("#008899");
    expect(light["birthday-full"]?.bg).toBe("#0000cc");
    expect(light["ill-full"]?.bg).toBe("#336600");
  });

  it("uses white text on the dark full-day backgrounds where black would fail contrast", () => {
    for (const type of ["weekend", "birthday", "ill", "other", "recurring", "holiday"] as const) {
      expect(palette.light[`${type}-full`]?.fg, type).toBe("#ffffff");
    }
  });
});

describe("palette wiring", () => {
  const flagSets: EventFlag[][] = [
    [],
    ["holiday"],
    ["business"],
    ["course"],
    ["in"],
    ["weekend"],
    ["birthday"],
    ["ill"],
    ["other"],
  ];
  const combos = flagSets.flatMap((flags) =>
    (["range", "weekly"] as const).flatMap((eventType) =>
      [false, true].map((half) => ({
        flags: half ? [...flags, "half_am" as const] : flags,
        eventType,
      })),
    ),
  );

  const variableName = (cssValue: string) => /^var\((--[a-z-]+)\)$/.exec(cssValue)?.[1];
  const declaredVariables = new Set(
    Object.keys(palette.light).flatMap((key) => [`--wt-event-${key}-bg`, `--wt-event-${key}-fg`]),
  );

  it("only returns CSS variables that the palette declares, for every flag combination", () => {
    for (const { flags, eventType } of combos) {
      const label = `${flags.join("+") || "none"} / ${eventType}`;
      expect(declaredVariables, label).toContain(variableName(getEventColor(flags, eventType)));
      expect(declaredVariables, label).toContain(variableName(getEventTextColor(flags, eventType)));
    }
  });

  it("returns a colour and a text colour from the same palette entry", () => {
    for (const { flags, eventType } of combos) {
      const bg = variableName(getEventColor(flags, eventType))!.replace(/-bg$/, "");
      const fg = variableName(getEventTextColor(flags, eventType))!.replace(/-fg$/, "");
      expect(bg).toBe(fg);
    }
  });

  it("has a generated .event-* class for every class the helpers can return", () => {
    const css = sass.compile(path.resolve(__dirname, "../../src/styles/_shifts.scss")).css;
    for (const { flags, eventType } of combos) {
      const className = getEventColorClass(flags, eventType);
      expect(css, className).toContain(`.${className} {`);
      // The class must apply the same variable getEventColor() names.
      const block = css.match(new RegExp(`\\.${className} \\{([^}]*)\\}`))![1]!;
      expect(block, className).toContain(getEventColor(flags, eventType));
    }
  });
});
