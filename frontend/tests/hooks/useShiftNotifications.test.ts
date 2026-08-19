import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useShiftNotifications } from "@/hooks/useShiftNotifications";
import * as m from "@/paraglide/messages.js";

// 2025-07-17 is a Thursday; the "9-5" schedule works Mon-Fri, 09:00-17:00, single team.
const THURSDAY_SHIFT_START = "2025-07-17T09:00:00";

describe("useShiftNotifications", () => {
  const notificationCtor = vi.fn();

  class MockNotification {
    static permission: NotificationPermission = "granted";
    static requestPermission = vi.fn();
    constructor(title: string, options?: NotificationOptions) {
      notificationCtor(title, options);
    }
  }

  beforeEach(() => {
    vi.useFakeTimers();
    notificationCtor.mockClear();
    MockNotification.permission = "granted";
    vi.stubGlobal("Notification", MockNotification);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("fires a reminder when mounted inside the 15-minute window before a working shift", () => {
    vi.setSystemTime(new Date("2025-07-17T08:50:00"));

    renderHook(() => useShiftNotifications(true, 1, "9-5"));

    expect(notificationCtor).toHaveBeenCalledTimes(1);
    expect(notificationCtor).toHaveBeenCalledWith(
      m.shift_reminder_notification_title(),
      expect.objectContaining({
        body: m.shift_reminder_notification_body({ shift: "Day", time: "09:00" }),
        tag: "shift-reminder",
      }),
    );
  });

  it("waits until the reminder window before firing", () => {
    vi.setSystemTime(new Date("2025-07-17T08:00:00"));

    renderHook(() => useShiftNotifications(true, 1, "9-5"));
    expect(notificationCtor).not.toHaveBeenCalled();

    // Still outside the window (44 minutes before start).
    act(() => {
      vi.advanceTimersByTime(44 * 60_000);
    });
    expect(notificationCtor).not.toHaveBeenCalled();

    // Now 15 minutes before start.
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(notificationCtor).toHaveBeenCalledTimes(1);
  });

  it("does not fire twice for the same shift", () => {
    vi.setSystemTime(new Date("2025-07-17T08:50:00"));

    renderHook(() => useShiftNotifications(true, 1, "9-5"));
    expect(notificationCtor).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(5 * 60_000);
    });
    expect(notificationCtor).toHaveBeenCalledTimes(1);
  });

  it("does not fire when disabled", () => {
    vi.setSystemTime(new Date("2025-07-17T08:50:00"));

    renderHook(() => useShiftNotifications(false, 1, "9-5"));

    expect(notificationCtor).not.toHaveBeenCalled();
  });

  it("does not fire when browser permission is not granted", () => {
    MockNotification.permission = "default";
    vi.setSystemTime(new Date("2025-07-17T08:50:00"));

    renderHook(() => useShiftNotifications(true, 1, "9-5"));

    expect(notificationCtor).not.toHaveBeenCalled();
  });

  it("does not fire on an off day", () => {
    // 2025-07-19 is a Saturday - "9-5" doesn't work weekends, and the next
    // working shift (Monday) is far outside the reminder window.
    vi.setSystemTime(new Date("2025-07-19T08:50:00"));

    renderHook(() => useShiftNotifications(true, 1, "9-5"));

    expect(notificationCtor).not.toHaveBeenCalled();
  });

  it("does nothing without a valid team/schedule", () => {
    vi.setSystemTime(new Date(THURSDAY_SHIFT_START));

    renderHook(() => useShiftNotifications(true, null, null));

    expect(notificationCtor).not.toHaveBeenCalled();
  });
});
