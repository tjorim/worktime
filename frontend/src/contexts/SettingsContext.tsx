import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";
import { SCHEDULE_OPTIONS, type ScheduleOption } from "../data/rosters";
import { useLocalStorage } from "../hooks/useLocalStorage";
import type { CountryCode } from "../types/countries";
import { isValidCountryCode } from "../types/countries";
import type { VacationAllowanceSettings } from "../utils/vacationCalculations";
import { sanitizeVacationAllowance } from "../utils/vacationCalculations";
import { USER_STATE_STORAGE_KEY } from "../constants/storageKeys";

export type TimeFormat = "12h" | "24h";
export type Theme = "light" | "dark" | "auto";
export type NotificationSetting = "on" | "off";
export type TabKey = "calendar" | "schedule" | "timeoff" | "timetracking" | "gantt";
export type ScheduleViewKey = "today" | "week" | "transfer";
export type TimeOffViewKey = "table" | "stats" | "team";
export type TimeTrackingViewKey = "daily" | "weekly" | "config";
export type GanttViewMode = "Day" | "Week" | "Month" | "Year";

export interface LastUsed {
  activeTab: TabKey;
  scheduleView: ScheduleViewKey;
  otherSchedule: ScheduleOption | null;
  timeOffView: TimeOffViewKey;
  timeTrackingView: TimeTrackingViewKey;
  otherTeam: number | null;
  ganttViewMode: GanttViewMode;
}

interface UserSettings {
  timeFormat: TimeFormat;
  theme: Theme;
  notifications: NotificationSetting;
  vacationAllowance: VacationAllowanceSettings;
  enableTimeOff: boolean;
  enableTimeTracking: boolean;
  enableGantt: boolean;
  enableCrossBorderTracking: boolean;
  homeCountry: CountryCode | null;
  officeCountry: CountryCode | null;
}

interface SettingsContextType {
  settings: UserSettings;
  lastUsed: LastUsed;
  updateTimeFormat: (format: TimeFormat) => void;
  updateTheme: (theme: Theme) => void;
  updateNotifications: (setting: NotificationSetting) => void;
  updateVacationAllowance: (allowance: Partial<VacationAllowanceSettings>) => void;
  updateTimeOffEnabled: (enabled: boolean) => void;
  updateTimeTrackingEnabled: (enabled: boolean) => void;
  updateGanttEnabled: (enabled: boolean) => void;
  updateCrossBorderTrackingEnabled: (enabled: boolean) => void;
  updateHomeCountry: (country: CountryCode | null) => void;
  updateOfficeCountry: (country: CountryCode | null) => void;
  updateLastActiveTab: (tab: TabKey) => void;
  updateLastScheduleView: (view: ScheduleViewKey) => void;
  updateLastTimeOffView: (view: TimeOffViewKey) => void;
  updateLastTimeTrackingView: (view: TimeTrackingViewKey) => void;
  updateLastOtherSchedule: (schedule: ScheduleOption | null) => void;
  updateLastOtherTeam: (team: number | null) => void;
  updateLastGanttViewMode: (mode: GanttViewMode) => void;
  resetSettings: () => void;
  // Unified user state additions:
  myTeam: number | null; // The user's team from onboarding
  setMyTeam: (team: number | null) => void;
  scheduleType: ScheduleOption | null;
  setScheduleType: (schedule: ScheduleOption | null) => void;
  hasCompletedOnboarding: boolean;
  setHasCompletedOnboarding: (completed: boolean) => void;
  lastOnboardedVersion: number;
  // Atomic update for onboarding completion with team selection
  completeOnboardingWithTeam: (team: number | null) => void;
  // Atomic update for onboarding completion with optional vacation allowance
  completeOnboardingWithVacation: (
    team: number | null,
    vacationAllowance?: Partial<VacationAllowanceSettings>,
  ) => void;
  // Mark feature-intro steps as seen and apply any changed feature settings
  completeFeatureIntro: (
    targetVersion: number,
    preferences?: {
      enableGantt?: boolean;
      enableCrossBorderTracking?: boolean;
      homeCountry?: CountryCode | null;
      officeCountry?: CountryCode | null;
    },
  ) => void;
  // Atomic update for onboarding completion with schedule selection
  completeOnboardingWithSchedule: (
    scheduleType: ScheduleOption | null,
    team: number | null,
    preferences?: {
      vacationAllowance?: Partial<VacationAllowanceSettings>;
      enableTimeOff?: boolean;
      enableTimeTracking?: boolean;
      enableGantt?: boolean;
      enableCrossBorderTracking?: boolean;
      homeCountry?: CountryCode | null;
      officeCountry?: CountryCode | null;
      lastOnboardedVersion?: number;
    },
  ) => void;
}

