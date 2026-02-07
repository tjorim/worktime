import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";
import { SCHEDULE_OPTIONS, type ScheduleOption } from "../data/rosters";
import { useLocalStorage } from "../hooks/useLocalStorage";
import type { VacationAllowanceSettings } from "../utils/vacationCalculations";
import { sanitizeVacationAllowance } from "../utils/vacationCalculations";

export type TimeFormat = "12h" | "24h";
export type Theme = "light" | "dark" | "auto";
export type NotificationSetting = "on" | "off";
export type TabKey = "calendar" | "schedule" | "timeoff" | "timetracking";
export type ScheduleViewKey = "today" | "week" | "transfer";
export type TimeOffViewKey = "table" | "stats" | "raw";
export type TimeTrackingViewKey = "daily" | "weekly";

export interface LastUsed {
  activeTab: TabKey;
  scheduleView: ScheduleViewKey;
  otherSchedule: ScheduleOption | null;
  timeOffView: TimeOffViewKey;
  timeTrackingView: TimeTrackingViewKey;
  otherTeam: number | null;
}

interface UserSettings {
  timeFormat: TimeFormat;
  theme: Theme;
  notifications: NotificationSetting;
  vacationAllowance: VacationAllowanceSettings;
  enableTimeOff: boolean;
  enableTimeTracking: boolean;
  timeTrackingWeeklyTargetHours: number;
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
  updateTimeTrackingWeeklyTargetHours: (hours: number) => void;
  updateLastActiveTab: (tab: TabKey) => void;
  updateLastScheduleView: (view: ScheduleViewKey) => void;
  updateLastTimeOffView: (view: TimeOffViewKey) => void;
  updateLastTimeTrackingView: (view: TimeTrackingViewKey) => void;
  updateLastOtherSchedule: (schedule: ScheduleOption | null) => void;
  updateLastOtherTeam: (team: number | null) => void;
  resetSettings: () => void;
  // Unified user state additions:
  myTeam: number | null; // The user's team from onboarding
  setMyTeam: (team: number | null) => void;
  scheduleType: ScheduleOption | null;
  setScheduleType: (schedule: ScheduleOption | null) => void;
  hasCompletedOnboarding: boolean;
  setHasCompletedOnboarding: (completed: boolean) => void;
  // Atomic update for onboarding completion with team selection
  completeOnboardingWithTeam: (team: number | null) => void;
  // Atomic update for onboarding completion with optional vacation allowance
  completeOnboardingWithVacation: (
    team: number | null,
    vacationAllowance?: Partial<VacationAllowanceSettings>,
  ) => void;
  // Atomic update for onboarding completion with schedule selection
  completeOnboardingWithSchedule: (
    scheduleType: ScheduleOption | null,
    team: number | null,
    preferences?: {
      vacationAllowance?: Partial<VacationAllowanceSettings>;
      enableTimeOff?: boolean;
      enableTimeTracking?: boolean;
      timeTrackingWeeklyTargetHours?: number;
    },
  ) => void;
}

export const defaultSettings: UserSettings = {
  timeFormat: "24h",
  theme: "auto",
  notifications: "off",
  vacationAllowance: {
    amount: 0,
    unit: "days",
    hoursPerDay: 8,
  },
  enableTimeOff: false,
  enableTimeTracking: false,
  timeTrackingWeeklyTargetHours: 40,
};

export const defaultLastUsed: LastUsed = {
  activeTab: "calendar",
  scheduleView: "today",
  otherSchedule: null,
  timeOffView: "table",
  timeTrackingView: "daily",
  otherTeam: null,
};

const validTabKeys = new Set<TabKey>(["calendar", "schedule", "timeoff", "timetracking"]);
const validScheduleViewKeys = new Set<ScheduleViewKey>(["today", "week", "transfer"]);
const validTimeOffViewKeys = new Set<TimeOffViewKey>(["table", "stats", "raw"]);
const validTimeTrackingViewKeys = new Set<TimeTrackingViewKey>(["daily", "weekly"]);

interface WorktimeUserState {
  version: number;
  hasCompletedOnboarding: boolean;
  myTeam: number | null; // The user's team from onboarding
  scheduleType: ScheduleOption | null;
  settings: UserSettings;
  lastUsed: LastUsed;
  rawStateBackup?: RawState;
  hasMigrationError?: boolean;
}

