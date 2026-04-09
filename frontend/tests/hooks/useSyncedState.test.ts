import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSyncedState } from "@/hooks/useSyncedState";

describe("useSyncedState", () => {
  it("should initialize with the provided prop value", () => {
    const initialValue = "initial";
    const { result } = renderHook(() => useSyncedState(initialValue));

    expect(result.current[0]).toBe(initialValue);
  });

  it("should update state when prop changes", () => {
    const { result, rerender } = renderHook(({ value }) => useSyncedState(value), {
      initialProps: { value: "first" },
    });

    expect(result.current[0]).toBe("first");

    // Rerender with new prop value
    rerender({ value: "second" });

    expect(result.current[0]).toBe("second");
  });

  it("should allow local state modification via setValue", () => {
    const { result } = renderHook(() => useSyncedState("initial"));

    expect(result.current[0]).toBe("initial");

    // Modify local state
    act(() => {
      result.current[1]("modified");
    });

    expect(result.current[0]).toBe("modified");
  });

  it("should reset local changes when prop changes", () => {
    const { result, rerender } = renderHook(({ value }) => useSyncedState(value), {
      initialProps: { value: "first" },
    });

    // Modify local state
    act(() => {
      result.current[1]("local-change");
    });

    expect(result.current[0]).toBe("local-change");

    // Prop changes - should override local modification
    rerender({ value: "second" });

    expect(result.current[0]).toBe("second");
  });

  it("should work with different data types", () => {
    // Test with number
    const { result: numberResult } = renderHook(() => useSyncedState(42));
    expect(numberResult.current[0]).toBe(42);

    // Test with boolean
    const { result: boolResult } = renderHook(() => useSyncedState(true));
    expect(boolResult.current[0]).toBe(true);

    // Test with object
    const { result: objResult } = renderHook(() => useSyncedState({ key: "value" }));
    expect(objResult.current[0]).toEqual({ key: "value" });

    // Test with null
    const { result: nullResult } = renderHook(() => useSyncedState<string | null>(null));
    expect(nullResult.current[0]).toBeNull();
  });

  it("should support functional updates", () => {
    const { result } = renderHook(() => useSyncedState(10));

    act(() => {
      result.current[1]((prev) => prev + 5);
    });

    expect(result.current[0]).toBe(15);
  });
});
