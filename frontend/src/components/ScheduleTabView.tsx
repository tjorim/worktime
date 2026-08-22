import type { Dayjs } from "dayjs";
import { useEffect, useRef, useState } from "react";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import type { ScheduleOption } from "@/data/rosters";
import { useLastUsed } from "@/contexts/LastUsedContext";
import { useSettings } from "@/contexts/SettingsContext";
import { TransferView } from "./TransferView";
import { WeekView } from "./schedule/WeekView";
import { TodayView } from "./schedule/TodayView";
import * as m from "@/paraglide/messages.js";

/**
 * Valid schedule view modes. Source of truth for all available views.
 */
const SCHEDULE_VIEWS = ["schedule", "transfer"] as const;

/**
 * Default schedule view mode when no preference is stored or when stored value is invalid.
 */
const DEFAULT_SCHEDULE_VIEW = SCHEDULE_VIEWS[0]; // "schedule"

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
 * Groups "Schedule" (today's lineup plus the week ahead, stacked) and "Transfers" views
 * together using a ButtonGroup selector.
 *
 * @param myTeam - The user's team number from onboarding or null
 * @param currentDate - The current date being viewed (drives the Week section's navigation)
 * @param setCurrentDate - Function to update the current date
 * @param onTeamClick - Optional callback for when a team is clicked in the Today section
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
  const { scheduleType: userScheduleType } = useSettings();
  const { lastUsed, updateLastScheduleView, updateLastOtherSchedule } = useLastUsed();
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

  // Skip the initial run: viewMode is already initialized from lastUsed.scheduleView,
  // so persisting it back on mount would be a no-op write that still bumps the shared
  // preferences blob's _updatedAt — making local state look newer than it really is
  // and winning last-write-wins reconciliation against genuinely newer server data.
  const isInitialScheduleViewRender = useRef(true);
  useEffect(() => {
    if (isInitialScheduleViewRender.current) {
      isInitialScheduleViewRender.current = false;
      return;
    }
    updateLastScheduleView(viewMode);
  }, [updateLastScheduleView, viewMode]);

  const handleViewingScheduleTypeChange = (next: ScheduleOption | null) => {
    setViewingScheduleType(next);
    updateLastOtherSchedule(next);
  };

  return (
    <div className="schedule-tab-view py-3 d-flex flex-column gap-3">
      <ButtonGroup className="view-toggle-group" aria-label={m.schedule_toggle_view_aria()}>
        <Button
          variant={viewMode === "schedule" ? "primary" : "outline-primary"}
          size="sm"
          aria-pressed={viewMode === "schedule"}
          onClick={() => setViewMode("schedule")}
        >
          <i className="bi bi-calendar-week me-1" aria-hidden="true"></i>
          {m.schedule_overview_tab()}
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

      {viewMode === "schedule" && (
        <div className="d-flex flex-column gap-3">
          <TodayView
            myTeam={myTeam}
            onTeamClick={onTeamClick}
            viewingScheduleType={viewingScheduleType}
            userScheduleType={userScheduleType}
            onViewingScheduleTypeChange={handleViewingScheduleTypeChange}
          />

          {viewingScheduleType && (
            <WeekView
              myTeam={myTeam}
              currentDate={currentDate}
              setCurrentDate={setCurrentDate}
              isActive={isActive}
              viewingScheduleType={viewingScheduleType}
            />
          )}
        </div>
      )}

      {viewMode === "transfer" && (
        <TransferView
          myTeam={myTeam}
          initialOtherTeam={null}
          otherScheduleType={viewingScheduleType}
          onOtherScheduleTypeChange={handleViewingScheduleTypeChange}
          onChangeSchedule={onChangeSchedule}
          onChangeTeam={onChangeTeam}
        />
      )}
    </div>
  );
}
