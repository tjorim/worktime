import { useSettings } from "../contexts/SettingsContext";
import { getEffectiveTeam } from "../utils/scheduleUtils";
import { PersonalizedStatus } from "./status/PersonalizedStatus";
import { GenericStatus } from "./status/GenericStatus";

interface CurrentStatusProps {
  myTeam: number | null; // The user's team from onboarding
  onChangeTeam: () => void;
  onChangeSchedule?: () => void;
  onShowWhoIsWorking?: () => void;
}

/**
 * Current Status component - routes to PersonalizedStatus or GenericStatus based on team selection.
 *
 * For single-user schedules (9-5), automatically treats user as team 1 and shows PersonalizedStatus.
 * For multi-team schedules (5-shift, 2-shift, etc.), shows GenericStatus if no team selected,
 * PersonalizedStatus if team is selected.
 *
 * @param myTeam - The user's team number from onboarding, or null
 * @param onChangeTeam - Callback invoked when the user requests to select or change their team
 * @param onChangeSchedule - Optional callback invoked when the user requests to change their schedule
 * @param onShowWhoIsWorking - Optional callback to show who is currently working
 * @returns PersonalizedStatus or GenericStatus component
 */
export function CurrentStatus(props: CurrentStatusProps) {
  const { myTeam } = props;
  const { scheduleType } = useSettings();

  // Get effective team - for single-user schedules, this returns 1 when myTeam is null
  const effectiveTeam = getEffectiveTeam(myTeam, scheduleType);

  // Route to appropriate status component
  if (effectiveTeam) {
    return <PersonalizedStatus {...props} myTeam={effectiveTeam} />;
  } else {
    return <GenericStatus {...props} />;
  }
}
