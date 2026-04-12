import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";
import { SCHEDULE_OPTIONS, type ScheduleOption } from "@/data/rosters";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import type { CountryCode } from "@/types/countries";
import { isValidCountryCode } from "@/types/countries";
import type { VacationAllowanceSettings } from "@/utils/vacationCalculations";
import { sanitizeVacationAllowance } from "@/utils/vacationCalculations";
import { USER_STATE_STORAGE_KEY } from "@/constants/storageKeys";

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
  /** Max bridge days for long weekend highlighting (0 = disabled). */
  maxBridgeDays: number;
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
  updateMaxBridgeDays: (days: number) => void;
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
  maxBridgeDays: 0,
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

const normalizeUserState = (state: unknown): WorktimeUserState => {
  if (typeof state !== "object" || state === null) {
    return defaultUserState;
  }

  const s = state as RawState;

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

  const maxBridgeDays =
    typeof settings.maxBridgeDays === "number" &&
    Number.isInteger(settings.maxBridgeDays) &&
    settings.maxBridgeDays >= 0 &&
    settings.maxBridgeDays <= 100
      ? settings.maxBridgeDays
      : defaultSettings.maxBridgeDays;

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

  const toOptionalBool = (v: unknown): boolean | undefined =>
    v === true ? true : v === false ? false : undefined;

  return {
    hasCompletedOnboarding:
      typeof s.hasCompletedOnboarding === "boolean"
        ? s.hasCompletedOnboarding
        : defaultUserState.hasCompletedOnboarding,
    // Per-feature announcement flags: undefined = not yet shown, false = seen/dismissed, true = seen and enabled
    accountSyncAnnouncementSeen: toOptionalBool(s.accountSyncAnnouncementSeen),
    ganttAnnouncementSeen: toOptionalBool(s.ganttAnnouncementSeen),
    crossBorderAnnouncementSeen: toOptionalBool(s.crossBorderAnnouncementSeen),
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
      maxBridgeDays,
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

  const updateMaxBridgeDays = useCallback(
    (days: number) => {
      setUserState((prev) => ({
        ...prev,
        settings: { ...prev.settings, maxBridgeDays: days },
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
      updateMaxBridgeDays,
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
      accountSyncAnnouncementSeen: userState.accountSyncAnnouncementSeen,
      setAccountSyncAnnouncementSeen,
      ganttAnnouncementSeen: userState.ganttAnnouncementSeen,
      setGanttAnnouncementSeen,
      crossBorderAnnouncementSeen: userState.crossBorderAnnouncementSeen,
      setCrossBorderAnnouncementSeen,
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
      updateMaxBridgeDays,
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
      setAccountSyncAnnouncementSeen,
      setGanttAnnouncementSeen,
      setCrossBorderAnnouncementSeen,
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
