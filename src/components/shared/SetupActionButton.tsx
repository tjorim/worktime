import Button from "react-bootstrap/Button";
import { useSetupAction } from "../../hooks/useSetupAction";

interface SetupActionButtonProps {
  /**
   * Callback when user clicks to select/change schedule.
   * Opens the welcome wizard at the schedule selection step.
   */
  onChangeSchedule?: () => void;
  /**
   * Callback when user clicks to select/change team.
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
  /**
   * Whether to show "Change Schedule" fallback when no setup action is needed.
   * Useful for GenericStatus where we always want a schedule-related button.
   */
  showChangeSchedule?: boolean;
}

/**
 * Renders the appropriate setup action button based on user's schedule and team selection status.
 *
 * - No schedule selected: Shows "Select Schedule" button (primary)
 * - Schedule selected but needs team: Shows "Select Team" button (primary)
 * - showChangeSchedule=true and setup complete: Shows "Change Schedule" button (outline-secondary)
 *
 * @param onChangeSchedule - Callback to open schedule selection
 * @param onChangeTeam - Callback to open team selection
 * @param mode - Override automatic detection ("auto" or "team")
 * @param size - Button size ("sm" or "lg")
 * @param showChangeSchedule - Show "Change Schedule" fallback when setup is complete
 */
export function SetupActionButton({
  onChangeSchedule,
  onChangeTeam,
  mode = "auto",
  size,
  showChangeSchedule = false,
}: SetupActionButtonProps) {
  const { needsSchedule, hasTeams, teamCount } = useSetupAction({ mode });

  // Primary action: Select Schedule
  if (needsSchedule && onChangeSchedule) {
    return (
      <Button
        variant="primary"
        size={size}
        onClick={onChangeSchedule}
        title="Select your work schedule"
      >
        <i className="bi bi-calendar-week me-1" aria-hidden="true"></i>
        Select Schedule
      </Button>
    );
  }

  // Primary action: Select Team (for multi-team schedules)
  if (hasTeams && teamCount > 1 && onChangeTeam) {
    return (
      <Button variant="primary" size={size} onClick={onChangeTeam} title="Select your team">
        <i className="bi bi-person-plus me-1" aria-hidden="true"></i>
        Select Team
      </Button>
    );
  }

  // Fallback: Change Schedule (when showChangeSchedule is enabled)
  if (showChangeSchedule && onChangeSchedule) {
    return (
      <Button
        variant="outline-secondary"
        size={size}
        onClick={onChangeSchedule}
        title="Change your work schedule"
      >
        <i className="bi bi-calendar-week me-1" aria-hidden="true"></i>
        Change Schedule
      </Button>
    );
  }

  return null;
}
