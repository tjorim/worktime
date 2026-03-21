import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  AccessibilityProvider,
  defaultAccessibility,
  FONT_SCALE_OPTIONS,
  useAccessibility,
} from "../../src/contexts/AccessibilityContext";
import { ACCESSIBILITY_STORAGE_KEY } from "../../src/constants/storageKeys";

describe("AccessibilityContext", () => {
  function wrapper({ children }: { children: ReactNode }) {
    return <AccessibilityProvider>{children}</AccessibilityProvider>;
  }

  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-wt-high-contrast");
    document.documentElement.removeAttribute("data-wt-reduced-motion");
    document.documentElement.style.removeProperty("--wt-font-scale");
  });

  it("provides default values", () => {
    const { result } = renderHook(() => useAccessibility(), { wrapper });
    expect(result.current.accessibility.highContrast).toBe(false);
    expect(result.current.accessibility.fontScale).toBe(1);
    expect(result.current.accessibility.reducedMotion).toBe(false);
  });

  it("FONT_SCALE_OPTIONS contains the expected four presets", () => {
    expect(FONT_SCALE_OPTIONS).toEqual([0.75, 1, 1.25, 1.5]);
  });

  it("updateHighContrast sets highContrast and applies data attribute", async () => {
    const { result } = renderHook(() => useAccessibility(), { wrapper });

    await act(async () => {
      result.current.updateHighContrast(true);
    });

    expect(result.current.accessibility.highContrast).toBe(true);
    expect(document.documentElement.getAttribute("data-wt-high-contrast")).toBe("true");
  });

  it("updateHighContrast removes data attribute when set to false", async () => {
    const { result } = renderHook(() => useAccessibility(), { wrapper });

    await act(async () => {
      result.current.updateHighContrast(true);
    });
    await act(async () => {
      result.current.updateHighContrast(false);
    });

    expect(result.current.accessibility.highContrast).toBe(false);
    expect(document.documentElement.hasAttribute("data-wt-high-contrast")).toBe(false);
  });

  it("updateFontScale updates fontScale and CSS variable", async () => {
    const { result } = renderHook(() => useAccessibility(), { wrapper });

    await act(async () => {
      result.current.updateFontScale(1.25);
    });

    expect(result.current.accessibility.fontScale).toBe(1.25);
    expect(document.documentElement.style.getPropertyValue("--wt-font-scale")).toBe("1.25");
  });

  it("updateFontScale removes CSS variable when reset to 1 (default)", async () => {
    const { result } = renderHook(() => useAccessibility(), { wrapper });

    await act(async () => {
      result.current.updateFontScale(1.5);
    });
    await act(async () => {
      result.current.updateFontScale(1);
    });

    expect(result.current.accessibility.fontScale).toBe(1);
    expect(document.documentElement.style.getPropertyValue("--wt-font-scale")).toBe("");
  });

  it("updateReducedMotion sets reducedMotion and applies data attribute", async () => {
    const { result } = renderHook(() => useAccessibility(), { wrapper });

    await act(async () => {
      result.current.updateReducedMotion(true);
    });

    expect(result.current.accessibility.reducedMotion).toBe(true);
    expect(document.documentElement.getAttribute("data-wt-reduced-motion")).toBe("true");
  });

  it("updateReducedMotion removes data attribute when set to false", async () => {
    const { result } = renderHook(() => useAccessibility(), { wrapper });

    await act(async () => {
      result.current.updateReducedMotion(true);
    });
    await act(async () => {
      result.current.updateReducedMotion(false);
    });

    expect(result.current.accessibility.reducedMotion).toBe(false);
    expect(document.documentElement.hasAttribute("data-wt-reduced-motion")).toBe(false);
  });

  it("persists settings to localStorage", async () => {
    const { result } = renderHook(() => useAccessibility(), { wrapper });

    await act(async () => {
      result.current.updateHighContrast(true);
      result.current.updateFontScale(1.5);
      result.current.updateReducedMotion(true);
    });

    const stored = JSON.parse(window.localStorage.getItem(ACCESSIBILITY_STORAGE_KEY) ?? "{}");
    expect(stored.highContrast).toBe(true);
    expect(stored.fontScale).toBe(1.5);
    expect(stored.reducedMotion).toBe(true);
  });

  it("restores settings from localStorage on mount", () => {
    window.localStorage.setItem(
      ACCESSIBILITY_STORAGE_KEY,
      JSON.stringify({ highContrast: true, fontScale: 0.75, reducedMotion: true }),
    );

    const { result } = renderHook(() => useAccessibility(), { wrapper });

    expect(result.current.accessibility.highContrast).toBe(true);
    expect(result.current.accessibility.fontScale).toBe(0.75);
    expect(result.current.accessibility.reducedMotion).toBe(true);
  });

  it("falls back to defaults for invalid localStorage values", () => {
    window.localStorage.setItem(
      ACCESSIBILITY_STORAGE_KEY,
      JSON.stringify({ highContrast: "yes", fontScale: 999, reducedMotion: null }),
    );

    const { result } = renderHook(() => useAccessibility(), { wrapper });

    expect(result.current.accessibility.highContrast).toBe(defaultAccessibility.highContrast);
    expect(result.current.accessibility.fontScale).toBe(defaultAccessibility.fontScale);
    expect(result.current.accessibility.reducedMotion).toBe(defaultAccessibility.reducedMotion);
  });

  it("throws when useAccessibility is used outside provider", () => {
    const originalError = console.error;
    console.error = () => {};

    expect(() => renderHook(() => useAccessibility())).toThrow(
      "useAccessibility must be used within an AccessibilityProvider",
    );

    console.error = originalError;
  });
});
