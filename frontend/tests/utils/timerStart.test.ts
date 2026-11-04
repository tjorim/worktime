import { afterEach, describe, expect, it } from "vitest";
import { dayjs } from "@/utils/dateTimeUtils";
import { TIMER_EXACT_START_STORAGE_KEY } from "@/constants/storageKeys";
import { getTimerStart, rememberExactTimerStart } from "@/utils/timerStart";

const task = { id: "t1", startTime: "2025-01-01T10:15" };

describe("timer exact start", () => {
  afterEach(() => sessionStorage.clear());

  it("falls back to the stored minute when nothing was remembered", () => {
    expect(getTimerStart(task).format("HH:mm:ss")).toBe("10:15:00");
  });

  it("returns the remembered click time for the same task", () => {
    rememberExactTimerStart("t1", dayjs("2025-01-01T10:15:42"));
    expect(getTimerStart(task).format("HH:mm:ss")).toBe("10:15:42");
  });

  it("ignores another task's start", () => {
    rememberExactTimerStart("other", dayjs("2025-01-01T10:15:42"));
    expect(getTimerStart(task).format("HH:mm:ss")).toBe("10:15:00");
  });

  it("ignores a time outside the stored minute", () => {
    rememberExactTimerStart("t1", dayjs("2025-01-01T10:16:01"));
    expect(getTimerStart(task).format("HH:mm:ss")).toBe("10:15:00");
    rememberExactTimerStart("t1", dayjs("2025-01-01T10:14:59"));
    expect(getTimerStart(task).format("HH:mm:ss")).toBe("10:15:00");
  });

  it("ignores corrupt storage", () => {
    sessionStorage.setItem(TIMER_EXACT_START_STORAGE_KEY, "{nope");
    expect(getTimerStart(task).format("HH:mm:ss")).toBe("10:15:00");
  });
});
