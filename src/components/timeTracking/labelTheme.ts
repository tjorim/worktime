import { useEffect, useState } from "react";

/**
 * Cached default label color to avoid repeated getComputedStyle calls.
 * Reset when theme changes via the observer below.
 */
let cachedDefaultLabelColor: string | null = null;

/**
 * Listeners to notify when the default label color changes due to theme change.
 * Components can subscribe to be notified of changes.
 */
const colorChangeListeners = new Set<() => void>();

/**
 * Observer to invalidate cache when data-bs-theme attribute changes.
 * This ensures the color updates when users switch between light/dark/auto themes.
 * Guarded to prevent multiple observer registrations in test/HMR environments.
 */
let themeObserver: MutationObserver | null = null;

if (typeof window !== "undefined" && typeof MutationObserver !== "undefined") {
  if (!themeObserver) {
    themeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.attributeName === "data-bs-theme") {
          cachedDefaultLabelColor = null;
          colorChangeListeners.forEach((listener) => {
            listener();
          });
          break;
        }
      }
    });

    if (document.documentElement) {
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-bs-theme"],
      });
    }
  }
}

/**
 * Get the default label color from CSS variables (theme-aware).
 * Falls back to Bootstrap's gray-600 (#6c757d) if CSS variable is not available.
 *
 * The result is cached to avoid repeated getComputedStyle calls, which can be expensive.
 * The cache is automatically invalidated when the theme changes (data-bs-theme attribute).
 */
export function getDefaultLabelColor(): string {
  if (typeof window === "undefined" || !document.documentElement) {
    return "#6c757d";
  }

  if (cachedDefaultLabelColor !== null) {
    return cachedDefaultLabelColor;
  }

  const style = getComputedStyle(document.documentElement);
  const color = style.getPropertyValue("--wt-label-default").trim();
  cachedDefaultLabelColor = color || "#6c757d";

  return cachedDefaultLabelColor;
}

/**
 * React hook that returns the default label color and re-renders the component
 * when the theme changes. This ensures that memoized values using the color
 * are recomputed when the theme switches.
 */
export function useDefaultLabelColor(): string {
  const [color, setColor] = useState(getDefaultLabelColor);

  useEffect(() => {
    const listener = () => {
      setColor(getDefaultLabelColor());
    };

    colorChangeListeners.add(listener);

    return () => {
      colorChangeListeners.delete(listener);
    };
  }, []);

  return color;
}

export function getContrastingTextColor(backgroundColor?: string): string {
  if (!backgroundColor) {
    return "#000";
  }
  const hex = backgroundColor.replace("#", "");
  const normalized =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  if (normalized.length !== 6) {
    return "#000";
  }
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.6 ? "#000" : "#fff";
}
