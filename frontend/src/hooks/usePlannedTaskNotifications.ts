import type { Dayjs } from "dayjs";
import { useEffect, useRef } from "react";
import { dayjs } from "@/utils/dateTimeUtils";
import type { StoredTimeTrackingTask } from "@/lib/timeTracking/types";
import { useLiveTime } from "@/hooks/useLiveTime";
import * as m from "@/paraglide/messages.js";

/** How far ahead of a planned task's start time the reminder fires. */
const LEAD_TIME_MINUTES = 10;

export interface PlannedTaskNotificationOptions {
  enabled: boolean;
  tasks: StoredTimeTrackingTask[];
  /**
   * Skip firing this foreground reminder when true — a Web Push subscription
   * is active on this device and will deliver the same reminder instead
   * (including while the tab is closed), so firing both would double up.
   */
  hasActivePushSubscription: boolean;
}

/**
 * Fires a single browser notification shortly before the next planned
 * time-tracking task (logged ahead of time, not yet started — the "Planned"
 * badge state in DailyTaskList.tsx) is due to start, while the app is open
 * in the foreground.
 *
 * This never requests notification permission itself — that happens when the
 * user turns the Settings toggle on (see SettingsPage). It only checks
 * `Notification.permission`, so revoking permission elsewhere, or never
 * granting it, silently disables the reminder rather than erroring.
 */
export function usePlannedTaskNotifications({
  enabled,
  tasks,
  hasActivePushSubscription,
}: PlannedTaskNotificationOptions): void {
  const now = useLiveTime({ precision: "minute" });
  // Keyed by id + start_time (not just id) so rescheduling an already-notified task to a
  // new time — which reopens its reminder window — fires a fresh reminder instead of being
  // silently treated as already handled.
  const notifiedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || hasActivePushSubscription) return;
    if (typeof window === "undefined" || typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;

    let next: { task: StoredTimeTrackingTask; startTime: Dayjs } | null = null;
    for (const task of tasks) {
      if (!task.stopTime) continue;
      const startTime = dayjs(task.startTime);
      if (!startTime.isAfter(now)) continue;
      if (!next || startTime.isBefore(next.startTime)) {
        next = { task, startTime };
      }
    }
    if (!next) return;

    const key = `${next.task.id}-${next.startTime.valueOf()}`;
    if (notifiedKeyRef.current === key) return;

    const reminderTime = next.startTime.subtract(LEAD_TIME_MINUTES, "minute");
    if (now.isBefore(reminderTime) || now.isAfter(next.startTime)) return;

    new Notification(m.planned_task_reminder_notification_title(), {
      body: m.planned_task_reminder_notification_body({
        task: next.task.text,
        time: next.startTime.format("HH:mm"),
      }),
      tag: "planned-task-reminder",
    });
    notifiedKeyRef.current = key;
  }, [enabled, hasActivePushSubscription, tasks, now]);
}