export const defaultSettings: UserSettings = {
  timeFormat: "24h",
  theme: "auto",
  notifications: "off",
  vacationAllowance: {
    yearlyAmounts: {},
    unit: "days",
    hoursPerDay: 8,
  },
  enableTimeOff: false,
  enableTimeTracking: false,
  enableGantt: false,
  enableCrossBorderTracking: false,
  homeCountry: null,
  officeCountry: null,
};

export const defaultLastUsed: LastUsed = {
  activeTab: "calendar",
  scheduleView: "today",
  otherSchedule: null,
  timeOffView: "table",
  timeTrackingView: "daily",
  otherTeam: null,
  ganttViewMode: "Day",
};

const validTabKeys = new Set<TabKey>(["calendar", "schedule", "timeoff", "timetracking", "gantt"]);
const validScheduleViewKeys = new Set<ScheduleViewKey>(["today", "week", "transfer"]);
const validTimeOffViewKeys = new Set<TimeOffViewKey>(["table", "stats", "team"]);
const validTimeTrackingViewKeys = new Set<TimeTrackingViewKey>(["daily", "weekly", "config"]);
const validGanttViewModes = new Set<GanttViewMode>(["Day", "Week", "Month", "Year"]);

interface WorktimeUserState {
  version: number;
  hasCompletedOnboarding: boolean;
  lastOnboardedVersion: number;
  myTeam: number | null; // The user's team from onboarding
  scheduleType: ScheduleOption | null;
  settings: UserSettings;
  lastUsed: LastUsed;
  rawStateBackup?: RawState;
  hasMigrationError?: boolean;
}

export const USER_STATE_VERSION = 5;
const CURRENT_VERSION = USER_STATE_VERSION;

const defaultUserState: WorktimeUserState = {
  version: CURRENT_VERSION,
  hasCompletedOnboarding: false,
  lastOnboardedVersion: 0,
  myTeam: null,
  scheduleType: null,
  settings: defaultSettings,
  lastUsed: defaultLastUsed,
};

// --- Versioned migrations ---
// Each key is the target version. The function transforms state from (key-1) → key.
// Migrations receive and return a raw Record so they can reshape freely.
type RawState = Record<string, unknown>;
type Migration = (state: RawState) => RawState;

interface RawSettings extends UserSettings {
  lastActiveTab?: TabKey;
  lastScheduleView?: ScheduleViewKey;
  lastTimeOffView?: TimeOffViewKey;
  lastTimeTrackingView?: TimeTrackingViewKey;
}

