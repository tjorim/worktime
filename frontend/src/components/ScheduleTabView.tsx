import type { Dayjs } from "dayjs";
import { useEffect, useId, useRef, useState } from "react";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Form from "react-bootstrap/Form";
import type { ScheduleOption } from "@/data/rosters";
import { SCHEDULE_OPTIONS } from "@/data/rosters";
import { useSettings } from "@/contexts/SettingsContext";
import { dayjs } from "@/utils/dateTimeUtils";
import { isValidScheduleType } from "@/utils/scheduleUtils";
import { TransferView } from "./TransferView";
import { WeekView } from "./schedule/WeekView";
import { TodayView } from "./schedule/TodayView";
import * as m from "@/paraglide/messages.js";

// Pre-compute available schedules since SCHEDULE_OPTIONS is static
const availableSchedules = SCHEDULE_OPTIONS.filter((s) => s.isAvailable);

/**
 * Valid schedule view modes. Source of truth for all available views.
 */
const SCHEDULE_VIEWS = ["today", "week", "transfer"] as const;

/**
 * Default schedule view mode when no preference is stored or when stored value is invalid.
 */
const DEFAULT_SCHEDULE_VIEW = SCHEDULE_VIEWS[0]; // "today"

interface ScheduleTabViewProps {
  myTeam: number | null;
  currentDate: Dayjs;
  setCurrentDate: (date: Dayjs) => void;
  onTeamClick?: (teamNumber: number, scheduleType: ScheduleOption | null) => void;
  onChangeSchedule?: () => void;
  onChangeTeam?: () => void;
  isActive?: boolean;
}

/**
 * Displays a tabbed interface for viewing schedule details and transfers.
 *
 * Groups "Today", "Week", and "Transfers" views together using a ButtonGroup selector.
 * Today and Week show generic schedules for all teams in the selected schedule type.
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
  onChangeSchedule,
  onChangeTeam,
  isActive = false,
}: ScheduleTabViewProps) {
  const scheduleSelectId = useId();
  const {
    scheduleType: userScheduleType,
    updateLastScheduleView,
    updateLastOtherSchedule,
    lastUsed,
  } = useSettings();
  const [viewMode, setViewMode] = useState(lastUsed.scheduleView ?? DEFAULT_SCHEDULE_VIEW);

  // Initialize viewingScheduleType from persisted value, falling back to user's schedule
  const [viewingScheduleType, setViewingScheduleType] = useState<ScheduleOption | null>(
    lastUsed.otherSchedule ?? userScheduleType,
  );

  // Reset when user's schedule changes externally (e.g. via settings)
  const prevUserScheduleRef = useRef(userScheduleType);
  useEffect(() => {
    if (prevUserScheduleRef.current !== userScheduleType) {
      setViewingScheduleType(userScheduleType);
      updateLastOtherSchedule(userScheduleType);
      prevUserScheduleRef.current = userScheduleType;
    }
  }, [userScheduleType, updateLastOtherSchedule]);

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
    <div className="schedule-tab-view py-3 d-flex flex-column gap-3">
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2">
        <ButtonGroup aria-label={m.schedule_toggle_view_aria()}>
          <Button
            variant={viewMode === "today" ? "primary" : "outline-primary"}
            size="sm"
            aria-pressed={viewMode === "today"}
            onClick={() => setViewMode("today")}
          >
            <i className="bi bi-calendar-day me-1" aria-hidden="true"></i>
            {m.today()}
          </Button>
          <Button
            variant={viewMode === "week" ? "primary" : "outline-primary"}
            size="sm"
            aria-pressed={viewMode === "week"}
            onClick={() => setViewMode("week")}
          >
            <i className="bi bi-calendar-week me-1" aria-hidden="true"></i>
            {m.this_week()}
          </Button>
          <Button
            variant={viewMode === "transfer" ? "primary" : "outline-primary"}
            size="sm"
            aria-pressed={viewMode === "transfer"}
            onClick={() => setViewMode("transfer")}
          >
            <i className="bi bi-arrow-left-right me-1" aria-hidden="true"></i>
            {m.schedule_transfers_tab()}
          </Button>
        </ButtonGroup>

        <div className="d-flex align-items-center gap-2 flex-wrap">
          <Form.Label htmlFor={scheduleSelectId} className="mb-0 small text-muted">
            <i className="bi bi-clipboard-list me-1" aria-hidden="true"></i>
            {m.schedule_view_label()}
          </Form.Label>
          <Form.Select
            id={scheduleSelectId}
            size="sm"
            value={viewingScheduleType || ""}
            onChange={(e) => {
              const value = e.target.value;
              const next = isValidScheduleType(value) ? value : null;
              setViewingScheduleType(next);
              updateLastOtherSchedule(next);
            }}
            style={{ width: "auto" }}
          >
            <option value="" disabled>
              {m.schedule_select_placeholder()}
            </option>
            {availableSchedules.map((schedule) => (
              <option key={schedule.value} value={schedule.value}>
                {schedule.title}
                {schedule.value === userScheduleType ? ` ${m.schedule_your_schedule_suffix()}` : ""}
              </option>
            ))}
          </Form.Select>
        </div>
      </div>

      {!viewingScheduleType && viewMode !== "transfer" && (
        <div className="alert alert-info mb-0" role="status">
          {m.schedule_select_hint()}
        </div>
      )}

      {viewingScheduleType && viewMode === "today" && (
        <TodayView
          myTeam={myTeam}
          currentDate={currentDate}
          onPreviousDay={handlePreviousDay}
          onNextDay={handleNextDay}
          onTodayClick={handleTodayClick}
          onDateSelect={setCurrentDate}
          onTeamClick={onTeamClick}
          isActive={isActive}
          viewingScheduleType={viewingScheduleType}
        />
      )}

      {viewingScheduleType && viewMode === "week" && (
        <WeekView
          myTeam={myTeam}
          currentDate={currentDate}
          setCurrentDate={setCurrentDate}
          isActive={isActive}
          viewingScheduleType={viewingScheduleType}
        />
      )}

      {viewMode === "transfer" && (
        <TransferView
          myTeam={myTeam}
          initialOtherTeam={null}
          onChangeSchedule={onChangeSchedule}
          onChangeTeam={onChangeTeam}
        />
      )}
    </div>
  );
}
