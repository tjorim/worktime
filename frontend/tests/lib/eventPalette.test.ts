import path from "node:path";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { compile } from "tailwindcss";
import postcss from "postcss";
import { getEventColorUtilities, resolveEventPaletteVars } from "@/lib/hday/presentation";
import { describe, expect, it } from "vitest";
import { getEventColor, getEventColorClass, getEventTextColor, type EventFlag } from "@/lib/hday";
import {
  colorDistance,
  contrastRatio,
  loadEventPalette,
  type EventPalette,
} from "@tests/utils/eventPalette";

/**
 * The palette is defined once, in `src/styles/event-palette.css`. These tests read the
 * values from there, so they guard the real colors rather than a copy.
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

  it("defines a background and text color for every type and variant, plus a fallback", () => {
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

  it("pairs every background with a WCAG AA compliant text color", () => {
    for (const [key, { bg, fg }] of Object.entries(colors)) {
      expect(contrastRatio(bg, fg), `${key}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps every full-day color visibly distinct from the others", () => {
    const full = TYPES.map((type) => [type, colors[`${type}-full`]!.bg] as const);
    for (const [i, [typeA, colorA]] of full.entries()) {
      for (const [typeB, colorB] of full.slice(i + 1)) {
        // In office and Other used to be #008899 / #008b8b: ~14 apart in RGB, i.e. the same teal.
        // The closest legitimate pairs (business orange vs course gold) are ~37 apart, so 30
        // catches look-alikes without flagging colors that are clearly different.
        expect(colorDistance(colorA, colorB), `${typeA} vs ${typeB}`).toBeGreaterThan(30);
      }
    }
  });
});

describe("event palette (light theme, legacy planner colors)", () => {
  it("keeps the colors the .hday planner documents", () => {
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

  it("passes the palette's own references through and refuses any other CSS value", () => {
    for (const { flags, eventType } of combos) {
      const color = getEventColor(flags, eventType);
      const textColor = getEventTextColor(flags, eventType);
      expect(resolveEventPaletteVars(color, textColor)).toEqual({
        background: color,
        foreground: textColor,
      });
    }

    const unknown = {
      background: "var(--wt-event-unknown-bg)",
      foreground: "var(--wt-event-unknown-fg)",
    };
    expect(resolveEventPaletteVars("#fca5a5", "#7f1d1d")).toEqual(unknown);
    expect(resolveEventPaletteVars("red; position: fixed", "var(--wt-event-ill-full-fg)")).toEqual(
      unknown,
    );
    expect(resolveEventPaletteVars("var(--wt-event-ill-full-bg)", "url(x)")).toEqual(unknown);
    // An undeclared entry, a mismatched pair and swapped bg/fg roles all fall back too.
    expect(
      resolveEventPaletteVars("var(--wt-event-nope-full-bg)", "var(--wt-event-nope-full-fg)"),
    ).toEqual(unknown);
    expect(
      resolveEventPaletteVars("var(--wt-event-ill-full-bg)", "var(--wt-event-other-full-fg)"),
    ).toEqual(unknown);
    expect(
      resolveEventPaletteVars("var(--wt-event-ill-full-fg)", "var(--wt-event-ill-full-bg)"),
    ).toEqual(unknown);
  });

  it("returns a color and a text color from the same palette entry", () => {
    for (const { flags, eventType } of combos) {
      const bg = variableName(getEventColor(flags, eventType))!.replace(/-bg$/, "");
      const fg = variableName(getEventTextColor(flags, eventType))!.replace(/-fg$/, "");
      expect(bg).toBe(fg);
    }
  });

  it("compiles event utilities using only declared palette variables", async () => {
    const file = path.resolve(__dirname, "../../src/styles/tailwind.css");
    const require = createRequire(import.meta.url);
    const compiler = await compile(readFileSync(file, "utf8"), {
      base: path.dirname(file),
      loadStylesheet: async (id, base) => {
        const resolved = id.startsWith(".") ? path.resolve(base, id) : require.resolve(id);
        return {
          path: resolved,
          base: path.dirname(resolved),
          content: readFileSync(resolved, "utf8"),
        };
      },
    });
    const classes = combos.flatMap(({ flags, eventType }) =>
      getEventColorUtilities(flags, eventType).split(" "),
    );
    const css = postcss.parse(compiler.build(classes));
    for (const { flags, eventType } of combos) {
      const [bg, fg] = getEventColorUtilities(flags, eventType).split(" ");
      for (const [className, property, expected] of [
        [bg!, "background-color", getEventColor(flags, eventType)],
        [fg!, "color", getEventTextColor(flags, eventType)],
      ] as const) {
        const values: string[] = [];
        css.walkRules(`.${className!.replace(":", "\\:")}`, (rule) => {
          rule.walkDecls(property, (decl) => {
            values.push(decl.value);
          });
        });
        expect(values, className).toEqual([expected]);
        expect(declaredVariables).toContain(variableName(expected!));
      }
    }
  });

  it("has an .event-* class for every class the helpers can return", () => {
    const css = readFileSync(path.resolve(__dirname, "../../src/styles/event-palette.css"), "utf8");
    for (const { flags, eventType } of combos) {
      const className = getEventColorClass(flags, eventType);
      expect(css, className).toContain(`.${className} {`);
      // The class must apply the same variable getEventColor() names.
      const block = css.match(new RegExp(`\\.${className} \\{([^}]*)\\}`))![1]!;
      expect(block, className).toContain(getEventColor(flags, eventType));
    }
  });
});
