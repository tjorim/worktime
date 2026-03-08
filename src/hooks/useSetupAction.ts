import { useSettings } from "../contexts/SettingsContext";
import { getScheduleConfig } from "../utils/scheduleUtils";

interface UseSetupActionOptions {
  /**
   * Override the automatic detection of what needs to be selected.
   * - "auto": Automatically detect based on scheduleType and team selection (default)
   * - "team": Always indicate team selection is needed (for multi-team contexts like TransferView)
   */
  mode?: "auto" | "team";
}

interface SetupActionResult {
  /** Whether the user needs to select a schedule */
  needsSchedule: boolean;
  /** Whether the user needs to select a team */
  needsTeam: boolean;
  /** Whether the schedule supports team selection */
  hasTeams: boolean;
  /** Number of teams in the current schedule */
  teamCount: number;
  /** Semantic button key based on what's needed */
  buttonTextKey: "select_schedule" | "select_team";
  /** Appropriate Bootstrap icon class (without "bi " prefix) */
  buttonIcon: string;
}

/**
 * Hook to determine what setup action a user needs to take.
 *
 * Used by SetupActionButton and GenericStatus to consistently determine whether
 * the user needs to select a schedule or team.
 *
 * @param options - Configuration options
 * @returns Object indicating what action is needed and appropriate button text/icon
 */
export function useSetupAction(options?: UseSetupActionOptions): SetupActionResult {
  const { scheduleType, myTeam } = useSettings();
  const scheduleConfig = getScheduleConfig(scheduleType);
  const teamCount = scheduleConfig.shiftConfig.teamCount;
  const hasTeams = teamCount > 1;
  const mode = options?.mode ?? "auto";

  // Determine what the user needs to do
  const needsSchedule = mode === "auto" && !scheduleType;
  const needsTeam = mode === "team" || (!!scheduleType && hasTeams && myTeam === null);

  // Button text and icon based on context
  const buttonTextKey = needsSchedule ? "select_schedule" : "select_team";
  const buttonIcon = needsSchedule ? "bi-calendar-week" : "bi-person-plus";

  return {
    needsSchedule,
    needsTeam,
    hasTeams,
    teamCount,
    buttonTextKey,
    buttonIcon,
  };
}