const migrations: Record<number, Migration> = {
  // → v1: Move last* view fields from settings into a dedicated lastUsed group.
  //        Rename scheduleOption → scheduleType.
  1: (state) => {
    const settings = (
      typeof state.settings === "object" && state.settings !== null ? state.settings : {}
    ) as RawSettings;

    const lastUsed = (
      typeof state.lastUsed === "object" && state.lastUsed !== null ? state.lastUsed : {}
    ) as RawState;

    // Migrate last* from settings → lastUsed (only if lastUsed doesn't already have them)
    const pick = (lastUsedKey: string, settingsKey: keyof RawSettings) =>
      (lastUsed as RawState)[lastUsedKey] !== undefined
        ? (lastUsed as RawState)[lastUsedKey]
        : settings[settingsKey];

    const migratedLastUsed: RawState = {
      activeTab: pick("activeTab", "lastActiveTab"),
      scheduleView: pick("scheduleView", "lastScheduleView"),
      timeOffView: pick("timeOffView", "lastTimeOffView"),
      timeTrackingView: pick("timeTrackingView", "lastTimeTrackingView"),
      otherSchedule: lastUsed.otherSchedule ?? null,
      otherTeam: lastUsed.otherTeam ?? null,
    };

    // Remove migrated fields from settings
    const {
      lastActiveTab: _lastActiveTab,
      lastScheduleView: _lastScheduleView,
      lastTimeOffView: _lastTimeOffView,
      lastTimeTrackingView: _lastTimeTrackingView,
      ...cleanSettings
    } = settings;

    // Rename scheduleOption → scheduleType
    const scheduleType =
      state.scheduleType !== undefined ? state.scheduleType : state.scheduleOption;

    return {
      ...state,
      scheduleType,
      settings: cleanSettings,
      lastUsed: migratedLastUsed,
    };
  },

  // → v2: Replace vacationAllowance.amount with yearlyAmounts[currentYear].
  2: (state) => {
    const settings = (
      typeof state.settings === "object" && state.settings !== null ? state.settings : {}
    ) as RawSettings;

    const va =
      settings.vacationAllowance && typeof settings.vacationAllowance === "object"
        ? (settings.vacationAllowance as unknown as RawState)
        : {};

    const oldAmount =
      typeof va.amount === "number" &&
      Number.isFinite(va.amount as number) &&
      (va.amount as number) >= 0
        ? (va.amount as number)
        : 0;

    const existingYearly =
      typeof va.yearlyAmounts === "object" && va.yearlyAmounts !== null
        ? (va.yearlyAmounts as Record<string, unknown>)
        : {};

    // Attempt to use a timestamp field (if present) to derive target year; otherwise fallback to best-effort currentYear.
    // This minimizes time-dependent behavior during migration.
    const yearFromTimestamp =
      typeof state.timestamp === "number" ? new Date(state.timestamp).getFullYear() : undefined;
    const yearFromLastUpdated =
      typeof state.lastUpdated === "string" ? new Date(state.lastUpdated).getFullYear() : undefined;
    const fallbackYear = new Date().getFullYear();

    const targetYear = String(
      yearFromTimestamp !== undefined && Number.isFinite(yearFromTimestamp) && yearFromTimestamp > 0
        ? yearFromTimestamp
        : yearFromLastUpdated !== undefined &&
            Number.isFinite(yearFromLastUpdated) &&
            yearFromLastUpdated > 0
          ? yearFromLastUpdated
          : fallbackYear,
    );

    const yearlyAmounts: Record<string, number> = {};
    for (const [key, val] of Object.entries(existingYearly)) {
      if (typeof val === "number" && Number.isFinite(val) && val >= 0) {
        yearlyAmounts[key] = val;
      } else if (val !== undefined) {
        console.warn(`Migration v2: skipped invalid yearlyAmounts entry "${key}":`, val);
      }
    }
    // Only seed from old amount if there's no entry for the target year yet
    if (oldAmount > 0 && !(targetYear in yearlyAmounts)) {
      yearlyAmounts[targetYear] = oldAmount;
    }

    const { amount: _amount, yearlyAmounts: _existingYearly, ...restVa } = va;

    return {
      ...state,
      settings: {
        ...settings,
        vacationAllowance: {
          ...restVa,
          yearlyAmounts,
        },
      },
    };
  },

  // → v3: Add homeCountry, officeCountry, and enableCrossBorderTracking to settings.
  // Note: normalizeUserState already applies defaults for any missing field, so this migration
  // is effectively a no-op for typical v2→v3 upgrades. It exists as an explicit audit trail of
  // the schema change and ensures the stored JSON immediately reflects the new shape after the
  // first load, rather than waiting for the next settings save to persist the defaults.
  3: (state) => {
    const settings = (
      typeof state.settings === "object" && state.settings !== null ? state.settings : {}
    ) as RawSettings;

    return {
      ...state,
      settings: {
        ...settings,
        homeCountry: settings.homeCountry ?? defaultSettings.homeCountry,
        officeCountry: settings.officeCountry ?? defaultSettings.officeCountry,
        enableCrossBorderTracking:
          settings.enableCrossBorderTracking ?? defaultSettings.enableCrossBorderTracking,
      },
    };
  },

  // → v4: Add enableGantt setting (no-op audit migration).
  4: (state) => {
    const settings = (
      typeof state.settings === "object" && state.settings !== null ? state.settings : {}
    ) as RawSettings;

    return {
      ...state,
      settings: {
        ...settings,
        enableGantt: settings.enableGantt ?? defaultSettings.enableGantt,
      },
    };
  },

  // → v5: Account & cloud sync feature introduction (no-op audit migration).
  5: (state) => state,
};

