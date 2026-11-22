import { useDevicePreferences } from "@/hooks/useDevicePreferences";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { SCHEDULE_OPTIONS, type ScheduleOption } from "@/lib/schedule/rosters";
import { LastUsedProvider, type LastUsedContextType } from "@/app/providers/LastUsedContext";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import type { CountryCode } from "@/types/countries";
import { isValidCountryCode } from "@/types/countries";

import {
  ANONYMOUS_USER_STATE_OWNER,
  USER_STATE_OWNER_STORAGE_KEY,
  USER_STATE_STORAGE_KEY,
} from "@/config/storageKeys";
import type { AccountSettingsOutput } from "@/api-types";
import { isPreferenceRecord, toAccountPreferences } from "@/lib/storage/accountPreferences";
import {
  migrateLegacyDevicePreferences,
  splitLegacyPreferences,
  writePreferenceStorage,
} from "@/lib/storage/devicePreferenceStorage";
import type { DevicePreferences } from "@/hooks/useDevicePreferences";
import {
  getPreferenceOwner,
  preservePreferenceOwner,
  withPreferenceLock,
} from "@/lib/storage/preferenceStorage";
import { logger } from "@/lib/logger";
import { GANTT_VIEW_MODES } from "@/types/gantt";
import type {
  Theme,
  TabKey,
  ScheduleViewKey,
  TimeOffViewKey,
  TimeTrackingViewKey,
  GanttViewKey,
  LastUsed,
} from "@/types/deviceSettings";

export type TimeFormat = "12h" | "24h";
export type {
  Theme,
  TabKey,
  ScheduleViewKey,
  TimeOffViewKey,
  TimeTrackingViewKey,
  GanttViewKey,
  LastUsed,
} from "@/types/deviceSettings";

type AccountSettings = Omit<AccountSettingsOutput, "homeCountry" | "officeCountry"> & {
  homeCountry: CountryCode | null;
  officeCountry: CountryCode | null;
};

export interface UserSettings extends AccountSettings {
  theme: Theme;
  /** Whether reminders for upcoming planned time-tracking entries are enabled. */
  notifications: boolean;
}

export function normalizeAppearance(value: unknown): { highContrast: boolean } {
  const appearance = isObjectRecord(value) ? value : {};
  return { highContrast: appearance.highContrast === true };
}

