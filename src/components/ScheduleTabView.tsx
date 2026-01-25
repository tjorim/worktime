import type { Dayjs } from "dayjs";
import { useState } from "react";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import { ScheduleView } from "./ScheduleView";
import { TodayView } from "./TodayView";

interface ScheduleTabViewProps {
  myTeam: number | null;
  currentDate: Dayjs;
  setCurrentDate: (date: Dayjs) => void;
  onTeamClick?: (teamNumber: number) => void;
  isActive?: boolean;
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
 * @returns The rendered schedule tab view component.
 */
export function ScheduleTabView({
  myTeam,
  currentDate,
  setCurrentDate,
  onTeamClick,
  isActive = true,
}: ScheduleTabViewProps) {
  const [viewMode, setViewMode] = useState<"today" | "week">("today");

  const handlePreviousDay = () => {
    setCurrentDate(currentDate.subtract(1, "day"));
  };

  const handleNextDay = () => {
    setCurrentDate(currentDate.add(1, "day"));
  };

  const handleTodayClick = () => {
    setCurrentDate(currentDate.startOf("day").hour(12)); // Normalize to noon
  };

  return (
    <div className="schedule-tab-view py-3">
      <div className="d-flex justify-content-start mb-3">
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
      </div>

      {viewMode === "today" && (
        <TodayView
          myTeam={myTeam}
          currentDate={currentDate}
          onPreviousDay={handlePreviousDay}
          onNextDay={handleNextDay}
          onTodayClick={handleTodayClick}
          onTeamClick={onTeamClick}
          isActive={isActive}
        />
      )}

      {viewMode === "week" && (
        <ScheduleView
          myTeam={myTeam}
          currentDate={currentDate}
          setCurrentDate={setCurrentDate}
          isActive={isActive}
        />
      )}
    </div>
  );
}
