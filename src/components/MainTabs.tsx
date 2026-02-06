import type { Dayjs } from "dayjs";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Tab from "react-bootstrap/Tab";
import Tabs from "react-bootstrap/Tabs";
import type { ScheduleOption } from "../data/rosters";
import { useSettings } from "../contexts/SettingsContext";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useSyncedState } from "../hooks/useSyncedState";
import { CalendarView } from "./CalendarView";
import { ScheduleDetailModal } from "./schedule/ScheduleDetailModal";
import { ScheduleTabView } from "./ScheduleTabView";
import { TimeOffView } from "./TimeOffView";
import { TimeTrackingView } from "./timeTracking/TimeTrackingView";
import { TransferView } from "./TransferView";

interface MainTabsProps {
  myTeam: number | null; // The user's team from onboarding
  currentDate: Dayjs;
  setCurrentDate: (date: Dayjs) => void;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  initialScheduleView?: string; // Initial view mode for schedule sub-tabs (e.g., "today", "week")
  initialTimeOffView?: string; // Initial view mode for time-off sub-tabs (e.g., "table", "stats")
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
 * @param initialScheduleView - Initial schedule view mode from URL or stored preference
 * @param initialTimeOffView - Initial time-off view mode from URL or stored preference
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
  initialScheduleView,
  initialTimeOffView,
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
  const { settings } = useSettings();
  const timeOffEnabled = settings.enableTimeOff;
  const timeTrackingEnabled = settings.enableTimeTracking;

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

  const shortcuts = useMemo(() => {
    const baseShortcuts = {
      onTabCalendar: () => setActiveTab("calendar"),
      onTabSchedule: () => setActiveTab("schedule"),
      onTabTransfer: () => setActiveTab("transfer"),
    };

    return {
      ...baseShortcuts,
      ...(timeOffEnabled ? { onTabTimeOff: () => setActiveTab("timeoff") } : {}),
      ...(timeTrackingEnabled ? { onTabTimeTracking: () => setActiveTab("timetracking") } : {}),
    };
  }, [setActiveTab, timeOffEnabled, timeTrackingEnabled]);

  useKeyboardShortcuts(shortcuts);

  const availableTabs = useMemo(
    () => [
      "calendar",
      "schedule",
      "transfer",
      ...(timeOffEnabled ? ["timeoff"] : []),
      ...(timeTrackingEnabled ? ["timetracking"] : []),
    ],
    [timeOffEnabled, timeTrackingEnabled],
  );

  useEffect(() => {
    if (!availableTabs.includes(activeKey)) {
      const fallbackTab = availableTabs[0] ?? "calendar";
      if (activeKey !== fallbackTab) {
        setActiveTab(fallbackTab);
      }
    }
  }, [activeKey, availableTabs, setActiveTab]);

  return (
    <>
      <Tabs
        activeKey={activeKey}
        onSelect={(k) => {
          const newKey = k || "calendar";
          setActiveTab(newKey);
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
            initialView={initialScheduleView}
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

        {timeOffEnabled && (
          <Tab
            eventKey="timeoff"
            title={
              <>
                <i className="bi bi-calendar-check me-1" aria-hidden="true"></i>
                Time Off
              </>
            }
          >
            <TimeOffView isActive={activeKey === "timeoff"} initialView={initialTimeOffView} />
          </Tab>
        )}

        {timeTrackingEnabled && (
          <Tab
            eventKey="timetracking"
            title={
              <>
                <i className="bi bi-stopwatch me-1" aria-hidden="true"></i>
                Time Tracking
              </>
            }
          >
            <TimeTrackingView />
          </Tab>
        )}
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
