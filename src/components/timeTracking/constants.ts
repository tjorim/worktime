import { useEffect, useState } from "react";

export type TimeTrackingLabel = {
  id: string;
  name: string;
  color: string;
};

export type TimeTrackingLabelInput = Omit<TimeTrackingLabel, "id"> & { id?: string };

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR_RE.test(value);
}

export function isTimeTrackingLabelInput(value: unknown): value is TimeTrackingLabelInput {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const label = value as Record<string, unknown>;
  const hasValidId =
    label.id === undefined || (typeof label.id === "string" && label.id.length > 0);
  return (
    hasValidId &&
    typeof label.name === "string" &&
    label.name.trim().length > 0 &&
    isHexColor(label.color)
  );
}

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
          // Notify all listeners
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

  // Return cached value if available
  if (cachedDefaultLabelColor !== null) {
    return cachedDefaultLabelColor;
  }

  // Compute and cache the value
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
    // Update color when theme changes
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

export function sanitizeLabels(labels: unknown[]): TimeTrackingLabel[] {
  const seen = new Set<string>();
  const sanitized: TimeTrackingLabel[] = [];

  labels.forEach((label) => {
    if (!isTimeTrackingLabelInput(label)) {
      return;
    }
    const name = normalizeLabelName(label.name);
    if (!name) {
      return;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    sanitized.push({
      id: typeof label.id === "string" ? label.id : crypto.randomUUID(),
      name,
      color: label.color,
    });
  });

  return sanitized;
}

export function buildLabelNameMap(labels: TimeTrackingLabel[]): Record<string, string> {
  return labels.reduce<Record<string, string>>((map, label) => {
    map[label.id] = label.name;
    return map;
  }, {});
}

export function buildLabelColorMap(labels: TimeTrackingLabel[]): Record<string, string> {
  return labels.reduce<Record<string, string>>((map, label) => {
    map[label.id] = label.color;
    return map;
  }, {});
}

export function normalizeLabelName(value: string): string {
  return value.trim();
}

export const TIME_TRACKING_STORAGE_KEYS = {
  tasks: "worktime_time_tracking_tasks",
  templates: "worktime_time_tracking_templates",
  labels: "worktime_time_tracking_labels",
};
