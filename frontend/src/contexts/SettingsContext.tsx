import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo, useRef } from "react";
import { SCHEDULE_OPTIONS, type ScheduleOption } from "@/data/rosters";
import { LastUsedProvider, type LastUsedContextType } from "@/contexts/LastUsedContext";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import type { CountryCode } from "@/types/countries";
import { isValidCountryCode } from "@/types/countries";

import { USER_STATE_STORAGE_KEY } from "@/constants/storageKeys";
import { DEVICE_LOCAL_SETTING_KEYS } from "@/constants/deviceLocalSettings";
import { logger } from "@/utils/logger";

export type TimeFormat = "12h" | "24h";
export type Theme = "light" | "dark" | "auto";
export type NotificationSetting = "on" | "off";
export type TabKey =
  | "calendar"
  | "unified-calendar"
  | "schedule"
  | "timeoff"
  | "timetracking"
  | "gantt";
export type ScheduleViewKey = "schedule" | "transfer";
export type TimeOffViewKey = "table" | "stats" | "team";
export type TimeTrackingViewKey = "daily" | "weekly";
export type GanttViewMode = "Day" | "Week" | "Month" | "Year";
export type GanttViewKey = "chart" | "table";

export interface LastUsed {
  activeTab: TabKey;
  scheduleView: ScheduleViewKey;
  otherSchedule: ScheduleOption | null;
  timeOffView: TimeOffViewKey;
  timeTrackingView: TimeTrackingViewKey;
  otherTeam: number | null;
  ganttViewMode: GanttViewMode;
  ganttView: GanttViewKey;
}

export interface UserSettings {
  timeFormat: TimeFormat;
  theme: Theme;
  /** Whether reminders for upcoming planned time-tracking entries are enabled. */
  notifications: NotificationSetting;
  enableTimeOff: boolean;
  enableTimeTracking: boolean;
  enableGantt: boolean;
  enableCrossBorderTracking: boolean;
  enableUnifiedCalendar: boolean;
  homeCountry: CountryCode | null;
  officeCountry: CountryCode | null;
  /** The user's username on the legacy `.hday` share, used by the hday-helper pull/push actions. */
  hdayUsername: string | null;
}

interface SettingsContextType {
  settings: UserSettings;
  updateTimeFormat: (format: TimeFormat) => void;
  updateTheme: (theme: Theme) => void;
  updateNotifications: (setting: NotificationSetting) => void;
  updateTimeOffEnabled: (enabled: boolean) => void;
  updateTimeTrackingEnabled: (enabled: boolean) => void;
  updateGanttEnabled: (enabled: boolean) => void;
  updateCrossBorderTrackingEnabled: (enabled: boolean) => void;
  updateUnifiedCalendarEnabled: (enabled: boolean) => void;
  updateHomeCountry: (country: CountryCode | null) => void;
  updateOfficeCountry: (country: CountryCode | null) => void;
  updateHdayUsername: (username: string | null) => void;
  resetSettings: () => void;
  // Unified user state additions:
  myTeam: number | null; // The user's team from onboarding
  setMyTeam: (team: number | null) => void;
  scheduleType: ScheduleOption | null;
  setScheduleType: (schedule: ScheduleOption | null) => void;
  hasCompletedOnboarding: boolean;
  setHasCompletedOnboarding: (completed: boolean) => void;
  /**
   * Per-feature announcement flags.
   * - `undefined` (missing): not yet shown → display the feature announcement banner
   * - `false`: shown but dismissed (or seen during wizard without enabling)
   * - `true`: seen and feature is enabled / connected
   */
  accountSyncAnnouncementSeen: boolean | undefined;
  setAccountSyncAnnouncementSeen: (value: boolean) => void;
  ganttAnnouncementSeen: boolean | undefined;
  setGanttAnnouncementSeen: (value: boolean) => void;
  crossBorderAnnouncementSeen: boolean | undefined;
  setCrossBorderAnnouncementSeen: (value: boolean) => void;
  // Atomic update for onboarding completion with team selection
  completeOnboardingWithTeam: (team: number | null) => void;
  // Atomic update for onboarding completion with schedule selection
  completeOnboardingWithSchedule: (
    scheduleType: ScheduleOption | null,
    team: number | null,
    preferences?: {
      enableTimeOff?: boolean;
      enableTimeTracking?: boolean;
      enableGantt?: boolean;
      enableCrossBorderTracking?: boolean;
      homeCountry?: CountryCode | null;
      officeCountry?: CountryCode | null;
      accountConnected?: boolean;
    },
  ) => void;
}

