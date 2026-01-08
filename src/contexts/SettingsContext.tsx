// Unified user state (implemented):
// - hasCompletedOnboarding: boolean
// - myTeam: number | null (the user's team from onboarding)
// - settings: {
//     timeFormat: '12h' | '24h',
//     theme: 'light' | 'dark' | 'auto',
//     notifications: 'on' | 'off'
//   }
// Future expansion:
// - language?: 'en' | 'nl'
// - darkMode?: boolean (if separate from theme)
// - Account sync methods
// - Export/import preferences
// Keep all user state in SettingsContext or unified user state.

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";
import { SCHEDULE_OPTIONS, type ScheduleOption } from "../data/rosters";
import { useLocalStorage } from "../hooks/useLocalStorage";
import type { VacationAllowanceSettings } from "../utils/vacationCalculations";
import { sanitizeVacationAllowance } from "../utils/vacationCalculations";

export type TimeFormat = "12h" | "24h";
export type Theme = "light" | "dark" | "auto";
export type NotificationSetting = "on" | "off";

interface UserSettings {
  timeFormat: TimeFormat;
  theme: Theme;
  notifications: NotificationSetting;
  vacationAllowance: VacationAllowanceSettings;
}

interface SettingsContextType {
  settings: UserSettings;
  updateTimeFormat: (format: TimeFormat) => void;
  updateTheme: (theme: Theme) => void;
  updateNotifications: (setting: NotificationSetting) => void;
  updateVacationAllowance: (allowance: Partial<VacationAllowanceSettings>) => void;
  resetSettings: () => void;
  // Unified user state additions:
  myTeam: number | null; // The user's team from onboarding
  setMyTeam: (team: number | null) => void;
  scheduleOption: ScheduleOption | null;
  setScheduleOption: (schedule: ScheduleOption | null) => void;
  hasCompletedOnboarding: boolean;
  setHasCompletedOnboarding: (completed: boolean) => void;
  // Atomic update for onboarding completion with team selection
  completeOnboardingWithTeam: (team: number | null) => void;
  // Atomic update for onboarding completion with optional vacation allowance
  completeOnboardingWithVacation: (
    team: number | null,
    vacationAllowance?: Partial<VacationAllowanceSettings>,
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
};

interface WorktimeUserState {
  hasCompletedOnboarding: boolean;
  myTeam: number | null; // The user's team from onboarding
  scheduleOption: ScheduleOption | null;
  settings: UserSettings;
}

const defaultUserState: WorktimeUserState = {
  hasCompletedOnboarding: false,
  myTeam: null,
  scheduleOption: null,
  settings: defaultSettings,
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

interface SettingsProviderProps {
  children: ReactNode;
}

const normalizeUserState = (state: unknown): WorktimeUserState => {
  if (typeof state !== "object" || state === null) {
    return defaultUserState;
  }

  const s = state as Record<string, unknown>;
  const settings = typeof s.settings === "object" && s.settings !== null ? s.settings : {};
  const settingsRecord = settings as Record<string, unknown>;
  const scheduleOptionValues = new Set(SCHEDULE_OPTIONS.map((option) => option.value));

  const timeFormat = ["12h", "24h"].includes(settingsRecord.timeFormat as string)
    ? (settingsRecord.timeFormat as TimeFormat)
    : defaultSettings.timeFormat;
  const theme = ["light", "dark", "auto"].includes(settingsRecord.theme as string)
    ? (settingsRecord.theme as Theme)
    : defaultSettings.theme;
  const notifications = ["on", "off"].includes(settingsRecord.notifications as string)
    ? (settingsRecord.notifications as NotificationSetting)
    : defaultSettings.notifications;

  const vacationAllowance = sanitizeVacationAllowance(
    settingsRecord.vacationAllowance as Partial<VacationAllowanceSettings> | undefined,
    defaultSettings.vacationAllowance,
  );

  return {
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
    scheduleOption:
      s.scheduleOption === undefined
        ? defaultUserState.scheduleOption
        : typeof s.scheduleOption === "string" && scheduleOptionValues.has(s.scheduleOption)
          ? (s.scheduleOption as ScheduleOption)
          : s.scheduleOption === null
            ? null
          : defaultUserState.scheduleOption,
    settings: {
      timeFormat,
      theme,
      notifications,
      vacationAllowance,
    },
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

  const setScheduleOption = useCallback(
    (schedule: ScheduleOption | null) => {
      setUserState((prev) => ({
        ...prev,
        scheduleOption: schedule,
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

  const contextValue: SettingsContextType = useMemo(
    () => ({
      settings: userState.settings,
      updateTimeFormat,
      updateTheme,
      updateNotifications,
      updateVacationAllowance,
      resetSettings,
      myTeam: userState.myTeam,
      setMyTeam,
      scheduleOption: userState.scheduleOption,
      setScheduleOption,
      hasCompletedOnboarding: userState.hasCompletedOnboarding,
      setHasCompletedOnboarding,
      completeOnboardingWithTeam,
      completeOnboardingWithVacation,
    }),
    [
      userState,
      updateTimeFormat,
      updateTheme,
      updateNotifications,
      updateVacationAllowance,
      resetSettings,
      setMyTeam,
      setScheduleOption,
      setHasCompletedOnboarding,
      completeOnboardingWithTeam,
      completeOnboardingWithVacation,
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
