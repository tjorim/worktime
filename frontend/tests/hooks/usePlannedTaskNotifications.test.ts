import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  usePlannedTaskNotifications,
  type PlannedTaskNotificationOptions,
} from "@/hooks/usePlannedTaskNotifications";
import type { StoredTimeTrackingTask } from "@/lib/timeTracking/types";
import * as m from "@/paraglide/messages.js";

function buildTask(overrides: Partial<StoredTimeTrackingTask> = {}): StoredTimeTrackingTask {
  return {
    id: "task-1",
    text: "Team meeting",
    label: "label-1",
    startTime: "2025-07-17T09:00:00",
    stopTime: "2025-07-17T10:00:00",
    ...overrides,
  };
}

function buildOptions(
  overrides: Partial<PlannedTaskNotificationOptions> = {},
): PlannedTaskNotificationOptions {
  return {
    enabled: true,
    tasks: [buildTask()],
    hasActivePushSubscription: false,
    ...overrides,
  };
}

describe("usePlannedTaskNotifications", () => {
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

  it("fires a reminder when mounted inside the 10-minute reminder window", () => {
    vi.setSystemTime(new Date("2025-07-17T08:55:00"));

    renderHook(() => usePlannedTaskNotifications(buildOptions()));

    expect(notificationCtor).toHaveBeenCalledTimes(1);
    expect(notificationCtor).toHaveBeenCalledWith(
      m.planned_task_reminder_notification_title(),
      expect.objectContaining({
        body: m.planned_task_reminder_notification_body({ task: "Team meeting", time: "09:00" }),
        tag: "planned-task-reminder",
      }),
    );
  });

  it("waits until the reminder window before firing", () => {
    vi.setSystemTime(new Date("2025-07-17T08:00:00"));

    renderHook(() => usePlannedTaskNotifications(buildOptions()));
    expect(notificationCtor).not.toHaveBeenCalled();

    // Still outside the window (49 minutes before start).
    act(() => {
      vi.advanceTimersByTime(49 * 60_000);
    });
    expect(notificationCtor).not.toHaveBeenCalled();

    // Now 10 minutes before start.
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(notificationCtor).toHaveBeenCalledTimes(1);
  });

  it("does not fire twice for the same task", () => {
    vi.setSystemTime(new Date("2025-07-17T08:55:00"));

    renderHook(() => usePlannedTaskNotifications(buildOptions()));
    expect(notificationCtor).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(2 * 60_000);
    });
    expect(notificationCtor).toHaveBeenCalledTimes(1);
  });

  it("does not fire when disabled", () => {
    vi.setSystemTime(new Date("2025-07-17T08:55:00"));

    renderHook(() => usePlannedTaskNotifications(buildOptions({ enabled: false })));

    expect(notificationCtor).not.toHaveBeenCalled();
  });

  it("does not fire when a push subscription is already handling reminders", () => {
    vi.setSystemTime(new Date("2025-07-17T08:55:00"));

    renderHook(() =>
      usePlannedTaskNotifications(buildOptions({ hasActivePushSubscription: true })),
    );

    expect(notificationCtor).not.toHaveBeenCalled();
  });

  it("does not fire when browser permission is not granted", () => {
    MockNotification.permission = "default";
    vi.setSystemTime(new Date("2025-07-17T08:55:00"));

    renderHook(() => usePlannedTaskNotifications(buildOptions()));

    expect(notificationCtor).not.toHaveBeenCalled();
  });

  it("ignores a running task with no stop_time", () => {
    vi.setSystemTime(new Date("2025-07-17T08:55:00"));

    renderHook(() =>
      usePlannedTaskNotifications(buildOptions({ tasks: [buildTask({ stopTime: null })] })),
    );

    expect(notificationCtor).not.toHaveBeenCalled();
  });

  it("ignores a task that has already started", () => {
    vi.setSystemTime(new Date("2025-07-17T09:05:00"));

    renderHook(() => usePlannedTaskNotifications(buildOptions()));

    expect(notificationCtor).not.toHaveBeenCalled();
  });

  it("picks the earliest of several upcoming planned tasks", () => {
    vi.setSystemTime(new Date("2025-07-17T08:55:00"));

    renderHook(() =>
      usePlannedTaskNotifications(
        buildOptions({
          tasks: [
            buildTask({ id: "later", text: "Later task", startTime: "2025-07-17T11:00:00" }),
            buildTask({ id: "sooner", text: "Sooner task", startTime: "2025-07-17T09:00:00" }),
          ],
        }),
      ),
    );

    expect(notificationCtor).toHaveBeenCalledTimes(1);
    expect(notificationCtor).toHaveBeenCalledWith(
      m.planned_task_reminder_notification_title(),
      expect.objectContaining({
        body: m.planned_task_reminder_notification_body({ task: "Sooner task", time: "09:00" }),
      }),
    );
  });

  it("does nothing without any planned tasks", () => {
    vi.setSystemTime(new Date("2025-07-17T08:55:00"));

    renderHook(() => usePlannedTaskNotifications(buildOptions({ tasks: [] })));

    expect(notificationCtor).not.toHaveBeenCalled();
  });
});
