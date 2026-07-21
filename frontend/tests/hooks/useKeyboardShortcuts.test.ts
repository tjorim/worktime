import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

describe("useKeyboardShortcuts", () => {
  const mockShortcuts = {
    onToday: vi.fn(),
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    onTeamSelect: vi.fn(),
    onTabTimeTracking: vi.fn(),
    onTabGantt: vi.fn(),
    onShowShortcuts: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("registers keyboard event listeners", () => {
    const addEventListenerSpy = vi.spyOn(document, "addEventListener");
    const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");

    const { unmount } = renderHook(() => useKeyboardShortcuts(mockShortcuts));

    expect(addEventListenerSpy).toHaveBeenCalledWith("keydown", expect.any(Function));

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith("keydown", expect.any(Function));

    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  it("triggers onToday when h is pressed", () => {
    renderHook(() => useKeyboardShortcuts(mockShortcuts));

    const event = new KeyboardEvent("keydown", { key: "h" });
    document.dispatchEvent(event);

    expect(mockShortcuts.onToday).toHaveBeenCalledTimes(1);
  });

  it("does not trigger onToday when Ctrl+H is pressed (browser-reserved combo)", () => {
    renderHook(() => useKeyboardShortcuts(mockShortcuts));

    const event = new KeyboardEvent("keydown", { key: "h", ctrlKey: true });
    document.dispatchEvent(event);

    expect(mockShortcuts.onToday).not.toHaveBeenCalled();
  });

  it("triggers onPrevious when k is pressed", () => {
    renderHook(() => useKeyboardShortcuts(mockShortcuts));

    const event = new KeyboardEvent("keydown", { key: "k" });
    document.dispatchEvent(event);

    expect(mockShortcuts.onPrevious).toHaveBeenCalledTimes(1);
  });

  it("triggers onNext when j is pressed", () => {
    renderHook(() => useKeyboardShortcuts(mockShortcuts));

    const event = new KeyboardEvent("keydown", { key: "j" });
    document.dispatchEvent(event);

    expect(mockShortcuts.onNext).toHaveBeenCalledTimes(1);
  });

  it("triggers onPrevious when left arrow is pressed", () => {
    renderHook(() => useKeyboardShortcuts(mockShortcuts));

    const event = new KeyboardEvent("keydown", { key: "ArrowLeft" });
    document.dispatchEvent(event);

    expect(mockShortcuts.onPrevious).toHaveBeenCalledTimes(1);
  });

  it("triggers onNext when right arrow is pressed", () => {
    renderHook(() => useKeyboardShortcuts(mockShortcuts));

    const event = new KeyboardEvent("keydown", { key: "ArrowRight" });
    document.dispatchEvent(event);

    expect(mockShortcuts.onNext).toHaveBeenCalledTimes(1);
  });

  it("triggers onTeamSelect when Alt+T is pressed", () => {
    renderHook(() => useKeyboardShortcuts(mockShortcuts));

    const event = new KeyboardEvent("keydown", { key: "t", altKey: true });
    document.dispatchEvent(event);

    expect(mockShortcuts.onTeamSelect).toHaveBeenCalledTimes(1);
  });

  it("does not trigger onTeamSelect when Ctrl+T is pressed (browser-reserved combo)", () => {
    renderHook(() => useKeyboardShortcuts(mockShortcuts));

    const event = new KeyboardEvent("keydown", { key: "t", ctrlKey: true });
    document.dispatchEvent(event);

    expect(mockShortcuts.onTeamSelect).not.toHaveBeenCalled();
  });

  it("does not trigger onTabTimeTracking when Alt+T is pressed", () => {
    renderHook(() => useKeyboardShortcuts(mockShortcuts));

    const event = new KeyboardEvent("keydown", { key: "t", altKey: true });
    document.dispatchEvent(event);

    expect(mockShortcuts.onTabTimeTracking).not.toHaveBeenCalled();
  });

  it("triggers onTeamSelect via event.code fallback on macOS layouts where Option+T remaps event.key", () => {
    renderHook(() => useKeyboardShortcuts(mockShortcuts));

    // On macOS US layouts, Option+T produces "†" as event.key, but event.code stays "KeyT".
    const event = new KeyboardEvent("keydown", { key: "†", code: "KeyT", altKey: true });
    document.dispatchEvent(event);

    expect(mockShortcuts.onTeamSelect).toHaveBeenCalledTimes(1);
  });

  it("does not call preventDefault for Ctrl+, when onToggleSettings is not provided", () => {
    renderHook(() => useKeyboardShortcuts({}));

    const event = new KeyboardEvent("keydown", { key: ",", ctrlKey: true, cancelable: true });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it("does not call preventDefault for Alt+T when onTeamSelect is not provided", () => {
    renderHook(() => useKeyboardShortcuts({}));

    const event = new KeyboardEvent("keydown", { key: "t", altKey: true, cancelable: true });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it("ignores shortcuts when focus is on input elements", () => {
    renderHook(() => useKeyboardShortcuts(mockShortcuts));

    // Create a mock input element
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent("keydown", { key: "h" });
    Object.defineProperty(event, "target", { value: input });
    document.dispatchEvent(event);

    expect(mockShortcuts.onToday).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it("handles missing callbacks gracefully", () => {
    const partialShortcuts = { onToday: mockShortcuts.onToday };

    renderHook(() => useKeyboardShortcuts(partialShortcuts));

    // Should not throw when other callbacks are missing
    const event = new KeyboardEvent("keydown", { key: "ArrowLeft" });
    expect(() => document.dispatchEvent(event)).not.toThrow();
  });

  it("triggers onTabTimeTracking when T is pressed", () => {
    renderHook(() => useKeyboardShortcuts(mockShortcuts));

    const event = new KeyboardEvent("keydown", { key: "t" });
    document.dispatchEvent(event);

    expect(mockShortcuts.onTabTimeTracking).toHaveBeenCalledTimes(1);
  });

  it("does not trigger onTabTimeTracking when W is pressed", () => {
    renderHook(() => useKeyboardShortcuts(mockShortcuts));

    const event = new KeyboardEvent("keydown", { key: "w" });
    document.dispatchEvent(event);

    expect(mockShortcuts.onTabTimeTracking).not.toHaveBeenCalled();
  });

  it("triggers onTabGantt when G is pressed", () => {
    renderHook(() => useKeyboardShortcuts(mockShortcuts));

    const event = new KeyboardEvent("keydown", { key: "g" });
    document.dispatchEvent(event);

    expect(mockShortcuts.onTabGantt).toHaveBeenCalledTimes(1);
  });

  it("triggers onShowShortcuts when ? (Shift+/) is pressed", () => {
    renderHook(() => useKeyboardShortcuts(mockShortcuts));

    const event = new KeyboardEvent("keydown", { key: "?", shiftKey: true });
    document.dispatchEvent(event);

    expect(mockShortcuts.onShowShortcuts).toHaveBeenCalledTimes(1);
  });

  it("does not trigger onShowShortcuts when typing ? in an input", () => {
    renderHook(() => useKeyboardShortcuts(mockShortcuts));

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent("keydown", { key: "?", shiftKey: true });
    Object.defineProperty(event, "target", { value: input });
    document.dispatchEvent(event);

    expect(mockShortcuts.onShowShortcuts).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it("does not trigger onShowShortcuts when ? is combined with Ctrl/Meta/Alt", () => {
    renderHook(() => useKeyboardShortcuts(mockShortcuts));

    for (const modifier of ["ctrlKey", "metaKey", "altKey"] as const) {
      const event = new KeyboardEvent("keydown", { key: "?", [modifier]: true });
      document.dispatchEvent(event);
    }

    expect(mockShortcuts.onShowShortcuts).not.toHaveBeenCalled();
  });
});
