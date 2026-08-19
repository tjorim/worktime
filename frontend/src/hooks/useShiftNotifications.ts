import type { Dayjs } from "dayjs";
import { useEffect, useRef } from "react";
import type { ScheduleOption } from "@/data/rosters";
import { setTimeFromFractionalHour } from "@/utils/dateTimeUtils";
import { getEffectiveTeam } from "@/utils/scheduleUtils";
import { calculateShift, getCurrentShiftDay, getNextShift } from "@/utils/shiftCalculations";
import { useLiveTime } from "@/hooks/useLiveTime";
import * as m from "@/paraglide/messages.js";

export interface ShiftNotificationOptions {
  enabled: boolean;
  myTeam: number | null;
  scheduleType: ScheduleOption | null;
  leadTimeMinutes: number;
  /** Both null (the default) disables quiet hours. Wraps past midnight when start > end. */
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  /**
   * Skip firing this foreground reminder when true — a Web Push subscription
   * is active on this device and will deliver the same reminder instead
   * (including while the tab is closed), so firing both would double up.
   */
  hasActivePushSubscription: boolean;
}

function isInQuietHours(now: Dayjs, start: number | null, end: number | null): boolean {
  if (start == null || end == null) return false;
  const hour = now.hour();
  if (start <= end) return hour >= start && hour < end;
  return hour >= start || hour < end; // window wraps past midnight
}

/**
 * Fires a single browser notification some lead time before the user's next
 * working shift starts, while the app is open in the foreground.
 *
 * This never requests notification permission itself — that happens when the
 * user turns the Settings toggle on (see SettingsPage). It only checks
 * `Notification.permission`, so revoking permission elsewhere, or never
 * granting it, silently disables the reminder rather than erroring.
 */
export function useShiftNotifications({
  enabled,
  myTeam,
  scheduleType,
  leadTimeMinutes,
  quietHoursStart,
  quietHoursEnd,
  hasActivePushSubscription,
}: ShiftNotificationOptions): void {
  const now = useLiveTime({ precision: "minute" });
  const notifiedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || hasActivePushSubscription) return;
    if (typeof window === "undefined" || typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;

    const team = getEffectiveTeam(myTeam, scheduleType);
    if (team == null) return;

    const shiftDay = getCurrentShiftDay(now, scheduleType);
    const todayShift = calculateShift(shiftDay, team, scheduleType);

    let target: { date: Dayjs; startTime: Dayjs; name: string } | null = null;

    if (todayShift.isWorking && todayShift.start != null) {
      const startTime = setTimeFromFractionalHour(shiftDay, todayShift.start);
      if (startTime.isAfter(now)) {
        target = { date: shiftDay, startTime, name: todayShift.name };
      }
    }
    if (!target) {
      const next = getNextShift(shiftDay, team, scheduleType);
      if (next?.shift.start != null) {
        target = {
          date: next.date,
          startTime: setTimeFromFractionalHour(next.date, next.shift.start),
          name: next.shift.name,
        };
      }
    }
    if (!target) return;

    const key = `${target.date.format("YYYY-MM-DD")}-${target.name}-${target.startTime.valueOf()}`;
    if (notifiedKeyRef.current === key) return;

    const reminderTime = target.startTime.subtract(leadTimeMinutes, "minute");
    if (now.isBefore(reminderTime) || now.isAfter(target.startTime)) return;

    if (isInQuietHours(now, quietHoursStart, quietHoursEnd)) {
      // Respect quiet hours by treating this shift as handled rather than
      // firing late the moment they end.
      notifiedKeyRef.current = key;
      return;
    }

    new Notification(m.shift_reminder_notification_title(), {
      body: m.shift_reminder_notification_body({
        shift: target.name,
        time: target.startTime.format("HH:mm"),
      }),
      tag: "shift-reminder",
    });
    notifiedKeyRef.current = key;
  }, [
    enabled,
    hasActivePushSubscription,
    myTeam,
    scheduleType,
    leadTimeMinutes,
    quietHoursStart,
    quietHoursEnd,
    now,
  ]);
}
