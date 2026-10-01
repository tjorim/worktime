import {
  getContrastingTextColor,
  getDefaultLabelColor,
  isHexColor,
} from "@/lib/timeTracking/constants";

/**
 * Runtime values reach the DOM as custom properties (read by `tw:bg-label`,
 * `tw:w-(--seg-w)` and friends) so user-defined colors and computed geometry never
 * become free-form inline declarations. These helpers validate the values; the
 * components spell out the `--*` keys inline so lint can check them.
 */

/** Background and readable foreground for a user-defined label; invalid colors use the theme default. */
export function resolveLabelColors(color: string | undefined): {
  background: string;
  foreground: string;
} {
  const background = isHexColor(color) ? color : getDefaultLabelColor();
  return { background, foreground: getContrastingTextColor(background) };
}

/** A finite percentage clamped to 0–100 for use as a CSS length. */
export function percent(value: number): string {
  const safe = Number.isFinite(value) ? Math.min(Math.max(value, 0), 100) : 0;
  return `${safe}%`;
}
