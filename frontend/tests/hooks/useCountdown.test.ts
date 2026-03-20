import { act, renderHook } from "@testing-library/react";
import type { Dayjs } from "dayjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCountdown } from "../../src/hooks/useCountdown";
import { dayjs } from "../../src/utils/dateTimeUtils";

describe("useCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("initialization", () => {
    it("should initialize with correct countdown when target date is in future", () => {
      const futureDate = dayjs().add(10, "seconds");
      const { result } = renderHook(() => useCountdown(futureDate));

      expect(result.current.totalSeconds).toBe(10);
      expect(result.current.seconds).toBe(10);
      expect(result.current.minutes).toBe(0);
      expect(result.current.hours).toBe(0);
      expect(result.current.days).toBe(0);
      expect(result.current.isExpired).toBe(false);
      expect(result.current.formatted).toBe("10s");
    });

    it("should initialize as expired when target date is null", () => {
      const { result } = renderHook(() => useCountdown(null));

      expect(result.current.totalSeconds).toBe(0);
      expect(result.current.seconds).toBe(0);
      expect(result.current.minutes).toBe(0);
      expect(result.current.hours).toBe(0);
      expect(result.current.days).toBe(0);
      expect(result.current.isExpired).toBe(true);
      expect(result.current.formatted).toBe("");
    });

    it("should initialize as expired when target date is in the past", () => {
      const pastDate = dayjs().subtract(10, "seconds");
      const { result } = renderHook(() => useCountdown(pastDate));

      expect(result.current.totalSeconds).toBe(0);
      expect(result.current.isExpired).toBe(true);
      expect(result.current.formatted).toBe("");
    });

    it("should handle target date exactly at current time", () => {
      const currentDate = dayjs();
      const { result } = renderHook(() => useCountdown(currentDate));

      expect(result.current.isExpired).toBe(true);
      expect(result.current.totalSeconds).toBe(0);
    });
  });

  describe("time calculations", () => {
    it("should calculate seconds correctly", () => {
      const futureDate = dayjs().add(45, "seconds");
      const { result } = renderHook(() => useCountdown(futureDate));

      expect(result.current.seconds).toBe(45);
      expect(result.current.minutes).toBe(0);
      expect(result.current.hours).toBe(0);
      expect(result.current.days).toBe(0);
      expect(result.current.totalSeconds).toBe(45);
    });

    it("should calculate minutes and seconds correctly", () => {
      const futureDate = dayjs().add(125, "seconds"); // 2m 5s
      const { result } = renderHook(() => useCountdown(futureDate));

      expect(result.current.seconds).toBe(5);
      expect(result.current.minutes).toBe(2);
      expect(result.current.hours).toBe(0);
      expect(result.current.days).toBe(0);
      expect(result.current.totalSeconds).toBe(125);
    });

    it("should calculate hours, minutes and seconds correctly", () => {
      const futureDate = dayjs().add(3665, "seconds"); // 1h 1m 5s
      const { result } = renderHook(() => useCountdown(futureDate));

      expect(result.current.seconds).toBe(5);
      expect(result.current.minutes).toBe(1);
      expect(result.current.hours).toBe(1);
      expect(result.current.days).toBe(0);
      expect(result.current.totalSeconds).toBe(3665);
    });

    it("should calculate days, hours, minutes and seconds correctly", () => {
      const futureDate = dayjs().add(90061, "seconds"); // 1d 1h 1m 1s
      const { result } = renderHook(() => useCountdown(futureDate));

      expect(result.current.seconds).toBe(1);
      expect(result.current.minutes).toBe(1);
      expect(result.current.hours).toBe(1);
      expect(result.current.days).toBe(1);
      expect(result.current.totalSeconds).toBe(90061);
    });
  });

  describe("formatting", () => {
    it("should format seconds only", () => {
      const futureDate = dayjs().add(30, "seconds");
      const { result } = renderHook(() => useCountdown(futureDate));

      expect(result.current.formatted).toBe("30s");
    });

    it("should format minutes and seconds", () => {
      const futureDate = dayjs().add(125, "seconds"); // 2m 5s
      const { result } = renderHook(() => useCountdown(futureDate));

      expect(result.current.formatted).toBe("2m 5s");
    });

    it("should format hours and minutes (no seconds)", () => {
      const futureDate = dayjs().add(3660, "seconds"); // 1h 1m
      const { result } = renderHook(() => useCountdown(futureDate));

      expect(result.current.formatted).toBe("1h 1m");
    });

    it("should return empty string when expired", () => {
      const pastDate = dayjs().subtract(10, "seconds");
      const { result } = renderHook(() => useCountdown(pastDate));

      expect(result.current.formatted).toBe("");
    });
  });

  describe("real-time updates", () => {
    it("should update countdown every second by default", () => {
      const futureDate = dayjs().add(5, "seconds");
      const { result, unmount } = renderHook(() => useCountdown(futureDate));

      expect(result.current.totalSeconds).toBe(5);

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(result.current.totalSeconds).toBe(4);

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(result.current.totalSeconds).toBe(3);

      // Clean up
      unmount();
    });

    it("should become expired when countdown reaches zero", () => {
      const futureDate = dayjs().add(2, "seconds");
      const { result, unmount } = renderHook(() => useCountdown(futureDate));

      expect(result.current.isExpired).toBe(false);

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(result.current.isExpired).toBe(true);
      expect(result.current.totalSeconds).toBe(0);
      expect(result.current.formatted).toBe("");

      // Clean up
      unmount();
    });
  });

  describe("target date changes", () => {
    it("should update countdown when target date changes", () => {
      let targetDate: Dayjs | null = dayjs().add(5, "seconds");
      const { result, rerender, unmount } = renderHook(
        ({ date }: { date: Dayjs | null }) => useCountdown(date),
        { initialProps: { date: targetDate } },
      );

      expect(result.current.totalSeconds).toBe(5);

      // Change target date
      targetDate = dayjs().add(10, "seconds");
      rerender({ date: targetDate });

      expect(result.current.totalSeconds).toBe(10);

      // Clean up
      unmount();
    });

    it("should handle changing from valid date to null", () => {
      const targetDate: Dayjs | null = dayjs().add(5, "seconds");
      const { result, rerender, unmount } = renderHook(
        ({ date }: { date: Dayjs | null }) => useCountdown(date),
        { initialProps: { date: targetDate } },
      );

      expect(result.current.isExpired).toBe(false);

      rerender({ date: null });

      expect(result.current.isExpired).toBe(true);
      expect(result.current.totalSeconds).toBe(0);

      // Clean up
      unmount();
    });
  });

  describe("cleanup", () => {
    it("should clear interval on unmount", () => {
      const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
      const futureDate = dayjs().add(5, "seconds");
      const { unmount } = renderHook(() => useCountdown(futureDate));

      unmount();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    it("should handle invalid dayjs objects gracefully", () => {
      const invalidDate = dayjs("invalid-date");
      const { result } = renderHook(() => useCountdown(invalidDate));

      expect(result.current.isExpired).toBe(true);
      expect(result.current.totalSeconds).toBe(0);
    });

    it("should handle very short countdowns", () => {
      const futureDate = dayjs().add(100, "milliseconds");
      const { result } = renderHook(() => useCountdown(futureDate));

      expect(result.current.totalSeconds).toBe(0); // Rounds down to 0 seconds
      expect(result.current.isExpired).toBe(true);
    });
  });
});
