import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { ACCESSIBILITY_STORAGE_KEY } from "../constants/storageKeys";

/**
 * Font scale presets as a decimal multiplier applied to the root font size.
 * - 0.75 → 75% (small)
 * - 1    → 100% (default)
 * - 1.25 → 125% (large)
 * - 1.5  → 150% (extra-large)
 */
export type FontScale = 0.75 | 1 | 1.25 | 1.5;
export const FONT_SCALE_OPTIONS: FontScale[] = [0.75, 1, 1.25, 1.5];

export interface AccessibilitySettings {
  highContrast: boolean;
  fontScale: FontScale;
  reducedMotion: boolean;
}

interface AccessibilityContextType {
  accessibility: AccessibilitySettings;
  updateHighContrast: (enabled: boolean) => void;
  updateFontScale: (scale: FontScale) => void;
  updateReducedMotion: (enabled: boolean) => void;
}

export const defaultAccessibility: AccessibilitySettings = {
  highContrast: false,
  fontScale: 1,
  reducedMotion: false,
};

const VALID_FONT_SCALES = new Set<number>(FONT_SCALE_OPTIONS);

const normalizeAccessibility = (raw: unknown): AccessibilitySettings => {
  if (typeof raw !== "object" || raw === null) {
    return defaultAccessibility;
  }
  const s = raw as Record<string, unknown>;

  const highContrast =
    typeof s.highContrast === "boolean" ? s.highContrast : defaultAccessibility.highContrast;

  const fontScale =
    typeof s.fontScale === "number" && VALID_FONT_SCALES.has(s.fontScale)
      ? (s.fontScale as FontScale)
      : defaultAccessibility.fontScale;

  const reducedMotion =
    typeof s.reducedMotion === "boolean" ? s.reducedMotion : defaultAccessibility.reducedMotion;

  return { highContrast, fontScale, reducedMotion };
};

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

interface AccessibilityProviderProps {
  children: ReactNode;
}

/**
 * Provides accessibility preferences (high contrast, font scale, reduced motion) to the
 * application.
 *
 * Persists settings to localStorage and applies them as CSS custom properties and data
 * attributes on the `<html>` element so that stylesheets can react without needing React
 * state at render time.
 */
export function AccessibilityProvider({ children }: AccessibilityProviderProps) {
  const [rawSettings, setRawSettings] = useLocalStorage<AccessibilitySettings>(
    ACCESSIBILITY_STORAGE_KEY,
    defaultAccessibility,
  );

  const accessibility = normalizeAccessibility(rawSettings);

  // Apply high contrast data attribute to <html>
  useEffect(() => {
    const html = document.documentElement;
    if (accessibility.highContrast) {
      html.setAttribute("data-wt-high-contrast", "true");
    } else {
      html.removeAttribute("data-wt-high-contrast");
    }
  }, [accessibility.highContrast]);

  // Apply font scale CSS variable to <html>
  useEffect(() => {
    const html = document.documentElement;
    if (accessibility.fontScale === 1) {
      html.style.removeProperty("--wt-font-scale");
    } else {
      html.style.setProperty("--wt-font-scale", String(accessibility.fontScale));
    }
  }, [accessibility.fontScale]);

  // Apply reduced motion data attribute to <html>
  useEffect(() => {
    const html = document.documentElement;
    if (accessibility.reducedMotion) {
      html.setAttribute("data-wt-reduced-motion", "true");
    } else {
      html.removeAttribute("data-wt-reduced-motion");
    }
  }, [accessibility.reducedMotion]);

  const updateHighContrast = useCallback(
    (enabled: boolean) => {
      setRawSettings((prev) => ({ ...prev, highContrast: enabled }));
    },
    [setRawSettings],
  );

  const updateFontScale = useCallback(
    (scale: FontScale) => {
      setRawSettings((prev) => ({ ...prev, fontScale: scale }));
    },
    [setRawSettings],
  );

  const updateReducedMotion = useCallback(
    (enabled: boolean) => {
      setRawSettings((prev) => ({ ...prev, reducedMotion: enabled }));
    },
    [setRawSettings],
  );

  const contextValue: AccessibilityContextType = useMemo(
    () => ({
      accessibility,
      updateHighContrast,
      updateFontScale,
      updateReducedMotion,
    }),
    [accessibility, updateHighContrast, updateFontScale, updateReducedMotion],
  );

  return (
    <AccessibilityContext.Provider value={contextValue}>{children}</AccessibilityContext.Provider>
  );
}

/**
 * Accesses the accessibility context.
 *
 * @returns The current accessibility context value.
 * @throws {Error} If the hook is used outside an AccessibilityProvider.
 */
export function useAccessibility(): AccessibilityContextType {
  const context = useContext(AccessibilityContext);
  if (context === undefined) {
    throw new Error("useAccessibility must be used within an AccessibilityProvider");
  }
  return context;
}
