import type { Dayjs } from "dayjs";
import { useEffect, useRef } from "react";
import type { ScheduleOption } from "@/data/rosters";
import { setTimeFromFractionalHour } from "@/utils/dateTimeUtils";
import { getEffectiveTeam } from "@/utils/scheduleUtils";
import { calculateShift, getCurrentShiftDay, getNextShift } from "@/utils/shiftCalculations";
import { useLiveTime } from "@/hooks/useLiveTime";
import * as m from "@/paraglide/messages.js";

const REMINDER_LEAD_MINUTES = 15;

/**
 * Fires a single browser notification ~15 minutes before the user's next
 * working shift starts, while the app is open in the foreground.
 *
 * This never requests notification permission itself — that happens when the
 * user turns the Settings toggle on (see SettingsPage). It only checks
 * `Notification.permission`, so revoking permission elsewhere, or never
 * granting it, silently disables the reminder rather than erroring.
 */
export function useShiftNotifications(
  enabled: boolean,
  myTeam: number | null,
  scheduleType: ScheduleOption | null,
): void {
  const now = useLiveTime({ precision: "minute" });
  const notifiedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
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

    const reminderTime = target.startTime.subtract(REMINDER_LEAD_MINUTES, "minute");
    if (now.isBefore(reminderTime) || now.isAfter(target.startTime)) return;

    new Notification(m.shift_reminder_notification_title(), {
      body: m.shift_reminder_notification_body({
        shift: target.name,
        time: target.startTime.format("HH:mm"),
      }),
      tag: "shift-reminder",
    });
    notifiedKeyRef.current = key;
  }, [enabled, myTeam, scheduleType, now]);
}
