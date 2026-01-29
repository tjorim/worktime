import { useId, useMemo } from "react";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import { useSettings } from "../contexts/SettingsContext";
import { useSetupAction } from "../hooks/useSetupAction";
import { useLiveTime } from "../hooks/useLiveTime";
import { dayjs, formatTimeByPreference, formatYYWWD } from "../utils/dateTimeUtils";
import { getEffectiveTeam } from "../utils/scheduleUtils";
import { getCurrentShiftDay, getCurrentWorkingTeam } from "../utils/shiftCalculations";
import { PersonalizedStatusContent } from "./status/PersonalizedStatus";
import { GenericStatusContent } from "./status/GenericStatus";
import { SetupActionButton } from "./shared/SetupActionButton";
import { ShiftTimeline } from "./ShiftTimeline";

interface CurrentStatusProps {
  myTeam: number | null;
  onChangeTeam: () => void;
  onChangeSchedule?: () => void;
  onShowWhoIsWorking?: () => void;
}

/**
 * Current Status component displaying shift information.
 *
 * Shows a common header with date/time and action buttons, then renders either
 * personalized content (user's team shifts) or generic content (overview of all teams).
 *
 * For single-user schedules (9-5), automatically treats user as team 1.
 * For multi-team schedules, shows generic view if no team selected.
 */
export function CurrentStatus({
  myTeam,
  onChangeTeam,
  onChangeSchedule,
  onShowWhoIsWorking,
}: CurrentStatusProps) {
  const dateTooltipId = useId();
  const { settings, scheduleType } = useSettings();
  const { hasTeams, teamCount } = useSetupAction();
  const liveTime = useLiveTime();
  const today = dayjs();

  // Get effective team - for single-user schedules, this returns 1 when myTeam is null
  const effectiveTeam = getEffectiveTeam(myTeam, scheduleType);

  // Calculate current shift day (accounts for night shifts spanning midnight)
  const currentShiftDay = useMemo(() => {
    if (!scheduleType) return today;
    return getCurrentShiftDay(liveTime, scheduleType);
  }, [liveTime, scheduleType, today]);

  // Find which team is currently working (for timeline)
  const currentWorkingTeam = useMemo(() => {
    if (!scheduleType) return null;
    return getCurrentWorkingTeam(today, scheduleType);
  }, [today.startOf("minute").toISOString(), scheduleType]); // oxlint-disable-line react-hooks/exhaustive-deps -- dependencies intentionally use minute-normalized ISO string

  // No schedule selected - show setup prompt
  if (!scheduleType) {
    return (
      <Col className="mb-4">
        <Card>
          <Card.Body className="text-center py-4">
            <i className="bi bi-calendar-plus text-muted mb-3 icon-lg" aria-hidden="true"></i>
            <p className="text-muted mb-3">
              Please select your schedule to view the current status.
            </p>
            <SetupActionButton onChangeSchedule={onChangeSchedule} onChangeTeam={onChangeTeam} />
          </Card.Body>
        </Card>
      </Col>
    );
  }

  // Determine which action button to show in header
  const showChangeTeamButton = effectiveTeam && hasTeams && teamCount > 1;

  return (
    <Col className="mb-4">
      <Card>
        <Card.Body>
          {/* Common Header Row */}
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div className="d-flex align-items-center gap-3">
              <Card.Title className="mb-0">Current Status</Card.Title>
              <div className="text-muted">
                <OverlayTrigger
                  placement="bottom"
                  overlay={
                    <Tooltip id={dateTooltipId}>
                      <strong>Date Format: YYWW.D</strong>
                      <br />
                      YY = Year (2-digit)
                      <br />
                      WW = Week number
                      <br />D = Weekday (1=Mon, 7=Sun)
                      <br />
                      <em>
                        Today: {formatYYWWD(today)}
                        <br />
                        Shift Day: {formatYYWWD(currentShiftDay)}
                      </em>
                    </Tooltip>
                  }
                >
                  <small className="help-underline">
                    📅 {formatYYWWD(currentShiftDay)} • {liveTime.format("dddd, MMM D")} •{" "}
                    {formatTimeByPreference(liveTime, settings.timeFormat)}
                  </small>
                </OverlayTrigger>
              </div>
            </div>
            <div className="d-flex gap-2">
              <Button
                variant="outline-primary"
                size="sm"
                onClick={onShowWhoIsWorking}
                title="See who's working right now"
                disabled={!onShowWhoIsWorking}
              >
                <i className="bi bi-people me-1"></i>
                Who's On?
              </Button>
              {showChangeTeamButton ? (
                <Button variant="outline-secondary" size="sm" onClick={onChangeTeam}>
                  <i className="bi bi-person-gear me-1"></i>
                  Change Team
                </Button>
              ) : (
                <SetupActionButton
                  onChangeSchedule={onChangeSchedule}
                  onChangeTeam={onChangeTeam}
                  size="sm"
                  showChangeSchedule
                />
              )}
            </div>
          </div>

          {/* Timeline Row */}
          {currentWorkingTeam && (
            <div className="mb-3">
              <ShiftTimeline currentWorkingTeam={currentWorkingTeam} today={today} />
            </div>
          )}

          {/* Status Content - Personalized or Generic */}
          {effectiveTeam ? (
            <PersonalizedStatusContent myTeam={effectiveTeam} scheduleType={scheduleType} />
          ) : (
            <GenericStatusContent scheduleType={scheduleType} />
          )}
        </Card.Body>
      </Card>
    </Col>
  );
}
