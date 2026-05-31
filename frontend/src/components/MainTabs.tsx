import type { Dayjs } from "dayjs";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Tab from "react-bootstrap/Tab";
import Tabs from "react-bootstrap/Tabs";
import type { ScheduleOption } from "@/data/rosters";
import { useSettings } from "@/contexts/SettingsContext";
import type { TabKey } from "@/contexts/SettingsContext";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useSyncedState } from "@/hooks/useSyncedState";
import * as m from "@/paraglide/messages.js";
import { CalendarView as LegacyCalendarView } from "./CalendarView";
import { CalendarView } from "@/features/calendar/CalendarView";
import { ScheduleDetailModal } from "./schedule/ScheduleDetailModal";
import { ScheduleTabView } from "./ScheduleTabView";
import { TimeOffView } from "./TimeOffView";
import { GanttView } from "./gantt/GanttView";
import { TimeTrackingView } from "./timeTracking/TimeTrackingView";

interface MainTabsProps {
  myTeam: number | null; // The user's team from onboarding
  currentDate: Dayjs;
  setCurrentDate: (date: Dayjs) => void;
  activeTab?: TabKey;
  onTabChange?: (tab: TabKey) => void;
  onChangeSchedule?: () => void; // Callback to open schedule selector
  onChangeTeam?: () => void; // Callback to open team selector
}

/**
 * Displays a tabbed interface for viewing calendar, schedule views, time off, or time tracking.
 *
 * Supports both internal and external control of the active tab, and notifies when the tab changes.
 * The Calendar tab shows the user's working schedule integrated with time-off and public holidays.
 * The Schedule tab groups Today, Week, and Transfers views together.
 *
 * @param myTeam - The user's team number from onboarding or null
 * @param currentDate - The current date being viewed
 * @param setCurrentDate - Function to update the current date
 * @param activeTab - The currently active tab (defaults to 'calendar')
 * @param onTabChange - Callback invoked when the active tab changes
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
  const ganttEnabled = settings.enableGantt;

  const handleTeamClick = (teamNumber: number, scheduleType: ScheduleOption | null) => {
    setSelectedTeamForDetail(teamNumber);
    setSelectedScheduleForDetail(scheduleType);
    setShowTeamDetail(true);
  };

  const handleCloseTeamDetail = () => {
    setShowTeamDetail(false);
  };

  const setActiveTab = useCallback(
    (tab: TabKey) => {
      setActiveKey(tab);
      onTabChange?.(tab);
    },
    [setActiveKey, onTabChange],
  );

  const shortcuts = useMemo(() => {
    const baseShortcuts = {
      onTabCalendar: () => setActiveTab("calendar"),
      onTabSchedule: () => setActiveTab("schedule"),
    };

    return {
      ...baseShortcuts,
      ...(timeOffEnabled ? { onTabTimeOff: () => setActiveTab("timeoff") } : {}),
      ...(timeTrackingEnabled ? { onTabTimeTracking: () => setActiveTab("timetracking") } : {}),
      ...(ganttEnabled ? { onTabGantt: () => setActiveTab("gantt") } : {}),
    };
  }, [setActiveTab, timeOffEnabled, timeTrackingEnabled, ganttEnabled]);

  useKeyboardShortcuts(shortcuts);

  const availableTabs = useMemo<TabKey[]>(
    () => [
      "calendar",
      "unified-calendar",
      "schedule",
      ...(timeOffEnabled ? (["timeoff"] as TabKey[]) : []),
      ...(timeTrackingEnabled ? (["timetracking"] as TabKey[]) : []),
      ...(ganttEnabled ? (["gantt"] as TabKey[]) : []),
    ],
    [timeOffEnabled, timeTrackingEnabled, ganttEnabled],
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
      <main id="main-content">
        <Tabs
          activeKey={activeKey}
          onSelect={(k) => {
            const newKey = (k || "calendar") as TabKey;
            setActiveTab(newKey);
          }}
          id={tabsId}
        >
          <Tab
            eventKey="calendar"
            title={
              <>
                <i className="bi bi-calendar3 me-1" aria-hidden="true"></i>
                {m.tab_calendar()}
              </>
            }
          >
            <LegacyCalendarView
              myTeam={myTeam}
              onChangeSchedule={onChangeSchedule}
              onChangeTeam={onChangeTeam}
              onOpenScheduleTab={() => setActiveTab("schedule")}
            />
          </Tab>

          <Tab
            eventKey="unified-calendar"
            title={
              <>
                <i className="bi bi-calendar-range me-1" aria-hidden="true"></i>
                {m.tab_unified_calendar()}
              </>
            }
          >
            {activeKey === "unified-calendar" && <CalendarView />}
          </Tab>

          <Tab
            eventKey="schedule"
            title={
              <>
                <i className="bi bi-calendar-week me-1" aria-hidden="true"></i>
                {m.tab_schedule()}
              </>
            }
          >
            <ScheduleTabView
              myTeam={myTeam}
              currentDate={currentDate}
              setCurrentDate={setCurrentDate}
              onTeamClick={handleTeamClick}
              onChangeSchedule={onChangeSchedule}
              onChangeTeam={onChangeTeam}
              isActive={activeKey === "schedule"}
            />
          </Tab>

          {timeOffEnabled && (
            <Tab
              eventKey="timeoff"
              title={
                <>
                  <i className="bi bi-calendar-check me-1" aria-hidden="true"></i>
                  {m.tab_time_off()}
                </>
              }
            >
              <TimeOffView isActive={activeKey === "timeoff"} />
            </Tab>
          )}

          {timeTrackingEnabled && (
            <Tab
              eventKey="timetracking"
              title={
                <>
                  <i className="bi bi-stopwatch me-1" aria-hidden="true"></i>
                  {m.tab_time_tracking()}
                </>
              }
            >
              <TimeTrackingView />
            </Tab>
          )}

          {ganttEnabled && (
            <Tab
              eventKey="gantt"
              title={
                <>
                  <i className="bi bi-bar-chart-steps me-1" aria-hidden="true"></i>
                  {m.tab_gantt()}
                </>
              }
            >
              <GanttView />
            </Tab>
          )}
        </Tabs>
      </main>

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
