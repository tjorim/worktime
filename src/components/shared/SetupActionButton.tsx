import clsx from "clsx";
import Button from "react-bootstrap/Button";
import { useSetupAction } from "../../hooks/useSetupAction";

interface SetupActionButtonProps {
  /**
   * Callback when user clicks to select schedule.
   * Opens the welcome wizard at the schedule selection step.
   */
  onChangeSchedule?: () => void;
  /**
   * Callback when user clicks to select team.
   * Opens the welcome wizard at the team selection step.
   */
  onChangeTeam?: () => void;
  /**
   * Override the automatic detection of what needs to be selected.
   * - "auto": Automatically detect based on scheduleType and team selection (default)
   * - "team": Always show team selection prompt (useful for multi-team contexts like TransferView)
   */
  mode?: "auto" | "team";
  /**
   * Button size (Bootstrap size prop).
   */
  size?: "sm" | "lg";
}

/**
 * Renders the appropriate setup action button based on user's schedule and team selection status.
 *
 * - No schedule selected: Shows "Select Schedule" button (primary)
 * - Schedule selected but needs team: Shows "Select Team" button (primary)
 * - Setup complete: Renders null
 *
 * @param onChangeSchedule - Callback to open schedule selection
 * @param onChangeTeam - Callback to open team selection
 * @param mode - Override automatic detection ("auto" or "team")
 * @param size - Button size ("sm" or "lg")
 */
export function SetupActionButton({
  onChangeSchedule,
  onChangeTeam,
  mode = "auto",
  size,
}: SetupActionButtonProps) {
  const { needsSchedule, needsTeam, buttonText, buttonIcon } = useSetupAction({ mode });

  // Primary action: Select Schedule
  if (needsSchedule && onChangeSchedule) {
    return (
      <Button
        variant="primary"
        size={size}
        onClick={onChangeSchedule}
        title="Select your work schedule"
      >
        <i className={clsx("bi", buttonIcon, "me-1")} aria-hidden="true"></i>
        {buttonText}
      </Button>
    );
  }

  // Primary action: Select Team (for multi-team schedules when no team selected)
  if (needsTeam && onChangeTeam) {
    return (
      <Button variant="primary" size={size} onClick={onChangeTeam} title="Select your team">
        <i className={clsx("bi", buttonIcon, "me-1")} aria-hidden="true"></i>
        {buttonText}
      </Button>
    );
  }

  return null;
}
