import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSettings } from "../contexts/SettingsContext";
import { useToast } from "../contexts/ToastContext";
import type { UpcomingShiftResult } from "../utils/shiftCalculations";

const REMINDER_LEAD_MS: Record<"15m" | "1h" | "2h", number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "2h": 2 * 60 * 60 * 1000,
};

const SW_TAG = "worktime-shift-reminder";

const formatHour = (hour: number) => dayjs().hour(hour).minute(0).second(0).format("HH:mm");

function getShiftStartTimestamp(nextShift: UpcomingShiftResult): Dayjs | null {
  if (nextShift.shift.start == null) return null;
  return nextShift.date.hour(nextShift.shift.start).minute(0).second(0).millisecond(0);
}

export function useShiftNotifications(nextShift: UpcomingShiftResult | null, myTeam: number | null) {
  const { settings, updateNotifications } = useSettings();
  const toast = useToast();
  const lastScheduledKeyRef = useRef<string | null>(null);

  const isNotificationSupported = useMemo(() => {
    return (
      typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "showNotification" in ServiceWorkerRegistration.prototype
    );
  }, []);

  const ensurePermissionIfEnabled = useCallback(async () => {
    if (!isNotificationSupported || settings.notifications !== "on") return;
    if (Notification.permission === "granted") return;

    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      toast.showSuccess("Shift reminder notifications enabled.", "bi-bell-fill");
      return;
    }

    updateNotifications("off");
    toast.showWarning("Notification permission denied. Reminders were disabled.", "bi-bell-slash");
  }, [isNotificationSupported, settings.notifications, toast, updateNotifications]);

  useEffect(() => {
    if (!isNotificationSupported || settings.notifications !== "on") return;
    void ensurePermissionIfEnabled();
  }, [ensurePermissionIfEnabled, isNotificationSupported, settings.notifications]);

  useEffect(() => {
    if (!isNotificationSupported || settings.notifications !== "on") return;
    if (!nextShift || !myTeam) return;
    if (Notification.permission !== "granted") return;

    const shiftStartAt = getShiftStartTimestamp(nextShift);
    if (!shiftStartAt) return;

    const startHour = nextShift.shift.start;
    if (startHour == null) return;

    const reminderAt = shiftStartAt.subtract(REMINDER_LEAD_MS[settings.notificationLeadTime], "milliseconds");
    if (reminderAt.isBefore(dayjs())) return;

    const scheduleKey = `${nextShift.code}:${settings.notificationLeadTime}:${myTeam}`;
    if (lastScheduledKeyRef.current === scheduleKey) return;

    lastScheduledKeyRef.current = scheduleKey;

    void navigator.serviceWorker.ready
      .then((registration) => {
        registration.active?.postMessage({
          type: "SCHEDULE_SHIFT_REMINDER",
          payload: {
            tag: SW_TAG,
            triggerAt: reminderAt.valueOf(),
            title: `Shift reminder: Team ${myTeam}`,
            body: `${nextShift.shift.name} shift starts at ${formatHour(startHour)} (${nextShift.code}).`,
            data: {
              shiftCode: nextShift.code,
              shiftName: nextShift.shift.name,
              team: myTeam,
            },
          },
        });
      })
      .catch((error) => {
        console.error("Failed to schedule shift reminder via service worker", error);
        toast.showWarning("Could not schedule shift reminder.", "bi-bell-slash");
      });
  }, [isNotificationSupported, myTeam, nextShift, settings.notificationLeadTime, settings.notifications, toast]);

  return {
    isNotificationSupported,
  };
}