export const defaultSettings: UserSettings = {
  timeFormat: "24h",
  theme: "auto",
  notifications: "off",
  enableTimeOff: false,
  enableTimeTracking: false,
  enableGantt: false,
  enableCrossBorderTracking: false,
  enableUnifiedCalendar: false,
  homeCountry: null,
  officeCountry: null,
  hdayUsername: null,
};

export const defaultLastUsed: LastUsed = {
  activeTab: "calendar",
  scheduleView: "schedule",
  otherSchedule: null,
  timeOffView: "table",
  timeTrackingView: "daily",
  otherTeam: null,
  ganttViewMode: "Day",
  ganttView: "chart",
};

const validTabKeys = new Set<TabKey>([
  "calendar",
  "unified-calendar",
  "schedule",
  "timeoff",
  "timetracking",
  "gantt",
]);
const validScheduleViewKeys = new Set<ScheduleViewKey>(["schedule", "transfer"]);
const validTimeOffViewKeys = new Set<TimeOffViewKey>(["table", "stats", "team"]);
const validTimeTrackingViewKeys = new Set<TimeTrackingViewKey>(["daily", "weekly"]);
const validGanttViewModes = new Set<GanttViewMode>(["Day", "Week", "Month", "Year"]);
const validGanttViewKeys = new Set<GanttViewKey>(["chart", "table"]);

interface WorktimeUserState {
  hasCompletedOnboarding: boolean;
  /**
   * Per-feature announcement flags.
   * - `undefined` (missing): not yet shown → display the feature announcement banner
   * - `false`: shown but dismissed (or seen during wizard without enabling)
   * - `true`: seen and feature is enabled / connected
   */
  accountSyncAnnouncementSeen?: boolean;
  ganttAnnouncementSeen?: boolean;
  crossBorderAnnouncementSeen?: boolean;
  myTeam: number | null; // The user's team from onboarding
  scheduleType: ScheduleOption | null;
  settings: UserSettings;
  lastUsed: LastUsed;
}

type RawState = Record<string, unknown>;
type Validator<T> = (value: unknown) => T;

const defaultUserState: WorktimeUserState = {
  hasCompletedOnboarding: false,
  myTeam: null,
  scheduleType: null,
  settings: defaultSettings,
  lastUsed: defaultLastUsed,
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

interface SettingsProviderProps {
  children: ReactNode;
}

const shallowEqualObject = <T extends object>(a: T, b: T): boolean => {
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  const bKeys = Object.keys(bRecord);
  return (
    aKeys.length === bKeys.length &&
    aKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(bRecord, key) && Object.is(aRecord[key], bRecord[key]),
    )
  );
};

function useStableShallowObject<T extends object>(value: T): T {
  const ref = useRef(value);
  if (!shallowEqualObject(ref.current, value)) {
    ref.current = value;
  }
  return ref.current;
}

const isObjectRecord = (value: unknown): value is RawState =>
  typeof value === "object" && value !== null;

const optionalBoolean = (value: unknown): boolean | undefined =>
  value === true ? true : value === false ? false : undefined;

const booleanWithDefault =
  (fallback: boolean): Validator<boolean> =>
  (value) =>
    typeof value === "boolean" ? value : fallback;

const enumWithDefault =
  <T extends string>(validValues: ReadonlySet<T>, fallback: T): Validator<T> =>
  (value) =>
    typeof value === "string" && validValues.has(value as T) ? (value as T) : fallback;

const countryWithDefault =
  (fallback: CountryCode | null): Validator<CountryCode | null> =>
  (value) =>
    isValidCountryCode(value) ? value : fallback;

const nullableTrimmedStringWithDefault =
  (fallback: string | null): Validator<string | null> =>
  (value) => {
    if (value === null) return null;
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    return trimmed === "" ? fallback : trimmed;
  };

const nullableScheduleOptionWithDefault =
  (validValues: ReadonlySet<string>, fallback: ScheduleOption | null): Validator<ScheduleOption | null> =>
  (value) => {
    if (value === null) {
      return null;
    }
    return typeof value === "string" && validValues.has(value) ? (value as ScheduleOption) : fallback;
  };

const nullableFiniteNumberWithDefault =
  (fallback: number | null): Validator<number | null> =>
  (value) => {
    if (value === null) {
      return null;
    }
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  };

