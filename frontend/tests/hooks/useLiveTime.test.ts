import { act, renderHook } from "@testing-library/react";
import type { Dayjs } from "dayjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLiveTime } from "../../src/hooks/useLiveTime";
import { dayjs } from "../../src/utils/dateTimeUtils";

// Mock our centralized dayjs setup
vi.mock("../../src/utils/dateTimeUtils", () => {
  const mockDayjs = vi.fn();
  return {
    dayjs: mockDayjs,
  };
});

describe("useLiveTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns current time", () => {
    const mockTime = { format: vi.fn(() => "14:30") } as unknown as Dayjs;
    vi.mocked(dayjs).mockReturnValue(mockTime);

    const { result } = renderHook(() => useLiveTime());

    expect(result.current).toBe(mockTime);
    expect(dayjs).toHaveBeenCalled();
  });

  it("updates time every minute by default for better performance", () => {
    const mockTime1 = {
      format: vi.fn(() => "14:30"),
    } as unknown as Dayjs;
    const mockTime2 = {
      format: vi.fn(() => "14:31"),
    } as unknown as Dayjs;

    vi.mocked(dayjs).mockReturnValueOnce(mockTime1).mockReturnValue(mockTime2);

    const { result } = renderHook(() => useLiveTime());

    expect(result.current).toBe(mockTime1);

    // Fast-forward 1 minute (default interval)
    act(() => {
      vi.advanceTimersByTime(60000);
    });

    expect(result.current).toBe(mockTime2);
    // Should be called 3 times (initial state + mount + interval)
    expect(dayjs).toHaveBeenCalledTimes(3);
  });

  it('updates every second when precision is set to "second"', () => {
    const mockTime1 = {
      format: vi.fn(() => "14:30:00"),
    } as unknown as Dayjs;
    const mockTime2 = {
      format: vi.fn(() => "14:30:01"),
    } as unknown as Dayjs;

    vi.mocked(dayjs).mockReturnValueOnce(mockTime1).mockReturnValue(mockTime2);

    const { result } = renderHook(() => useLiveTime({ precision: "second" }));

    expect(result.current).toBe(mockTime1);

    // Fast-forward 1 second
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current).toBe(mockTime2);
    expect(dayjs).toHaveBeenCalledTimes(3);
  });

  it("uses custom update interval when specified", () => {
    const mockTime1 = {
      format: vi.fn(() => "14:30:00"),
    } as unknown as Dayjs;
    const mockTime2 = {
      format: vi.fn(() => "14:30:05"),
    } as unknown as Dayjs;

    vi.mocked(dayjs).mockReturnValueOnce(mockTime1).mockReturnValue(mockTime2);

    const { result } = renderHook(() => useLiveTime({ updateInterval: 5000 }));

    expect(result.current).toBe(mockTime1);

    // Fast-forward 5 seconds
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current).toBe(mockTime2);
    expect(dayjs).toHaveBeenCalledTimes(3);
  });

  it("updates multiple times as time progresses with second precision", () => {
    const times = [
      { format: vi.fn(() => "14:30:00") } as unknown as Dayjs,
      { format: vi.fn(() => "14:30:01") } as unknown as Dayjs,
      { format: vi.fn(() => "14:30:02") } as unknown as Dayjs,
      { format: vi.fn(() => "14:30:03") } as unknown as Dayjs,
    ];

    let callCount = 0;
    vi.mocked(dayjs).mockImplementation(() => {
      const result = times[Math.min(callCount, times.length - 1)];
      callCount++;
      return result;
    });

    const { result } = renderHook(() => useLiveTime({ precision: "second" }));

    expect(result.current).toBe(times[0]);

    // Advance multiple seconds
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Should have been called multiple times (mount + interval calls)
    expect(dayjs).toHaveBeenCalledTimes(5);
  });

  it("cleans up interval on unmount", () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const mockTime = { format: vi.fn(() => "14:30") } as unknown as Dayjs;
    vi.mocked(dayjs).mockReturnValue(mockTime);

    const { unmount } = renderHook(() => useLiveTime());

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it("continues updating after component re-renders", () => {
    let callCount = 0;
    const times = [
      { format: vi.fn(() => "14:30:00") } as unknown as Dayjs,
      { format: vi.fn(() => "14:30:01") } as unknown as Dayjs,
    ];

    vi.mocked(dayjs).mockImplementation(() => {
      const result = times[Math.min(callCount, times.length - 1)];
      callCount++;
      return result;
    });

    const { result, rerender } = renderHook(() => useLiveTime({ precision: "second" }));

    expect(result.current).toBe(times[0]);

    // Re-render the component
    rerender();

    // Time should still update
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Should have been called at least twice
    expect(dayjs).toHaveBeenCalledTimes(4);
  });

  it("starts fresh interval after re-mount", () => {
    const mockTime = { format: vi.fn(() => "14:30") } as unknown as Dayjs;
    vi.mocked(dayjs).mockReturnValue(mockTime);

    const { unmount } = renderHook(() => useLiveTime({ precision: "second" }));
    unmount();

    // Mount again
    const { result } = renderHook(() => useLiveTime({ precision: "second" }));

    expect(result.current).toBe(mockTime);

    // Should still update
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(dayjs).toHaveBeenCalled(); // Should be called after re-mount
  });
});
