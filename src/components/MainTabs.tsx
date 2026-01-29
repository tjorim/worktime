import type { Dayjs } from "dayjs";
import { useCallback, useId, useMemo, useState } from "react";
import Tab from "react-bootstrap/Tab";
import Tabs from "react-bootstrap/Tabs";
import type { ScheduleOption } from "../data/rosters";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useSyncedState } from "../hooks/useSyncedState";
import { CalendarView } from "./CalendarView";
import { ScheduleDetailModal } from "./schedule/ScheduleDetailModal";
import { ScheduleTabView } from "./ScheduleTabView";
import { TimeOffView } from "./TimeOffView";
import { TransferView } from "./TransferView";

interface MainTabsProps {
  myTeam: number | null; // The user's team from onboarding
  currentDate: Dayjs;
  setCurrentDate: (date: Dayjs) => void;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  initialView?: string; // Initial view mode for sub-tabs (e.g., "today", "week", "stats")
  onChangeSchedule?: () => void; // Callback to open schedule selector
  onChangeTeam?: () => void; // Callback to open team selector
}

/**
 * Displays a tabbed interface for viewing calendar, schedules, transfers, or time off.
 *
 * Supports both internal and external control of the active tab, and notifies when the tab changes.
 * The Calendar tab shows the user's working schedule integrated with time-off and public holidays.
 * The Schedule tab groups Today and Week views together. Each tab presents different views relevant
 * to the user's team and date.
 *
 * @param myTeam - The user's team number from onboarding or null
 * @param currentDate - The current date being viewed
 * @param setCurrentDate - Function to update the current date
 * @param activeTab - The currently active tab (defaults to 'calendar')
 * @param onTabChange - Callback invoked when the active tab changes
 * @param initialView - Initial view mode for sub-tabs from URL parameter
 * @param onChangeSchedule - Callback to open schedule selector
 * @param onChangeTeam - Callback to open team selector
 * @returns The rendered tabbed interface component.
 */
export function MainTabs({
  myTeam,
  currentDate,
  setCurrentDate,
  activeTab = "calendar",
  onTabChange,
  initialView,
  onChangeSchedule,
  onChangeTeam,
}: MainTabsProps) {
  const tabsId = useId();
  const [activeKey, setActiveKey] = useSyncedState(activeTab);
  const [showTeamDetail, setShowTeamDetail] = useState(false);
  const [selectedTeamForDetail, setSelectedTeamForDetail] = useState<number>(1);
  const [selectedScheduleForDetail, setSelectedScheduleForDetail] = useState<ScheduleOption | null>(
    null,
  );

  const handleTeamClick = (teamNumber: number, scheduleType: ScheduleOption | null) => {
    setSelectedTeamForDetail(teamNumber);
    setSelectedScheduleForDetail(scheduleType);
    setShowTeamDetail(true);
  };

  const handleCloseTeamDetail = () => {
    setShowTeamDetail(false);
  };

  const setActiveTab = useCallback(
    (tab: string) => {
      setActiveKey(tab);
      onTabChange?.(tab);
    },
    [setActiveKey, onTabChange],
  );

  const shortcuts = useMemo(
    () => ({
      onTabCalendar: () => setActiveTab("calendar"),
      onTabSchedule: () => setActiveTab("schedule"),
      onTabTransfer: () => setActiveTab("transfer"),
      onTabTimeOff: () => setActiveTab("timeoff"),
    }),
    [setActiveTab],
  );

  useKeyboardShortcuts(shortcuts);

  return (
    <>
      <Tabs
        activeKey={activeKey}
        onSelect={(k) => {
          const newKey = k || "calendar";
          setActiveKey(newKey);
          onTabChange?.(newKey);
        }}
        id={tabsId}
      >
        <Tab
          eventKey="calendar"
          title={
            <>
              <i className="bi bi-calendar3 me-1" aria-hidden="true"></i>
              Calendar
            </>
          }
        >
          <CalendarView
            myTeam={myTeam}
            onChangeSchedule={onChangeSchedule}
            onChangeTeam={onChangeTeam}
            onOpenScheduleTab={() => setActiveTab("schedule")}
          />
        </Tab>

        <Tab
          eventKey="schedule"
          title={
            <>
              <i className="bi bi-calendar-week me-1" aria-hidden="true"></i>
              Schedule
            </>
          }
        >
          <ScheduleTabView
            myTeam={myTeam}
            currentDate={currentDate}
            setCurrentDate={setCurrentDate}
            onTeamClick={handleTeamClick}
            isActive={activeKey === "schedule"}
            initialView={initialView}
          />
        </Tab>

        <Tab
          eventKey="transfer"
          title={
            <>
              <i className="bi bi-arrow-left-right me-1" aria-hidden="true"></i>
              Transfers
            </>
          }
        >
          <TransferView
            myTeam={myTeam}
            initialOtherTeam={null}
            onChangeSchedule={onChangeSchedule}
            onChangeTeam={onChangeTeam}
          />
        </Tab>

        <Tab
          eventKey="timeoff"
          title={
            <>
              <i className="bi bi-calendar-check me-1" aria-hidden="true"></i>
              Time Off
            </>
          }
        >
          <TimeOffView isActive={activeKey === "timeoff"} initialView={initialView} />
        </Tab>
      </Tabs>

      {/* Schedule Detail Modal */}
      {selectedScheduleForDetail && (
        <ScheduleDetailModal
          show={showTeamDetail}
          onHide={handleCloseTeamDetail}
          teamNumber={selectedTeamForDetail}
          scheduleType={selectedScheduleForDetail}
        />
      )}
    </>
  );
}