const normalizeUserState = (state: unknown): WorktimeUserState => {
  if (!isObjectRecord(state)) {
    return defaultUserState;
  }

  const s = state;

  const settings = isObjectRecord(s.settings) ? s.settings : {};
  const scheduleOptionValues = new Set(SCHEDULE_OPTIONS.map((option) => option.value));

  const settingsValidators = {
    timeFormat: enumWithDefault(new Set<TimeFormat>(["12h", "24h"]), defaultSettings.timeFormat),
    theme: enumWithDefault(new Set<Theme>(["light", "dark", "auto"]), defaultSettings.theme),
    notifications: enumWithDefault(
      new Set<NotificationSetting>(["on", "off"]),
      defaultSettings.notifications,
    ),
    enableTimeOff: booleanWithDefault(defaultSettings.enableTimeOff),
    enableTimeTracking: booleanWithDefault(defaultSettings.enableTimeTracking),
    enableGantt: booleanWithDefault(defaultSettings.enableGantt),
    enableCrossBorderTracking: booleanWithDefault(defaultSettings.enableCrossBorderTracking),
    enableUnifiedCalendar: booleanWithDefault(defaultSettings.enableUnifiedCalendar),
    homeCountry: countryWithDefault(defaultSettings.homeCountry),
    officeCountry: countryWithDefault(defaultSettings.officeCountry),
    hdayUsername: nullableTrimmedStringWithDefault(defaultSettings.hdayUsername),
  } satisfies { [K in keyof UserSettings]: Validator<UserSettings[K]> };

  const normalizedSettings = Object.fromEntries(
    Object.entries(settingsValidators).map(([key, validator]) => [key, validator(settings[key])]),
  ) as unknown as UserSettings;

  // --- Validate lastUsed ---
  const rawLastUsed = isObjectRecord(s.lastUsed) ? s.lastUsed : {};

  const isTabEnabled = (tab: TabKey) => {
    if (tab === "timeoff") {
      return normalizedSettings.enableTimeOff;
    }
    if (tab === "timetracking") {
      return normalizedSettings.enableTimeTracking;
    }
    if (tab === "gantt") {
      return normalizedSettings.enableGantt;
    }
    if (tab === "unified-calendar") {
      return normalizedSettings.enableUnifiedCalendar;
    }
    return true;
  };

  const activeTabValidator: Validator<TabKey> = (value) =>
    typeof value === "string" && validTabKeys.has(value as TabKey) && isTabEnabled(value as TabKey)
      ? (value as TabKey)
      : defaultLastUsed.activeTab;

  const lastUsedValidators = {
    activeTab: activeTabValidator,
    scheduleView: enumWithDefault(validScheduleViewKeys, defaultLastUsed.scheduleView),
    otherSchedule: nullableScheduleOptionWithDefault(
      scheduleOptionValues,
      defaultLastUsed.otherSchedule,
    ),
    timeOffView: enumWithDefault(validTimeOffViewKeys, defaultLastUsed.timeOffView),
    timeTrackingView: enumWithDefault(
      validTimeTrackingViewKeys,
      defaultLastUsed.timeTrackingView,
    ),
    otherTeam: nullableFiniteNumberWithDefault(defaultLastUsed.otherTeam),
    ganttViewMode: enumWithDefault(validGanttViewModes, defaultLastUsed.ganttViewMode),
    ganttView: enumWithDefault(validGanttViewKeys, defaultLastUsed.ganttView),
  } satisfies { [K in keyof LastUsed]: Validator<LastUsed[K]> };

  const normalizedLastUsed = Object.fromEntries(
    Object.entries(lastUsedValidators).map(([key, validator]) => [key, validator(rawLastUsed[key])]),
  ) as unknown as LastUsed;

  // --- Validate scheduleType ---
  const scheduleType = (() => {
    const rawValue = s.scheduleType;
    if (rawValue === undefined) {
      return defaultUserState.scheduleType;
    }
    if (rawValue === null) {
      return null;
    }
    if (typeof rawValue === "string" && scheduleOptionValues.has(rawValue as ScheduleOption)) {
      return rawValue as ScheduleOption;
    }
    logger.warn(
      `Invalid schedule option "${rawValue}" found in localStorage. Falling back to default.`,
    );
    return defaultUserState.scheduleType;
  })();

  return {
    hasCompletedOnboarding:
      typeof s.hasCompletedOnboarding === "boolean"
        ? s.hasCompletedOnboarding
        : defaultUserState.hasCompletedOnboarding,
    // Per-feature announcement flags: undefined = not yet shown, false = seen/dismissed, true = seen and enabled
    accountSyncAnnouncementSeen: optionalBoolean(s.accountSyncAnnouncementSeen),
    ganttAnnouncementSeen: optionalBoolean(s.ganttAnnouncementSeen),
    crossBorderAnnouncementSeen: optionalBoolean(s.crossBorderAnnouncementSeen),
    myTeam:
      s.myTeam === undefined
        ? defaultUserState.myTeam
        : typeof s.myTeam === "number" || s.myTeam === null
          ? s.myTeam
          : defaultUserState.myTeam,
    scheduleType,
    settings: normalizedSettings,
    lastUsed: normalizedLastUsed,
  };
};

