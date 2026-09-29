import path from "node:path";
import * as sass from "sass";

/**
 * The event palette lives only in `src/styles/_variables.scss`, as `--wt-event-<type>-<variant>-bg/-fg`
 * custom properties for the light (`:root`) and dark (`[data-bs-theme="dark"]`) themes. Tests read it
 * by compiling that file, so they check the real values instead of a second copy.
 */
export type PaletteEntry = { bg: string; fg: string };
export type EventPalette = Record<string, PaletteEntry>;

const VARIABLES_SCSS = path.resolve(__dirname, "../../src/styles/_variables.scss");

function readVars(cssBlock: string): EventPalette {
  const entries: Record<string, Partial<PaletteEntry>> = {};
  for (const [, key, kind, value] of cssBlock.matchAll(
    /--wt-event-([a-z]+(?:-(?:full|half))?)-(bg|fg):\s*(#[0-9a-f]{6})/g,
  ) as Iterable<RegExpMatchArray & [string, string, "bg" | "fg", string]>) {
    (entries[key] ??= {})[kind] = value;
  }
  return entries as EventPalette;
}

let cached: { light: EventPalette; dark: EventPalette } | undefined;

/** Palette for both themes, keyed like `"holiday-full"`, `"in-half"`, `"unknown"`. */
export function loadEventPalette(): { light: EventPalette; dark: EventPalette } {
  if (cached) return cached;
  const css = sass.compile(VARIABLES_SCSS).css;
  const blockFor = (selector: string) =>
    [...css.matchAll(new RegExp(`${selector}\\s*\\{([^}]*)\\}`, "g"))].map((m) => m[1]).join("\n");
  cached = {
    light: readVars(blockFor(":root")),
    dark: readVars(blockFor("\\[data-bs-theme=dark\\]")),
  };
  return cached;
}

/** The CSS value the helpers in `@/lib/hday` are expected to return for a type/variant. */
export const bgVar = (type: string, variant: "full" | "half") =>
  `var(--wt-event-${type}-${variant}-bg)`;
export const fgVar = (type: string, variant: "full" | "half") =>
  `var(--wt-event-${type}-${variant}-fg)`;

/** WCAG relative luminance and contrast ratio for `#rrggbb` colours. */
const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrastRatio = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

/** Euclidean distance between two `#rrggbb` colours in RGB space. */
export const colorDistance = (a: string, b: string): number => {
  const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [ca, cb] = [channels(a), channels(b)];
  return Math.hypot(...ca.map((c, i) => c - cb[i]!));
};
