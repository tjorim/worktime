import type { Dayjs } from "dayjs";
import { useEffect, useId } from "react";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Form from "react-bootstrap/Form";
import type { ScheduleOption } from "../data/rosters";
import { SCHEDULE_OPTIONS } from "../data/rosters";
import { useSettings } from "../contexts/SettingsContext";
import { useSyncedState } from "../hooks/useSyncedState";
import { useViewMode } from "../hooks/useViewMode";
import { dayjs } from "../utils/dateTimeUtils";
import { isValidScheduleType } from "../utils/scheduleUtils";
import { ScheduleView } from "./schedule/ScheduleView";
import { TodayView } from "./schedule/TodayView";

// Pre-compute available schedules since SCHEDULE_OPTIONS is static
const availableSchedules = SCHEDULE_OPTIONS.filter((s) => s.isAvailable);

/**
 * Valid view modes for the Schedule tab.
 * Hoisted to module level to prevent unnecessary re-renders when used in useViewMode.
 */
const SCHEDULE_VIEWS = ["today", "week"] as const;

interface ScheduleTabViewProps {
  myTeam: number | null;
  currentDate: Dayjs;
  setCurrentDate: (date: Dayjs) => void;
  onTeamClick?: (teamNumber: number, scheduleType: ScheduleOption | null) => void;
  isActive?: boolean;
  initialView?: string; // Initial view mode from URL parameter ("today" or "week")
}

/**
 * Displays a tabbed interface for viewing today's schedule or the weekly schedule.
 *
 * Groups "Today" and "Week" views together using a ButtonGroup selector, similar to how
 * the Time Off tab has multiple internal views. Both views show generic schedules for
 * all teams in the selected schedule type.
 *
 * @param myTeam - The user's team number from onboarding or null
 * @param currentDate - The current date being viewed
 * @param setCurrentDate - Function to update the current date
 * @param onTeamClick - Optional callback for when a team is clicked in Today view
 * @param isActive - Whether this tab is currently active (for keyboard shortcuts)
 * @param initialView - Initial view mode from URL parameter ("today" or "week")
 * @returns The rendered schedule tab view component.
 */
export function ScheduleTabView({
  myTeam,
  currentDate,
  setCurrentDate,
  onTeamClick,
  isActive = false,
  initialView,
}: ScheduleTabViewProps) {
  const scheduleSelectId = useId();
  const { scheduleType: userScheduleType, updateLastScheduleView } = useSettings();
  const [viewMode, setViewMode] = useViewMode(initialView, SCHEDULE_VIEWS, "today");
  const [viewingScheduleType, setViewingScheduleType] = useSyncedState(userScheduleType);

  useEffect(() => {
    updateLastScheduleView(viewMode);
  }, [updateLastScheduleView, viewMode]);

  const handlePreviousDay = () => {
    setCurrentDate(currentDate.subtract(1, "day"));
  };

  const handleNextDay = () => {
    setCurrentDate(currentDate.add(1, "day"));
  };

  const handleTodayClick = () => {
    setCurrentDate(dayjs());
  };

  return (
    <div className="schedule-tab-view py-3">
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2 mb-3">
        <ButtonGroup aria-label="Toggle schedule view">
          <Button
            variant={viewMode === "today" ? "primary" : "outline-primary"}
            size="sm"
            onClick={() => setViewMode("today")}
          >
            <i className="bi bi-calendar-day me-1" aria-hidden="true"></i>
            Today
          </Button>
          <Button
            variant={viewMode === "week" ? "primary" : "outline-primary"}
            size="sm"
            onClick={() => setViewMode("week")}
          >
            <i className="bi bi-calendar-week me-1" aria-hidden="true"></i>
            Week
          </Button>
        </ButtonGroup>

        <div className="d-flex align-items-center gap-2 flex-wrap">
          <Form.Label htmlFor={scheduleSelectId} className="mb-0 small text-muted">
            📋 View schedule:
          </Form.Label>
          <Form.Select
            id={scheduleSelectId}
            size="sm"
            value={viewingScheduleType || ""}
            onChange={(e) => {
              const value = e.target.value;
              setViewingScheduleType(isValidScheduleType(value) ? value : null);
            }}
            style={{ width: "auto" }}
          >
            <option value="" disabled>
              Select schedule...
            </option>
            {availableSchedules.map((schedule) => (
              <option key={schedule.value} value={schedule.value}>
                {schedule.title}
                {schedule.value === userScheduleType ? " (Your schedule)" : ""}
              </option>
            ))}
          </Form.Select>
        </div>
      </div>

      {!viewingScheduleType && (
        <div className="alert alert-info mb-0" role="status">
          Select a schedule to view the team lineup and shift details.
        </div>
      )}

      {viewingScheduleType && viewMode === "today" && (
        <TodayView
          myTeam={myTeam}
          currentDate={currentDate}
          onPreviousDay={handlePreviousDay}
          onNextDay={handleNextDay}
          onTodayClick={handleTodayClick}
          onTeamClick={onTeamClick}
          isActive={isActive}
          viewingScheduleType={viewingScheduleType}
          showTimeOffEvents={false}
        />
      )}

      {viewingScheduleType && viewMode === "week" && (
        <ScheduleView
          myTeam={myTeam}
          currentDate={currentDate}
          setCurrentDate={setCurrentDate}
          isActive={isActive}
          viewingScheduleType={viewingScheduleType}
        />
      )}
    </div>
  );
}