function handleMigrationError(state: RawState, version: number): RawState {
  console.warn(`Migration for version ${version} not found or failed. Attempting recovery.`);
  const rawStateBackup = state;
  const recovered = {
    myTeam: typeof rawStateBackup.myTeam === "number" ? rawStateBackup.myTeam : null,
    scheduleType:
      typeof rawStateBackup.scheduleType === "string"
        ? rawStateBackup.scheduleType
        : typeof rawStateBackup.scheduleOption === "string"
          ? rawStateBackup.scheduleOption
          : null,
    settings:
      typeof rawStateBackup.settings === "object" && rawStateBackup.settings !== null
        ? rawStateBackup.settings
        : undefined,
  };

  return {
    ...defaultUserState,
    ...recovered,
    rawStateBackup,
    hasMigrationError: true,
  };
}

function migrateState(state: RawState): RawState {
  let version = typeof state.version === "number" ? state.version : 0;
  while (version < CURRENT_VERSION) {
    const nextVersion = version + 1;
    const migrate = migrations[nextVersion];
    if (!migrate) {
      return handleMigrationError(state, nextVersion);
    }
    try {
      state = migrate(state);
    } catch (error) {
      console.error(`Migration ${nextVersion} failed. Attempting recovery.`, error);
      return handleMigrationError(state, nextVersion);
    }
    state.version = nextVersion;
    version = nextVersion;
  }
  return state;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

interface SettingsProviderProps {
  children: ReactNode;
}

const normalizeUserState = (state: unknown): WorktimeUserState => {
  if (typeof state !== "object" || state === null) {
    return defaultUserState;
  }

  // Run versioned migrations first to get data into the current shape
  const s = migrateState(state as RawState);

  const settings = (
    typeof s.settings === "object" && s.settings !== null ? s.settings : {}
  ) as RawState;
  const scheduleOptionValues = new Set(SCHEDULE_OPTIONS.map((option) => option.value));

  // --- Validate settings ---
  const timeFormat = ["12h", "24h"].includes(settings.timeFormat as string)
    ? (settings.timeFormat as TimeFormat)
    : defaultSettings.timeFormat;
  const theme = ["light", "dark", "auto"].includes(settings.theme as string)
    ? (settings.theme as Theme)
    : defaultSettings.theme;
  const notifications = ["on", "off"].includes(settings.notifications as string)
    ? (settings.notifications as NotificationSetting)
    : defaultSettings.notifications;

  const vacationAllowance = sanitizeVacationAllowance(
    settings.vacationAllowance as Partial<VacationAllowanceSettings> | undefined,
    defaultSettings.vacationAllowance,
  );
  const enableTimeOff =
    typeof settings.enableTimeOff === "boolean"
      ? settings.enableTimeOff
      : defaultSettings.enableTimeOff;
  const enableTimeTracking =
    typeof settings.enableTimeTracking === "boolean"
      ? settings.enableTimeTracking
      : defaultSettings.enableTimeTracking;
  const enableGantt =
    typeof settings.enableGantt === "boolean" ? settings.enableGantt : defaultSettings.enableGantt;
  const enableCrossBorderTracking =
    typeof settings.enableCrossBorderTracking === "boolean"
      ? settings.enableCrossBorderTracking
      : defaultSettings.enableCrossBorderTracking;

  const homeCountry = isValidCountryCode(settings.homeCountry)
    ? settings.homeCountry
    : defaultSettings.homeCountry;

  const officeCountry = isValidCountryCode(settings.officeCountry)
    ? settings.officeCountry
    : defaultSettings.officeCountry;

  // --- Validate lastUsed ---
  const lastUsed = (
    typeof s.lastUsed === "object" && s.lastUsed !== null ? s.lastUsed : {}
  ) as RawState;

  const isTabEnabled = (tab: TabKey) => {
    if (tab === "timeoff") {
      return enableTimeOff;
    }
    if (tab === "timetracking") {
      return enableTimeTracking;
    }
    if (tab === "gantt") {
      return enableGantt;
    }
    return true;
  };

  const activeTab =
    typeof lastUsed.activeTab === "string" &&
    validTabKeys.has(lastUsed.activeTab as TabKey) &&
    isTabEnabled(lastUsed.activeTab as TabKey)
      ? (lastUsed.activeTab as TabKey)
      : defaultLastUsed.activeTab;

  const scheduleView =
    typeof lastUsed.scheduleView === "string" &&
    validScheduleViewKeys.has(lastUsed.scheduleView as ScheduleViewKey)
      ? (lastUsed.scheduleView as ScheduleViewKey)
      : defaultLastUsed.scheduleView;

  const otherSchedule =
    lastUsed.otherSchedule === null
      ? null
      : typeof lastUsed.otherSchedule === "string" &&
          scheduleOptionValues.has(lastUsed.otherSchedule as ScheduleOption)
        ? (lastUsed.otherSchedule as ScheduleOption)
        : defaultLastUsed.otherSchedule;

  const timeOffView =
    typeof lastUsed.timeOffView === "string" &&
    validTimeOffViewKeys.has(lastUsed.timeOffView as TimeOffViewKey)
      ? (lastUsed.timeOffView as TimeOffViewKey)
      : defaultLastUsed.timeOffView;

  const timeTrackingView =
    typeof lastUsed.timeTrackingView === "string" &&
    validTimeTrackingViewKeys.has(lastUsed.timeTrackingView as TimeTrackingViewKey)
      ? (lastUsed.timeTrackingView as TimeTrackingViewKey)
      : defaultLastUsed.timeTrackingView;

  const otherTeam =
    lastUsed.otherTeam === null
      ? null
      : typeof lastUsed.otherTeam === "number" && Number.isFinite(lastUsed.otherTeam)
        ? lastUsed.otherTeam
        : defaultLastUsed.otherTeam;

  const ganttViewMode =
    typeof lastUsed.ganttViewMode === "string" &&
    validGanttViewModes.has(lastUsed.ganttViewMode as GanttViewMode)
      ? (lastUsed.ganttViewMode as GanttViewMode)
      : defaultLastUsed.ganttViewMode;

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
    console.warn(
      `Invalid schedule option "${rawValue}" found in localStorage. Falling back to default.`,
    );
    return defaultUserState.scheduleType;
  })();

  const lastOnboardedVersion =
    typeof s.lastOnboardedVersion === "number" &&
    Number.isInteger(s.lastOnboardedVersion) &&
    s.lastOnboardedVersion >= 0
      ? s.lastOnboardedVersion
      : 0;

  return {
    version: CURRENT_VERSION,
    hasCompletedOnboarding:
      typeof s.hasCompletedOnboarding === "boolean"
        ? s.hasCompletedOnboarding
        : defaultUserState.hasCompletedOnboarding,
    lastOnboardedVersion,
    myTeam:
      s.myTeam === undefined
        ? defaultUserState.myTeam
        : typeof s.myTeam === "number" || s.myTeam === null
          ? s.myTeam
          : defaultUserState.myTeam,
    scheduleType,
    settings: {
      timeFormat,
      theme,
      notifications,
      vacationAllowance,
      enableTimeOff,
      enableTimeTracking,
      enableGantt,
      enableCrossBorderTracking,
      homeCountry,
      officeCountry,
    },
    lastUsed: {
      activeTab,
      scheduleView,
      otherSchedule,
      timeOffView,
      timeTrackingView,
      otherTeam,
      ganttViewMode,
    },
    rawStateBackup:
      typeof s.rawStateBackup === "object" && s.rawStateBackup !== null
        ? (s.rawStateBackup as RawState)
        : undefined,
    hasMigrationError: s.hasMigrationError === true ? true : undefined,
  };
};