const CURRENT_VERSION = 1;

const defaultUserState: WorktimeUserState = {
  version: CURRENT_VERSION,
  hasCompletedOnboarding: false,
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

const migrations: Record<number, Migration> = {
  // → v1: Move last* view fields from settings into a dedicated lastUsed group.
  //        Rename scheduleOption → scheduleType.
  1: (state) => {
    const settings = (
      typeof state.settings === "object" && state.settings !== null ? state.settings : {}
    ) as RawState;

    const lastUsed = (
      typeof state.lastUsed === "object" && state.lastUsed !== null ? state.lastUsed : {}
    ) as RawState;

    // Migrate last* from settings → lastUsed (only if lastUsed doesn't already have them)
    const pick = (lastUsedKey: string, settingsKey: string) =>
      lastUsed[lastUsedKey] !== undefined ? lastUsed[lastUsedKey] : settings[settingsKey];

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
  const timeTrackingWeeklyTargetHours =
    typeof settings.timeTrackingWeeklyTargetHours === "number" &&
    Number.isFinite(settings.timeTrackingWeeklyTargetHours) &&
    settings.timeTrackingWeeklyTargetHours >= 0
      ? settings.timeTrackingWeeklyTargetHours
      : defaultSettings.timeTrackingWeeklyTargetHours;

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

  return {
    version: CURRENT_VERSION,
    hasCompletedOnboarding:
      typeof s.hasCompletedOnboarding === "boolean"
        ? s.hasCompletedOnboarding
        : defaultUserState.hasCompletedOnboarding,
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
      timeTrackingWeeklyTargetHours,
    },
    lastUsed: {
      activeTab,
      scheduleView,
      otherSchedule,
      timeOffView,
      timeTrackingView,
      otherTeam,
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
    "worktime_user_state",
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

  const updateTimeTrackingWeeklyTargetHours = useCallback(
    (hours: number) => {
      const nextHours =
        Number.isFinite(hours) && hours >= 0
          ? hours
          : defaultSettings.timeTrackingWeeklyTargetHours;
      setUserState((prev) => ({
        ...prev,
        settings: { ...prev.settings, timeTrackingWeeklyTargetHours: nextHours },
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

  const completeOnboardingWithVacation = useCallback(
    (team: number | null, vacationAllowance?: Partial<VacationAllowanceSettings>) => {
      setUserState((prev) => ({
        ...prev,
        hasCompletedOnboarding: true,
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
        timeTrackingWeeklyTargetHours?: number;
      },
    ) => {
      const nextWeeklyTargetHours =
        preferences?.timeTrackingWeeklyTargetHours !== undefined
          ? Number.isFinite(preferences.timeTrackingWeeklyTargetHours) &&
            preferences.timeTrackingWeeklyTargetHours >= 0
            ? preferences.timeTrackingWeeklyTargetHours
            : defaultSettings.timeTrackingWeeklyTargetHours
          : undefined;
      setUserState((prev) => ({
        ...prev,
        hasCompletedOnboarding: true,
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
          enableTimeOff:
            preferences?.enableTimeOff !== undefined
              ? preferences.enableTimeOff
              : prev.settings.enableTimeOff,
          enableTimeTracking:
            preferences?.enableTimeTracking !== undefined
              ? preferences.enableTimeTracking
              : prev.settings.enableTimeTracking,
          timeTrackingWeeklyTargetHours:
            nextWeeklyTargetHours ?? prev.settings.timeTrackingWeeklyTargetHours,
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
      updateTimeTrackingWeeklyTargetHours,
      updateLastActiveTab,
      updateLastScheduleView,
      updateLastTimeOffView,
      updateLastTimeTrackingView,
      updateLastOtherSchedule,
      updateLastOtherTeam,
      resetSettings,
      myTeam: userState.myTeam,
      setMyTeam,
      scheduleType: userState.scheduleType,
      setScheduleType,
      hasCompletedOnboarding: userState.hasCompletedOnboarding,
      setHasCompletedOnboarding,
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
      updateTimeTrackingWeeklyTargetHours,
      updateLastActiveTab,
      updateLastScheduleView,
      updateLastTimeOffView,
      updateLastTimeTrackingView,
      updateLastOtherSchedule,
      updateLastOtherTeam,
      resetSettings,
      setMyTeam,
      setScheduleType,
      setHasCompletedOnboarding,
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
