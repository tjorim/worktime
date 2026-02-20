import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MOBILE_MEDIA_QUERY, useIsMobile } from "../../src/hooks/useIsMobile";

describe("useIsMobile", () => {
  it("uses shared mobile media query", () => {
    expect(MOBILE_MEDIA_QUERY).toBe("(max-width: 767.98px)");
  });

  it("returns true when media query matches", () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query) =>
        ({
          matches: query === MOBILE_MEDIA_QUERY,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as MediaQueryList,
    );

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("updates state when media query listener fires", () => {
    let currentMatches = false;
    let changeListener: ((event: MediaQueryListEvent) => void) | null = null;

    vi.spyOn(window, "matchMedia").mockImplementation(
      (query) =>
        ({
          get matches() {
            return query === MOBILE_MEDIA_QUERY ? currentMatches : false;
          },
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn((eventName: string, listener: (event: MediaQueryListEvent) => void) => {
            if (query === MOBILE_MEDIA_QUERY && eventName === "change") {
              changeListener = listener;
            }
          }),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as MediaQueryList,
    );

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      currentMatches = true;
      changeListener?.({ matches: true } as MediaQueryListEvent);
    });

    expect(result.current).toBe(true);
  });
});
