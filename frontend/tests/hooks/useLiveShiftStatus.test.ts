import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLiveShiftStatus } from "@/hooks/useLiveShiftStatus";
import { formatYYWWD } from "@/utils/dateTimeUtils";
import {
  calculateShift,
  getCurrentShiftDay,
  getNextShift,
  getShiftCode,
} from "@/utils/shiftCalculations";

describe("useLiveShiftStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("anchors currentShift to shiftDay during night-shift extension", () => {
    vi.setSystemTime(new Date("2025-07-17T06:22:00"));

    const { result } = renderHook(() => useLiveShiftStatus(4, "5-shift"));

    expect(result.current.shiftDay.format("YYYY-MM-DD")).toBe("2025-07-16");
    expect(result.current.currentShift.date.format("YYYY-MM-DD")).toBe("2025-07-16");
    expect(result.current.currentShift.shift.code).toBe("N");
    expect(result.current.currentShift.code).toBe(`${formatYYWWD(result.current.shiftDay)}N`);
  });

  it("uses calendar date for currentShift when not currently working", () => {
    vi.setSystemTime(new Date("2025-07-17T06:22:00"));

    const { result } = renderHook(() => useLiveShiftStatus(5, "5-shift"));

    expect(result.current.shiftDay.format("YYYY-MM-DD")).toBe("2025-07-16");
    expect(result.current.currentShift.date.format("YYYY-MM-DD")).toBe("2025-07-17");
    expect(result.current.currentShift.code).toBe(getShiftCode(result.current.today, 5, "5-shift"));
  });

  it("anchors nextShift search from shiftDay", () => {
    vi.setSystemTime(new Date("2025-07-17T06:22:00"));

    const { result } = renderHook(() => useLiveShiftStatus(5, "5-shift"));

    const expectedShiftDay = getCurrentShiftDay(result.current.today, "5-shift");
    const expectedNextShift = getNextShift(expectedShiftDay, 5, "5-shift");

    expect(result.current.nextShift?.date.toISOString()).toBe(
      expectedNextShift?.date.toISOString(),
    );
    expect(result.current.nextShift?.shift.code).toBe(expectedNextShift?.shift.code);
  });

  it("updates today on minute boundaries", () => {
    vi.setSystemTime(new Date("2025-07-17T10:00:00"));

    const { result } = renderHook(() => useLiveShiftStatus(1, "9-5"));
    const initialTime = result.current.today;

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current.today.isAfter(initialTime)).toBe(true);
    expect(result.current.currentShift.shift.code).toBe(
      calculateShift(result.current.today, 1, "9-5").code,
    );
  });
});
