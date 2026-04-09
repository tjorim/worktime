import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useLocalStorage } from "@/hooks/useLocalStorage";

describe("useLocalStorage", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("stores and retrieves data from localStorage", () => {
    const { result } = renderHook(() => useLocalStorage("test_key", "default"));

    expect(result.current[0]).toBe("default");

    // Should allow storing
    act(() => {
      result.current[1]("new value");
    });

    expect(result.current[0]).toBe("new value");
    expect(window.localStorage.getItem("test_key")).toBe('"new value"');
  });

  it("loads existing data from localStorage", () => {
    // Set up existing data
    window.localStorage.setItem("test_existing", '"existing value"');

    const { result } = renderHook(() => useLocalStorage("test_existing", "default"));

    expect(result.current[0]).toBe("existing value");
  });

  it("supports functional updates", () => {
    const { result } = renderHook(() => useLocalStorage("test_functional_update", 0));

    act(() => {
      result.current[1]((prev) => prev + 1);
    });

    expect(result.current[0]).toBe(1);
    expect(window.localStorage.getItem("test_functional_update")).toBe("1");
  });

  it("handles multiple functional updates in the same render", () => {
    const { result } = renderHook(() => useLocalStorage("test_batched_updates", 0));

    act(() => {
      result.current[1]((prev) => prev + 1);
      result.current[1]((prev) => prev + 1);
      result.current[1]((prev) => prev + 1);
    });

    expect(result.current[0]).toBe(3);
    expect(window.localStorage.getItem("test_batched_updates")).toBe("3");
  });

  it("re-reads localStorage when key changes", () => {
    window.localStorage.setItem("test_key_a", '"value-a"');
    window.localStorage.setItem("test_key_b", '"value-b"');

    const { result, rerender } = renderHook(
      ({ storageKey }) => useLocalStorage(storageKey, "default"),
      { initialProps: { storageKey: "test_key_a" } },
    );

    expect(result.current[0]).toBe("value-a");

    rerender({ storageKey: "test_key_b" });

    expect(result.current[0]).toBe("value-b");

    act(() => {
      result.current[1]((prev) => `${prev}-updated`);
    });

    expect(result.current[0]).toBe("value-b-updated");
    expect(window.localStorage.getItem("test_key_b")).toBe('"value-b-updated"');
  });

  it("does not re-read when only initialValue changes", () => {
    window.localStorage.setItem("stable_key", '"stored-value"');

    const { result, rerender } = renderHook(
      ({ initial }) => useLocalStorage("stable_key", initial),
      { initialProps: { initial: "default-a" } },
    );

    expect(result.current[0]).toBe("stored-value");

    rerender({ initial: "default-b" });

    expect(result.current[0]).toBe("stored-value");
  });

  it("handles malformed JSON gracefully", () => {
    // Set up malformed JSON in localStorage
    window.localStorage.setItem("test_malformed", "invalid-json");

    const { result } = renderHook(() => useLocalStorage("test_malformed", "fallback"));

    // Should fallback to initial value when JSON is malformed
    expect(result.current[0]).toBe("fallback");
  });

  it("syncs same-tab instances watching the same key", () => {
    // Two independent hook instances using the same key, simulating e.g.
    // CalendarView and TimeTrackingWeeklyView both calling
    // useWorkLocationStorage(2026) which internally calls useLocalStorage with
    // the same "worktime_work_locations_2026" key.
    const hookA = renderHook(() => useLocalStorage("test_same_tab_sync", "initial"));
    const hookB = renderHook(() => useLocalStorage("test_same_tab_sync", "initial"));

    act(() => {
      hookA.result.current[1]("updated-by-a");
    });

    // Hook A should reflect the update directly
    expect(hookA.result.current[0]).toBe("updated-by-a");

    // Hook B should also reflect the update without a page reload
    expect(hookB.result.current[0]).toBe("updated-by-a");
  });
});
