import type { AccountPreferencesInput } from "@/api-types";
import { isValidScheduleType } from "@/lib/schedule/scheduleUtils";
import { isIsoCountryCode } from "@/types/countries";

export function isPreferenceRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const optionalBoolean = (value: unknown) => (typeof value === "boolean" ? value : undefined);
const country = (value: unknown) => (isIsoCountryCode(value) || value === null ? value : undefined);

/** Project historical browser state onto the current wire contract. */
export function toAccountPreferences(state: Record<string, unknown>): AccountPreferencesInput {
  const settings = isPreferenceRecord(state.settings) ? state.settings : undefined;
  const myTeam = state.myTeam;
  const scheduleType = state.scheduleType;
  return {
    schemaVersion: 1,
    scheduleType:
      isValidScheduleType(scheduleType) || scheduleType === null ? scheduleType : undefined,
    myTeam:
      myTeam === null ||
      (typeof myTeam === "number" && Number.isInteger(myTeam) && myTeam >= 1 && myTeam <= 5)
        ? myTeam
        : undefined,
    hasCompletedOnboarding: optionalBoolean(state.hasCompletedOnboarding),
    accountSyncAnnouncementSeen: optionalBoolean(state.accountSyncAnnouncementSeen),
    ganttAnnouncementSeen: optionalBoolean(state.ganttAnnouncementSeen),
    crossBorderAnnouncementSeen: optionalBoolean(state.crossBorderAnnouncementSeen),
    settings: settings && {
      timeFormat:
        settings.timeFormat === "12h" || settings.timeFormat === "24h"
          ? settings.timeFormat
          : undefined,
      enableTimeOff: optionalBoolean(settings.enableTimeOff),
      enableTimeTracking: optionalBoolean(settings.enableTimeTracking),
      enableGantt: optionalBoolean(settings.enableGantt),
      enableCrossBorderTracking: optionalBoolean(settings.enableCrossBorderTracking),
      enableUnifiedCalendar: optionalBoolean(settings.enableUnifiedCalendar),
      homeCountry: country(settings.homeCountry),
      officeCountry: country(settings.officeCountry),
      hdayUsername:
        typeof settings.hdayUsername === "string"
          ? settings.hdayUsername.trim() || null
          : settings.hdayUsername === null
            ? null
            : undefined,
    },
  };
}
