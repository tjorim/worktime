import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useEventForm } from "@/hooks/useEventForm";
import { getLocale, setLocale } from "@/paraglide/runtime.js";

describe("useEventForm validation", () => {
  const originalLocale = getLocale();

  beforeEach(async () => {
    await setLocale("en", { reload: false });
  });

  afterEach(async () => {
    await setLocale(originalLocale, { reload: false });
  });

  it("returns localized English errors for every invalid range state", () => {
    const { result } = renderHook(() => useEventForm());

    act(() => {
      result.current.validateForm();
    });
    expect(result.current.startDateError).toBe("Start date is required");

    act(() => {
      result.current.setEventStart("2026/02/30");
      result.current.setEventEnd("2026/04/31");
    });
    act(() => {
      result.current.validateForm();
    });
    expect(result.current.startDateError).toBe("Invalid date (e.g., Feb 30 or April 31)");
    expect(result.current.endDateError).toBe("Invalid date (e.g., Feb 30 or April 31)");

    act(() => {
      result.current.setEventStart("2026/05/02");
      result.current.setEventEnd("2026/05/01");
    });
    act(() => {
      result.current.validateForm();
    });
    expect(result.current.endDateError).toBe("End date must be after start date");
  });

  it("uses the active locale for validation errors", async () => {
    await setLocale("nl", { reload: false });
    const { result } = renderHook(() => useEventForm());

    act(() => {
      result.current.validateForm();
    });

    expect(result.current.startDateError).toBe("Startdatum is verplicht");
  });
});