/**
 * Settings provider that manages the current unified user state in localStorage.
 *
 * Provides app-wide settings, onboarding state, and last-used UI preferences.
 */
export function SettingsProvider({ children }: SettingsProviderProps) {
  // Unified user state in a single localStorage key.
  // _setRawUserState is the raw setter; setUserState wraps it to inject _updatedAt
  // so that buildLocalPreferencesPayload in syncClient.ts can use the actual
  // modification time rather than always defaulting to "now".
  const [rawUserState, _setRawUserState] = useLocalStorage<WorktimeUserState>(
    USER_STATE_STORAGE_KEY,
    defaultUserState,
  );

  const setUserState = useCallback(
    (updater: WorktimeUserState | ((prev: WorktimeUserState) => WorktimeUserState)) => {
      _setRawUserState((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        return { ...next, _updatedAt: new Date().toISOString() };
      });
    },
    [_setRawUserState],
  );

  // `lastUsed` (active tab, last-viewed sub-view per tab) and a handful of
  // UserSettings fields (theme, notification lead time/quiet hours — see
  // DEVICE_LOCAL_SETTING_KEYS) are per-device state, not real cross-device
  // preferences — they're deliberately excluded from what syncs (see
  // buildLocalPreferencesPayload/applyPreferencesPull in syncClient.ts).
  // Routing their updates through this setter instead of setUserState keeps
  // it that way: bumping the shared _updatedAt for a purely local change
  // (a tab switch, a theme toggle) would make sync's last-write-wins
  // comparison pick this device's copy for that reason alone, discarding a
  // genuinely newer settings change synced from elsewhere.
  const setDeviceLocalState = useCallback(
    (updater: WorktimeUserState | ((prev: WorktimeUserState) => WorktimeUserState)) => {
      _setRawUserState((prev) => (typeof updater === "function" ? updater(prev) : updater));
    },
    [_setRawUserState],
  );

  const userState: WorktimeUserState = normalizeUserState(rawUserState);
  const stableSettings = useStableShallowObject(userState.settings);
  const stableLastUsed = useStableShallowObject(userState.lastUsed);

  const settingUpdaters = useMemo(() => {
    const deviceLocalSettingKeys: ReadonlySet<string> = new Set(DEVICE_LOCAL_SETTING_KEYS);

    const updateSetting = <K extends keyof UserSettings>(key: K) => {
      const setter = deviceLocalSettingKeys.has(key) ? setDeviceLocalState : setUserState;
      return (value: UserSettings[K]) => {
        setter((prev) => {
          // `prev` is the raw localStorage value, which can be null or
          // corrupted at runtime despite its static type; guard before spreading.
          const base = isObjectRecord(prev) ? prev : defaultUserState;
          const prevSettings = isObjectRecord(base.settings) ? base.settings : defaultSettings;
          return {
            ...base,
            settings: { ...prevSettings, [key]: value },
          };
        });
      };
    };

    return {
      updateTimeFormat: updateSetting("timeFormat"),
      updateTheme: updateSetting("theme"),
      updateNotifications: updateSetting("notifications"),
      updateTimeOffEnabled: updateSetting("enableTimeOff"),
      updateTimeTrackingEnabled: updateSetting("enableTimeTracking"),
      updateGanttEnabled: updateSetting("enableGantt"),
      updateCrossBorderTrackingEnabled: updateSetting("enableCrossBorderTracking"),
      updateUnifiedCalendarEnabled: updateSetting("enableUnifiedCalendar"),
      updateHomeCountry: updateSetting("homeCountry"),
      updateOfficeCountry: updateSetting("officeCountry"),
      updateHdayUsername: updateSetting("hdayUsername"),
    };
  }, [setUserState, setDeviceLocalState]);

  const lastUsedUpdaters = useMemo(() => {
    const updateLastUsed = <K extends keyof LastUsed>(key: K) => {
      return (value: LastUsed[K]) => {
        setDeviceLocalState((prev) => {
          // `prev` is the raw localStorage value, which can be null or
          // corrupted at runtime despite its static type; guard before spreading.
          const base = isObjectRecord(prev) ? prev : defaultUserState;
          const prevLastUsed = isObjectRecord(base.lastUsed) ? base.lastUsed : defaultLastUsed;
          return {
            ...base,
            lastUsed: { ...prevLastUsed, [key]: value },
          };
        });
      };
    };

    return {
      updateLastActiveTab: updateLastUsed("activeTab"),
      updateLastScheduleView: updateLastUsed("scheduleView"),
      updateLastTimeOffView: updateLastUsed("timeOffView"),
      updateLastTimeTrackingView: updateLastUsed("timeTrackingView"),
      updateLastOtherSchedule: updateLastUsed("otherSchedule"),
      updateLastOtherTeam: updateLastUsed("otherTeam"),
      updateLastGanttViewMode: updateLastUsed("ganttViewMode"),
      updateLastGanttView: updateLastUsed("ganttView"),
    };
  }, [setDeviceLocalState]);

  const {
    updateTimeFormat,
    updateTheme,
    updateNotifications,
    updateTimeOffEnabled,
    updateTimeTrackingEnabled,
    updateGanttEnabled,
    updateCrossBorderTrackingEnabled,
    updateUnifiedCalendarEnabled,
    updateHomeCountry,
    updateOfficeCountry,
    updateHdayUsername,
  } = settingUpdaters;

  const {
    updateLastActiveTab,
    updateLastScheduleView,
    updateLastTimeOffView,
    updateLastTimeTrackingView,
    updateLastOtherSchedule,
    updateLastOtherTeam,
    updateLastGanttViewMode,
    updateLastGanttView,
  } = lastUsedUpdaters;

  const resetSettings = useCallback(() => {
    setUserState(defaultUserState);
  }, [setUserState]);

  const setMyTeam = useCallback(
    (team: number | null) => {
      setUserState((prev) => ({
        ...prev,
        myTeam: team,
      }));
    },
    [setUserState],
  );

  const setScheduleType = useCallback(
    (schedule: ScheduleOption | null) => {
      setUserState((prev) => ({
        ...prev,
        scheduleType: schedule,
      }));
    },
    [setUserState],
  );

  const setHasCompletedOnboarding = useCallback(
    (completed: boolean) => {
      setUserState((prev) => ({
        ...prev,
        hasCompletedOnboarding: completed,
      }));
    },
    [setUserState],
  );

  const completeOnboardingWithTeam = useCallback(
    (team: number | null) => {
      setUserState((prev) => ({
        ...prev,
        hasCompletedOnboarding: true,
        myTeam: team,
      }));
    },
    [setUserState],
  );

  const completeOnboardingWithSchedule = useCallback(
    (
      scheduleType: ScheduleOption | null,
      team: number | null,
      preferences?: {
        enableTimeOff?: boolean;
        enableTimeTracking?: boolean;
        enableGantt?: boolean;
        enableCrossBorderTracking?: boolean;
        homeCountry?: CountryCode | null;
        officeCountry?: CountryCode | null;
        accountConnected?: boolean;
      },
    ) => {
      setUserState((prev) => ({
        ...prev,
        hasCompletedOnboarding: true,
        // When accountConnected is explicitly set in the wizard, record the result.
        // undefined (flag not passed) leaves the existing value untouched so the
        // feature-intro banner can still surface on the next visit.
        accountSyncAnnouncementSeen:
          preferences?.accountConnected !== undefined
            ? preferences.accountConnected
            : prev.accountSyncAnnouncementSeen,
        // Mark Gantt and Cross-Border based on the user's wizard choices:
        // true = saw + enabled, false = saw + declined. If the wizard step was
        // skipped entirely (preference is undefined), preserve the existing value
        // so the feature-intro banner can still surface later.
        ganttAnnouncementSeen:
          preferences?.enableGantt !== undefined
            ? preferences.enableGantt
            : prev.ganttAnnouncementSeen,
        crossBorderAnnouncementSeen:
          preferences?.enableCrossBorderTracking !== undefined
            ? preferences.enableCrossBorderTracking
            : prev.crossBorderAnnouncementSeen,
        scheduleType,
        myTeam: team,
        settings: {
          ...prev.settings,
          enableTimeOff: preferences?.enableTimeOff ?? prev.settings.enableTimeOff,
          enableTimeTracking: preferences?.enableTimeTracking ?? prev.settings.enableTimeTracking,
          enableGantt: preferences?.enableGantt ?? prev.settings.enableGantt,
          enableCrossBorderTracking:
            preferences?.enableCrossBorderTracking ?? prev.settings.enableCrossBorderTracking,
          homeCountry: preferences?.homeCountry ?? prev.settings.homeCountry,
          officeCountry: preferences?.officeCountry ?? prev.settings.officeCountry,
        },
      }));
    },
    [setUserState],
  );

  const setAccountSyncAnnouncementSeen = useCallback(
    (value: boolean) => {
      setUserState((prev) => ({ ...prev, accountSyncAnnouncementSeen: value }));
    },
    [setUserState],
  );

  const setGanttAnnouncementSeen = useCallback(
    (value: boolean) => {
      setUserState((prev) => ({ ...prev, ganttAnnouncementSeen: value }));
    },
    [setUserState],
  );

  const setCrossBorderAnnouncementSeen = useCallback(
    (value: boolean) => {
      setUserState((prev) => ({ ...prev, crossBorderAnnouncementSeen: value }));
    },
    [setUserState],
  );

  const contextValue: SettingsContextType = useMemo(
    () => ({
      settings: stableSettings,
      updateTimeFormat,
      updateTheme,
      updateNotifications,
      updateTimeOffEnabled,
      updateTimeTrackingEnabled,
      updateGanttEnabled,
      updateCrossBorderTrackingEnabled,
      updateUnifiedCalendarEnabled,
      updateHomeCountry,
      updateOfficeCountry,
      updateHdayUsername,
      resetSettings,
      myTeam: userState.myTeam,
      setMyTeam,
      scheduleType: userState.scheduleType,
      setScheduleType,
      hasCompletedOnboarding: userState.hasCompletedOnboarding,
      setHasCompletedOnboarding,
      accountSyncAnnouncementSeen: userState.accountSyncAnnouncementSeen,
      setAccountSyncAnnouncementSeen,
      ganttAnnouncementSeen: userState.ganttAnnouncementSeen,
      setGanttAnnouncementSeen,
      crossBorderAnnouncementSeen: userState.crossBorderAnnouncementSeen,
      setCrossBorderAnnouncementSeen,
      completeOnboardingWithTeam,
      completeOnboardingWithSchedule,
    }),
    [
      stableSettings,
      userState.myTeam,
      userState.scheduleType,
      userState.hasCompletedOnboarding,
      userState.accountSyncAnnouncementSeen,
      userState.ganttAnnouncementSeen,
      userState.crossBorderAnnouncementSeen,
      updateTimeFormat,
      updateTheme,
      updateNotifications,
      updateTimeOffEnabled,
      updateTimeTrackingEnabled,
      updateGanttEnabled,
      updateCrossBorderTrackingEnabled,
      updateUnifiedCalendarEnabled,
      updateHomeCountry,
      updateOfficeCountry,
      updateHdayUsername,
      resetSettings,
      setMyTeam,
      setScheduleType,
      setHasCompletedOnboarding,
      setAccountSyncAnnouncementSeen,
      setGanttAnnouncementSeen,
      setCrossBorderAnnouncementSeen,
      completeOnboardingWithTeam,
      completeOnboardingWithSchedule,
    ],
  );

  const lastUsedContextValue: LastUsedContextType = useMemo(
    () => ({
      lastUsed: stableLastUsed,
      updateLastActiveTab,
      updateLastScheduleView,
      updateLastTimeOffView,
      updateLastTimeTrackingView,
      updateLastOtherSchedule,
      updateLastOtherTeam,
      updateLastGanttViewMode,
      updateLastGanttView,
    }),
    [
      stableLastUsed,
      updateLastActiveTab,
      updateLastScheduleView,
      updateLastTimeOffView,
      updateLastTimeTrackingView,
      updateLastOtherSchedule,
      updateLastOtherTeam,
      updateLastGanttViewMode,
      updateLastGanttView,
    ],
  );

  return (
    <SettingsContext.Provider value={contextValue}>
      <LastUsedProvider value={lastUsedContextValue}>{children}</LastUsedProvider>
    </SettingsContext.Provider>
  );
}

/**
 * Accesses the settings context.
 *
 * @returns The current settings context value.
 * @throws {Error} If the hook is used outside a SettingsProvider.
 */
export function useSettings(): SettingsContextType {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
