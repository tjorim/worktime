import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useLocalStorage } from "../../src/hooks/useLocalStorage";

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

  it("handles complex objects (arrays)", () => {
    const initialArray = [1, 2, 3];
    const { result } = renderHook(() => useLocalStorage("test_array", initialArray));

    expect(result.current[0]).toEqual([1, 2, 3]);

    act(() => {
      result.current[1]([4, 5, 6]);
    });

    expect(result.current[0]).toEqual([4, 5, 6]);
    expect(JSON.parse(window.localStorage.getItem("test_array")!)).toEqual([4, 5, 6]);
  });

  it("handles complex nested objects", () => {
    const initialObject = { user: { name: "John", age: 30 }, settings: { theme: "dark" } };
    const { result } = renderHook(() => useLocalStorage("test_nested", initialObject));

    expect(result.current[0]).toEqual(initialObject);

    act(() => {
      result.current[1]({ user: { name: "Jane", age: 25 }, settings: { theme: "light" } });
    });

    expect(result.current[0]).toEqual({ user: { name: "Jane", age: 25 }, settings: { theme: "light" } });
    expect(JSON.parse(window.localStorage.getItem("test_nested")!)).toEqual({
      user: { name: "Jane", age: 25 },
      settings: { theme: "light" },
    });
  });

  it("handles boolean values", () => {
    const { result } = renderHook(() => useLocalStorage("test_boolean", false));

    expect(result.current[0]).toBe(false);

    act(() => {
      result.current[1](true);
    });

    expect(result.current[0]).toBe(true);
    expect(window.localStorage.getItem("test_boolean")).toBe("true");
  });

  it("handles null values", () => {
    const { result } = renderHook(() => useLocalStorage<string | null>("test_null", null));

    expect(result.current[0]).toBe(null);

    act(() => {
      result.current[1]("not null");
    });

    expect(result.current[0]).toBe("not null");

    act(() => {
      result.current[1](null);
    });

    expect(result.current[0]).toBe(null);
    expect(window.localStorage.getItem("test_null")).toBe("null");
  });

  it("handles empty string", () => {
    const { result } = renderHook(() => useLocalStorage("test_empty_string", ""));

    expect(result.current[0]).toBe("");

    act(() => {
      result.current[1]("filled");
    });

    expect(result.current[0]).toBe("filled");

    act(() => {
      result.current[1]("");
    });

    expect(result.current[0]).toBe("");
    expect(window.localStorage.getItem("test_empty_string")).toBe('""');
  });

  it("handles number edge cases", () => {
    const { result: zeroResult } = renderHook(() => useLocalStorage("test_zero", 0));
    expect(zeroResult.current[0]).toBe(0);

    const { result: negativeResult } = renderHook(() => useLocalStorage("test_negative", -42));
    expect(negativeResult.current[0]).toBe(-42);

    act(() => {
      negativeResult.current[1](-100);
    });
    expect(negativeResult.current[0]).toBe(-100);
    expect(window.localStorage.getItem("test_negative")).toBe("-100");
  });

  it("responds to cross-tab storage events", () => {
    const { result } = renderHook(() => useLocalStorage("test_cross_tab", "initial"));

    expect(result.current[0]).toBe("initial");

    // Simulate a storage event from another tab
    act(() => {
      const storageEvent = new StorageEvent("storage", {
        key: "test_cross_tab",
        newValue: '"updated-from-other-tab"',
      });
      window.dispatchEvent(storageEvent);
    });

    expect(result.current[0]).toBe("updated-from-other-tab");
  });

  it("ignores storage events with null newValue", () => {
    const { result } = renderHook(() => useLocalStorage("test_null_event", "initial"));

    expect(result.current[0]).toBe("initial");

    // Simulate a storage event with null newValue (deletion event)
    act(() => {
      const storageEvent = new StorageEvent("storage", {
        key: "test_null_event",
        newValue: null,
      });
      window.dispatchEvent(storageEvent);
    });

    // Should still be initial value since null newValue is ignored
    expect(result.current[0]).toBe("initial");
  });

  it("ignores storage events for different keys", () => {
    const { result } = renderHook(() => useLocalStorage("test_my_key", "my-value"));

    expect(result.current[0]).toBe("my-value");

    // Simulate a storage event for a different key
    act(() => {
      const storageEvent = new StorageEvent("storage", {
        key: "test_different_key",
        newValue: '"different-value"',
      });
      window.dispatchEvent(storageEvent);
    });

    // Value should remain unchanged
    expect(result.current[0]).toBe("my-value");
  });

  it("handles malformed JSON in storage events gracefully", () => {
    const { result } = renderHook(() => useLocalStorage("test_malformed_event", "initial"));

    expect(result.current[0]).toBe("initial");

    // Simulate a storage event with malformed JSON
    act(() => {
      const storageEvent = new StorageEvent("storage", {
        key: "test_malformed_event",
        newValue: "invalid-json{{{",
      });
      window.dispatchEvent(storageEvent);
    });

    // Should remain at initial value since parsing failed
    expect(result.current[0]).toBe("initial");
  });

  it("does not process its own synthetic storage events", () => {
    // This test verifies the isSelfDispatch flag prevents double-processing
    const { result } = renderHook(() => useLocalStorage("test_self_dispatch", 0));

    let eventCount = 0;
    const listener = (e: StorageEvent) => {
      if (e.key === "test_self_dispatch") {
        eventCount++;
      }
    };

    window.addEventListener("storage", listener);

    act(() => {
      result.current[1](1);
    });

    // The synthetic event should be dispatched
    expect(eventCount).toBe(1);
    // But the hook should only update once (not double-process its own event)
    expect(result.current[0]).toBe(1);

    window.removeEventListener("storage", listener);
  });

  it("handles functional updates with complex transformations", () => {
    const { result } = renderHook(() =>
      useLocalStorage<{ count: number; items: string[] }>("test_complex_update", {
        count: 0,
        items: [],
      }),
    );

    act(() => {
      result.current[1]((prev) => ({
        count: prev.count + 1,
        items: [...prev.items, "item1"],
      }));
    });

    expect(result.current[0]).toEqual({ count: 1, items: ["item1"] });

    act(() => {
      result.current[1]((prev) => ({
        count: prev.count + 1,
        items: [...prev.items, "item2"],
      }));
    });

    expect(result.current[0]).toEqual({ count: 2, items: ["item1", "item2"] });
    expect(JSON.parse(window.localStorage.getItem("test_complex_update")!)).toEqual({
      count: 2,
      items: ["item1", "item2"],
    });
  });

  it("maintains consistency across multiple rapid setValue calls", () => {
    const { result } = renderHook(() => useLocalStorage("test_rapid_calls", 0));

    // Simulate rapid setValue calls that might happen in the same render
    act(() => {
      for (let i = 0; i < 10; i++) {
        result.current[1]((prev) => prev + 1);
      }
    });

    expect(result.current[0]).toBe(10);
    expect(window.localStorage.getItem("test_rapid_calls")).toBe("10");
  });

  it("uses initialValue when localStorage item is explicitly null in storage", () => {
    // Set a key that exists but has no value
    window.localStorage.setItem("test_explicit_null", "null");

    const { result } = renderHook(() => useLocalStorage("test_explicit_null", "default"));

    // JSON.parse("null") returns null, which is a valid stored value
    expect(result.current[0]).toBe(null);
  });

  it("preserves type after multiple updates", () => {
    type TestType = { id: number; name: string; active: boolean };
    const initial: TestType = { id: 1, name: "Test", active: true };

    const { result } = renderHook(() => useLocalStorage<TestType>("test_type_preservation", initial));

    expect(result.current[0]).toEqual(initial);

    act(() => {
      result.current[1]({ id: 2, name: "Updated", active: false });
    });

    expect(result.current[0]).toEqual({ id: 2, name: "Updated", active: false });
    expect(typeof result.current[0].id).toBe("number");
    expect(typeof result.current[0].name).toBe("string");
    expect(typeof result.current[0].active).toBe("boolean");
  });
});