/**
 * Settings provider that manages user preferences using localStorage.
 *
 * Provides a context for managing app-wide settings including:
 * - Time format (12h/24h)
 * - Theme preference (light/dark/auto)
 * - Notification settings (on/off)
 * - Team selection and onboarding state
 *
 * All settings are persisted to localStorage for the internal user base.
 */
export function SettingsProvider({ children }: SettingsProviderProps) {
  // Unified user state in a single localStorage key
  const [rawUserState, setUserState] = useLocalStorage<WorktimeUserState>(
    USER_STATE_STORAGE_KEY,
    defaultUserState,
  );

  const userState: WorktimeUserState = normalizeUserState(rawUserState);

  const updateTimeFormat = useCallback(
    (format: TimeFormat) => {
      setUserState((prev) => ({
        ...prev,
        settings: { ...prev.settings, timeFormat: format },
      }));
    },
    [setUserState],
  );

  const updateTheme = useCallback(
    (theme: Theme) => {
      setUserState((prev) => ({
        ...prev,
        settings: { ...prev.settings, theme },
      }));
    },
    [setUserState],
  );

  const updateNotifications = useCallback(
    (notifications: NotificationSetting) => {
      setUserState((prev) => ({
        ...prev,
        settings: { ...prev.settings, notifications },
      }));
    },
    [setUserState],
  );

  const updateVacationAllowance = useCallback(
    (allowance: Partial<VacationAllowanceSettings>) => {
      setUserState((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          vacationAllowance: sanitizeVacationAllowance(allowance, prev.settings.vacationAllowance),
        },
      }));
    },
    [setUserState],
  );

  const updateTimeOffEnabled = useCallback(
    (enabled: boolean) => {
      setUserState((prev) => ({
        ...prev,
        settings: { ...prev.settings, enableTimeOff: enabled },
      }));
    },
    [setUserState],
  );

  const updateTimeTrackingEnabled = useCallback(
    (enabled: boolean) => {
      setUserState((prev) => ({
        ...prev,
        settings: { ...prev.settings, enableTimeTracking: enabled },
      }));
    },
    [setUserState],
  );

  const updateGanttEnabled = useCallback(
    (enabled: boolean) => {
      setUserState((prev) => ({
        ...prev,
        settings: { ...prev.settings, enableGantt: enabled },
      }));
    },
    [setUserState],
  );

  const updateHomeCountry = useCallback(
    (country: CountryCode | null) => {
      setUserState((prev) => ({
        ...prev,
        settings: { ...prev.settings, homeCountry: country },
      }));
    },
    [setUserState],
  );

  const updateOfficeCountry = useCallback(
    (country: CountryCode | null) => {
      setUserState((prev) => ({
        ...prev,
        settings: { ...prev.settings, officeCountry: country },
      }));
    },
    [setUserState],
  );

  const updateCrossBorderTrackingEnabled = useCallback(
    (enabled: boolean) => {
      setUserState((prev) => ({
        ...prev,
        settings: { ...prev.settings, enableCrossBorderTracking: enabled },
      }));
    },
    [setUserState],
  );

  const updateLastActiveTab = useCallback(
    (tab: TabKey) => {
      setUserState((prev) => ({
        ...prev,
        lastUsed: { ...prev.lastUsed, activeTab: tab },
      }));
    },
    [setUserState],
  );

  const updateLastScheduleView = useCallback(
    (view: ScheduleViewKey) => {
      setUserState((prev) => ({
        ...prev,
        lastUsed: { ...prev.lastUsed, scheduleView: view },
      }));
    },
    [setUserState],
  );

  const updateLastTimeOffView = useCallback(
    (view: TimeOffViewKey) => {
      setUserState((prev) => ({
        ...prev,
        lastUsed: { ...prev.lastUsed, timeOffView: view },
      }));
    },
    [setUserState],
  );

  const updateLastTimeTrackingView = useCallback(
    (view: TimeTrackingViewKey) => {
      setUserState((prev) => ({
        ...prev,
        lastUsed: { ...prev.lastUsed, timeTrackingView: view },
      }));
    },
    [setUserState],
  );

  const updateLastOtherSchedule = useCallback(
    (schedule: ScheduleOption | null) => {
      setUserState((prev) => ({
        ...prev,
        lastUsed: { ...prev.lastUsed, otherSchedule: schedule },
      }));
    },
    [setUserState],
  );

  const updateLastOtherTeam = useCallback(
    (team: number | null) => {
      setUserState((prev) => ({
        ...prev,
        lastUsed: { ...prev.lastUsed, otherTeam: team },
      }));
    },
    [setUserState],
  );

  const updateLastGanttViewMode = useCallback(
    (mode: GanttViewMode) => {
      setUserState((prev) => ({
        ...prev,
        lastUsed: { ...prev.lastUsed, ganttViewMode: mode },
      }));
    },
    [setUserState],
  );

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
        lastOnboardedVersion: CURRENT_VERSION,
        myTeam: team,
      }));
    },
    [setUserState],
  );

  const completeOnboardingWithVacation = useCallback(
    (team: number | null, vacationAllowance?: Partial<VacationAllowanceSettings>) => {
      setUserState((prev) => ({
        ...prev,
        hasCompletedOnboarding: true,
        lastOnboardedVersion: CURRENT_VERSION,
        myTeam: team,
        settings: {
          ...prev.settings,
          vacationAllowance: vacationAllowance
            ? sanitizeVacationAllowance(vacationAllowance, prev.settings.vacationAllowance)
            : prev.settings.vacationAllowance,
        },
      }));
    },
    [setUserState],
  );

  const completeOnboardingWithSchedule = useCallback(
    (
      scheduleType: ScheduleOption | null,
      team: number | null,
      preferences?: {
        vacationAllowance?: Partial<VacationAllowanceSettings>;
        enableTimeOff?: boolean;
        enableTimeTracking?: boolean;
        enableGantt?: boolean;
        enableCrossBorderTracking?: boolean;
        homeCountry?: CountryCode | null;
        officeCountry?: CountryCode | null;
        lastOnboardedVersion?: number;
      },
    ) => {
      setUserState((prev) => ({
        ...prev,
        hasCompletedOnboarding: true,
        lastOnboardedVersion: preferences?.lastOnboardedVersion ?? CURRENT_VERSION,
        scheduleType,
        myTeam: team,
        settings: {
          ...prev.settings,
          vacationAllowance: preferences?.vacationAllowance
            ? sanitizeVacationAllowance(
                preferences.vacationAllowance,
                prev.settings.vacationAllowance,
              )
            : prev.settings.vacationAllowance,
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

  const completeFeatureIntro = useCallback(
    (
      targetVersion: number,
      preferences?: {
        enableGantt?: boolean;
        enableCrossBorderTracking?: boolean;
        homeCountry?: CountryCode | null;
        officeCountry?: CountryCode | null;
      },
    ) => {
      setUserState((prev) => ({
        ...prev,
        lastOnboardedVersion: targetVersion,
        settings: {
          ...prev.settings,
          enableGantt: preferences?.enableGantt ?? prev.settings.enableGantt,
          enableCrossBorderTracking:
            preferences?.enableCrossBorderTracking ?? prev.settings.enableCrossBorderTracking,
          homeCountry:
            preferences?.homeCountry !== undefined
              ? preferences.homeCountry
              : prev.settings.homeCountry,
          officeCountry:
            preferences?.officeCountry !== undefined
              ? preferences.officeCountry
              : prev.settings.officeCountry,
        },
      }));
    },
    [setUserState],
  );

  const contextValue: SettingsContextType = useMemo(
    () => ({
      settings: userState.settings,
      lastUsed: userState.lastUsed,
      updateTimeFormat,
      updateTheme,
      updateNotifications,
      updateVacationAllowance,
      updateTimeOffEnabled,
      updateTimeTrackingEnabled,
      updateGanttEnabled,
      updateCrossBorderTrackingEnabled,
      updateHomeCountry,
      updateOfficeCountry,
      updateLastActiveTab,
      updateLastScheduleView,
      updateLastTimeOffView,
      updateLastTimeTrackingView,
      updateLastOtherSchedule,
      updateLastOtherTeam,
      updateLastGanttViewMode,
      resetSettings,
      myTeam: userState.myTeam,
      setMyTeam,
      scheduleType: userState.scheduleType,
      setScheduleType,
      hasCompletedOnboarding: userState.hasCompletedOnboarding,
      setHasCompletedOnboarding,
      lastOnboardedVersion: userState.lastOnboardedVersion,
      completeFeatureIntro,
      completeOnboardingWithTeam,
      completeOnboardingWithVacation,
      completeOnboardingWithSchedule,
    }),
    [
      userState,
      updateTimeFormat,
      updateTheme,
      updateNotifications,
      updateVacationAllowance,
      updateTimeOffEnabled,
      updateTimeTrackingEnabled,
      updateGanttEnabled,
      updateCrossBorderTrackingEnabled,
      updateHomeCountry,
      updateOfficeCountry,
      updateLastActiveTab,
      updateLastScheduleView,
      updateLastTimeOffView,
      updateLastTimeTrackingView,
      updateLastOtherSchedule,
      updateLastOtherTeam,
      updateLastGanttViewMode,
      resetSettings,
      setMyTeam,
      setScheduleType,
      setHasCompletedOnboarding,
      completeFeatureIntro,
      completeOnboardingWithTeam,
      completeOnboardingWithVacation,
      completeOnboardingWithSchedule,
    ],
  );

  return <SettingsContext.Provider value={contextValue}>{children}</SettingsContext.Provider>;
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