interface SettingsContextType {
  appearance: { highContrast: boolean };
  updateHighContrast: (value: boolean) => void;
  settings: UserSettings;
  updateTimeFormat: (format: TimeFormat) => void;
  updateTheme: (theme: Theme) => void;
  updateNotifications: (enabled: boolean) => void;
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

const defaultAccountSettings: AccountSettings = {
  timeFormat: "24h",
  enableTimeOff: false,
  enableTimeTracking: false,
  enableGantt: false,
  enableCrossBorderTracking: false,
  enableUnifiedCalendar: false,
  homeCountry: null,
  officeCountry: null,
  hdayUsername: null,
};

export const defaultSettings: UserSettings = {
  ...defaultAccountSettings,
  theme: "auto",
  notifications: false,
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
const validGanttViewModes = new Set(GANTT_VIEW_MODES);
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
  settings: AccountSettings;
}

type Validator<T> = (value: unknown) => T;

const defaultUserState: WorktimeUserState = {
  hasCompletedOnboarding: false,
  myTeam: null,
  scheduleType: null,
  settings: defaultAccountSettings,
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
  const [stable, setStable] = useState(value);
  if (!shallowEqualObject(stable, value)) {
    setStable(value);
  }
  return stable;
}

const isObjectRecord = isPreferenceRecord;

const enumWithDefault =
  <T extends string>(validValues: ReadonlySet<T>, fallback: T): Validator<T> =>
  (value) =>
    typeof value === "string" && validValues.has(value as T) ? (value as T) : fallback;

const nullableScheduleOptionWithDefault =
  (
    validValues: ReadonlySet<string>,
    fallback: ScheduleOption | null,
  ): Validator<ScheduleOption | null> =>
  (value) => {
    if (value === null) {
      return null;
    }
    return typeof value === "string" && validValues.has(value)
      ? (value as ScheduleOption)
      : fallback;
  };

const nullableFiniteNumberWithDefault =
  (fallback: number | null): Validator<number | null> =>
  (value) => {
    if (value === null) {
      return null;
    }
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  };

function normalizeLastUsed(value: unknown, settings: AccountSettings): LastUsed {
  const rawLastUsed = isObjectRecord(value) ? value : {};
  const scheduleOptionValues = new Set(SCHEDULE_OPTIONS.map((option) => option.value));

  const isTabEnabled = (tab: TabKey) => {
    if (tab === "timeoff") {
      return settings.enableTimeOff;
    }
    if (tab === "timetracking") {
      return settings.enableTimeTracking;
    }
    if (tab === "gantt") {
      return settings.enableGantt;
    }
    if (tab === "unified-calendar") {
      return settings.enableUnifiedCalendar;
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
    timeTrackingView: enumWithDefault(validTimeTrackingViewKeys, defaultLastUsed.timeTrackingView),
    otherTeam: nullableFiniteNumberWithDefault(defaultLastUsed.otherTeam),
    ganttViewMode: enumWithDefault(validGanttViewModes, defaultLastUsed.ganttViewMode),
    ganttView: enumWithDefault(validGanttViewKeys, defaultLastUsed.ganttView),
  } satisfies { [K in keyof LastUsed]: Validator<LastUsed[K]> };

  return Object.fromEntries(
    Object.entries(lastUsedValidators).map(([key, validator]) => [
      key,
      validator(rawLastUsed[key]),
    ]),
  ) as unknown as LastUsed;
}

function normalizeUserState(state: unknown): WorktimeUserState {
  if (!isObjectRecord(state)) return defaultUserState;
  const account = toAccountPreferences(state);
  const settings = account.settings;
  if (state.scheduleType !== undefined && account.scheduleType === undefined) {
    logger.warn(
      `Invalid schedule option "${state.scheduleType}" found in localStorage. Falling back to default.`,
    );
  }
  return {
    hasCompletedOnboarding: account.hasCompletedOnboarding ?? false,
    accountSyncAnnouncementSeen: account.accountSyncAnnouncementSeen ?? undefined,
    ganttAnnouncementSeen: account.ganttAnnouncementSeen ?? undefined,
    crossBorderAnnouncementSeen: account.crossBorderAnnouncementSeen ?? undefined,
    myTeam: account.myTeam ?? null,
    scheduleType: account.scheduleType ?? null,
    settings: {
      timeFormat: settings?.timeFormat ?? defaultAccountSettings.timeFormat,
      enableTimeOff: settings?.enableTimeOff ?? false,
      enableTimeTracking: settings?.enableTimeTracking ?? false,
      enableGantt: settings?.enableGantt ?? false,
      enableCrossBorderTracking: settings?.enableCrossBorderTracking ?? false,
      enableUnifiedCalendar: settings?.enableUnifiedCalendar ?? false,
      homeCountry: isValidCountryCode(settings?.homeCountry) ? settings.homeCountry : null,
      officeCountry: isValidCountryCode(settings?.officeCountry) ? settings.officeCountry : null,
      hdayUsername: settings?.hdayUsername ?? null,
    },
  };
}

/** Mark only newly created state as anonymous; existing unowned state is legacy. */
function markNewAnonymousPreferences(): void {
  try {
    if (
      localStorage.getItem(USER_STATE_STORAGE_KEY) === null &&
      localStorage.getItem(USER_STATE_OWNER_STORAGE_KEY) === null
    ) {
      localStorage.setItem(USER_STATE_OWNER_STORAGE_KEY, ANONYMOUS_USER_STATE_OWNER);
    }
  } catch {
    // Missing ownership remains unknown, so sign-in will not auto-upload it.
  }
}

/**
 * Settings provider that manages the current unified user state in localStorage.
 *
 * Provides app-wide settings, onboarding state, and last-used UI preferences.
 */
export function SettingsProvider({ children }: SettingsProviderProps) {
  const { preferences, setPreferences } = useDevicePreferences();
  // Missing fields in older device preferences migrate to the normal appearance.
  const appearance = useStableShallowObject(normalizeAppearance(preferences?.appearance));
  const updateHighContrast = useCallback(
    (highContrast: boolean) => {
      setPreferences((previous) => ({
        ...previous,
        appearance: { ...normalizeAppearance(previous?.appearance), highContrast },
      }));
    },
    [setPreferences],
  );
  // Account state has its own localStorage key.
  // _setRawUserState is the raw setter; setUserState wraps it to inject _updatedAt
  // so that buildLocalPreferencesPayload in syncClient.ts can use the actual
  // modification time rather than always defaulting to "now".
  const [rawUserState, _setRawUserState] = useLocalStorage<WorktimeUserState>(
    USER_STATE_STORAGE_KEY,
    defaultUserState,
  );

  useEffect(() => {
    if (!isObjectRecord(rawUserState) || !splitLegacyPreferences(rawUserState).needsMigration)
      return;
    const migrate = () => {
      const raw = localStorage.getItem(USER_STATE_STORAGE_KEY);
      const stored: unknown = raw === null ? null : JSON.parse(raw);
      if (!isObjectRecord(stored)) return;
      const { account, needsMigration } = migrateLegacyDevicePreferences(stored);
      if (needsMigration) writePreferenceStorage(USER_STATE_STORAGE_KEY, account);
    };
    const handleError = (error: unknown) =>
      logger.error("Failed to migrate device preferences:", error);
    if (typeof navigator.locks?.request === "function") {
      void withPreferenceLock(migrate).catch(handleError);
    } else {
      try {
        migrate();
      } catch (error) {
        handleError(error);
      }
    }
  }, [rawUserState]);

  const unsavedEdits = useRef<{
    owner: string | null;
    updates: Array<(previous: WorktimeUserState) => WorktimeUserState>;
  } | null>(null);

  const setUserState = useCallback(
    (updater?: WorktimeUserState | ((prev: WorktimeUserState) => WorktimeUserState)) => {
      if (!updater && !unsavedEdits.current) return;
      const commit = () => {
        if (updater) markNewAnonymousPreferences();
        // Storage events can arrive after an interaction in an older tab. Read
        // inside the switch lock so cached data cannot undo another tab's switch.
        const raw = localStorage.getItem(USER_STATE_STORAGE_KEY);
        let previous: WorktimeUserState = defaultUserState;
        if (raw !== null) {
          try {
            previous = JSON.parse(raw) as WorktimeUserState;
          } catch {
            // Match the storage hook's fallback for malformed local state.
          }
        }
        const owner = getPreferenceOwner();
        const pending = unsavedEdits.current;
        // Replay only this tab's failed edits, over fresh persisted data. This
        // retains unrelated edits from another tab, without crossing owners.
        const updates = pending?.owner === owner ? [...pending.updates] : [];
        if (updater) {
          const timestamp = new Date().toISOString();
          updates.push((state) => {
            const next = typeof updater === "function" ? updater(state) : updater;
            const storedTimestamp = isObjectRecord(state) ? state._updatedAt : undefined;
            // A failed edit may replay over a newer save from another tab.
            const updatedAt =
              typeof storedTimestamp === "string" &&
              Date.parse(storedTimestamp) > Date.parse(timestamp)
                ? storedTimestamp
                : timestamp;
            return preservePreferenceOwner(state, { ...next, _updatedAt: updatedAt });
          });
        }
        if (updates.length === 0) {
          unsavedEdits.current = null;
          return;
        }
        if (isObjectRecord(previous)) {
          const { account, needsMigration } = migrateLegacyDevicePreferences(previous);
          if (needsMigration) previous = { ...defaultUserState, ...account };
        }
        for (const update of updates) previous = update(previous);
        _setRawUserState(previous);
        unsavedEdits.current =
          localStorage.getItem(USER_STATE_STORAGE_KEY) === JSON.stringify(previous)
            ? null
            : { owner, updates };
      };
      // Without Web Locks account switching is disabled, but local settings
      // must remain usable in browsers without account sync.
      if (typeof navigator.locks?.request === "function") {
        void withPreferenceLock(commit).catch((error: unknown) =>
          logger.error("Failed to save preferences:", error),
        );
      } else commit();
    },
    [_setRawUserState],
  );

  const userState = normalizeUserState(rawUserState);
  const legacyDevice = isObjectRecord(rawUserState)
    ? splitLegacyPreferences(rawUserState).device
    : {};
  const device = { ...legacyDevice, ...preferences };
  const stableSettings = useStableShallowObject<UserSettings>({
    ...userState.settings,
    theme:
      device.theme === "light" || device.theme === "dark" ? device.theme : defaultSettings.theme,
    notifications: device.notifications === true,
  });
  const stableLastUsed = useStableShallowObject(
    normalizeLastUsed(device.lastUsed, userState.settings),
  );

  const settingUpdaters = useMemo(() => {
    const updateSetting = <K extends keyof AccountSettings>(key: K) => {
      return (value: AccountSettings[K]) => {
        setUserState((prev) => {
          const base = isObjectRecord(prev) ? prev : defaultUserState;
          const prevSettings = isObjectRecord(base.settings)
            ? base.settings
            : defaultAccountSettings;
          return { ...base, settings: { ...prevSettings, [key]: value } };
        });
      };
    };
    const updateDevice = <K extends "theme" | "notifications">(
      key: K,
      value: DevicePreferences[K],
    ) => {
      setPreferences((previous) => ({ ...previous, [key]: value }));
      // A later interaction can retry a previously failed account write.
      setUserState();
    };

    return {
      updateTimeFormat: updateSetting("timeFormat"),
      updateTheme: (theme: Theme) => updateDevice("theme", theme),
      updateNotifications: (enabled: boolean) => updateDevice("notifications", enabled),
      updateTimeOffEnabled: updateSetting("enableTimeOff"),
      updateTimeTrackingEnabled: updateSetting("enableTimeTracking"),
      updateGanttEnabled: updateSetting("enableGantt"),
      updateCrossBorderTrackingEnabled: updateSetting("enableCrossBorderTracking"),
      updateUnifiedCalendarEnabled: updateSetting("enableUnifiedCalendar"),
      updateHomeCountry: updateSetting("homeCountry"),
      updateOfficeCountry: updateSetting("officeCountry"),
      updateHdayUsername: updateSetting("hdayUsername"),
    };
  }, [setUserState, setPreferences]);

  const lastUsedUpdaters = useMemo(() => {
    const updateLastUsed = <K extends keyof LastUsed>(key: K) => {
      return (value: LastUsed[K]) => {
        setPreferences((previous) => ({
          ...previous,
          lastUsed: { ...previous?.lastUsed, [key]: value },
        }));
        setUserState();
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
  }, [setPreferences, setUserState]);

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
    setPreferences((previous) => ({
      ...previous,
      appearance: normalizeAppearance(null),
      theme: defaultSettings.theme,
      notifications: defaultSettings.notifications,
      lastUsed: defaultLastUsed,
    }));
  }, [setUserState, setPreferences]);

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
      appearance,
      updateHighContrast,
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
      appearance,
      updateHighContrast,
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
