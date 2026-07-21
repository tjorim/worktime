import type { Dayjs } from "dayjs";
import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useState } from "react";
import Spinner from "react-bootstrap/Spinner";
import Tab from "react-bootstrap/Tab";
import Tabs from "react-bootstrap/Tabs";
import type { ScheduleOption } from "@/data/rosters";
import { useSettings } from "@/contexts/SettingsContext";
import type { TabKey } from "@/contexts/SettingsContext";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useSyncedState } from "@/hooks/useSyncedState";
import * as m from "@/paraglide/messages.js";
import { ScheduleDetailModal } from "./schedule/ScheduleDetailModal";
import { ScheduleTabView } from "./ScheduleTabView";

const CalendarView = lazy(() =>
  import("@/components/CalendarView").then((module) => ({
    default: module.CalendarView,
  })),
);
const UnifiedCalendarView = lazy(() =>
  import("@/features/calendar/CalendarView").then((module) => ({
    default: module.CalendarView,
  })),
);
const TimeOffView = lazy(() =>
  import("@/components/TimeOffView").then((module) => ({
    default: module.TimeOffView,
  })),
);
const TimeTrackingView = lazy(() =>
  import("@/components/timeTracking/TimeTrackingView").then((module) => ({
    default: module.TimeTrackingView,
  })),
);
const GanttView = lazy(() =>
  import("@/components/gantt/GanttView").then((module) => ({
    default: module.GanttView,
  })),
);

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
  const { settings } = useSettings();
  const [activeKey, setActiveKey] = useSyncedState(activeTab);
  const [showTeamDetail, setShowTeamDetail] = useState(false);
  const [selectedTeamForDetail, setSelectedTeamForDetail] = useState<number>(1);
  const [selectedScheduleForDetail, setSelectedScheduleForDetail] = useState<ScheduleOption | null>(
    null,
  );
  const timeOffEnabled = settings.enableTimeOff;
  const timeTrackingEnabled = settings.enableTimeTracking;
  const ganttEnabled = settings.enableGantt;
  const unifiedCalendarEnabled = settings.enableUnifiedCalendar;

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
      ...(onChangeTeam ? { onTeamSelect: onChangeTeam } : {}),
    };

    return {
      ...baseShortcuts,
      ...(timeOffEnabled ? { onTabTimeOff: () => setActiveTab("timeoff") } : {}),
      ...(timeTrackingEnabled ? { onTabTimeTracking: () => setActiveTab("timetracking") } : {}),
      ...(ganttEnabled ? { onTabGantt: () => setActiveTab("gantt") } : {}),
    };
  }, [setActiveTab, onChangeTeam, timeOffEnabled, timeTrackingEnabled, ganttEnabled]);

  useKeyboardShortcuts(shortcuts);

  const availableTabs = useMemo<TabKey[]>(
    () => [
      "calendar",
      ...(unifiedCalendarEnabled ? (["unified-calendar"] as TabKey[]) : []),
      "schedule",
      ...(timeOffEnabled ? (["timeoff"] as TabKey[]) : []),
      ...(timeTrackingEnabled ? (["timetracking"] as TabKey[]) : []),
      ...(ganttEnabled ? (["gantt"] as TabKey[]) : []),
    ],
    [unifiedCalendarEnabled, timeOffEnabled, timeTrackingEnabled, ganttEnabled],
  );

  const loadingFallback = useMemo(
    () => (
      <div className="d-flex justify-content-center py-4" aria-live="polite">
        <Spinner animation="border" role="status" size="sm">
          <span className="visually-hidden">{m.loading()}</span>
        </Spinner>
      </div>
    ),
    [],
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
      <div>
        <Tabs
          activeKey={activeKey}
          onSelect={(k) => {
            const newKey = (k || "calendar") as TabKey;
            setActiveTab(newKey);
          }}
          id={tabsId}
          className="main-tabs"
        >
          <Tab
            eventKey="calendar"
            title={
              <>
                <i className="bi bi-calendar3" aria-hidden="true"></i>
                <span className="main-tab-label">{m.tab_calendar()}</span>
              </>
            }
            tabAttrs={{ "aria-label": m.tab_calendar() }}
          >
            {activeKey === "calendar" && (
              <Suspense fallback={loadingFallback}>
                <CalendarView
                  myTeam={myTeam}
                  onChangeSchedule={onChangeSchedule}
                  onChangeTeam={onChangeTeam}
                  onOpenScheduleTab={() => setActiveTab("schedule")}
                />
              </Suspense>
            )}
          </Tab>

          {unifiedCalendarEnabled && (
            <Tab
              eventKey="unified-calendar"
              title={
                <>
                  <i className="bi bi-calendar-range" aria-hidden="true"></i>
                  <span className="main-tab-label">{m.tab_unified_calendar()}</span>
                </>
              }
              tabAttrs={{ "aria-label": m.tab_unified_calendar() }}
            >
              {activeKey === "unified-calendar" && (
                <Suspense fallback={loadingFallback}>
                  <UnifiedCalendarView
                    onChangeSchedule={onChangeSchedule}
                    onChangeTeam={onChangeTeam}
                  />
                </Suspense>
              )}
            </Tab>
          )}

          <Tab
            eventKey="schedule"
            title={
              <>
                <i className="bi bi-calendar-week" aria-hidden="true"></i>
                <span className="main-tab-label">{m.tab_schedule()}</span>
              </>
            }
            tabAttrs={{ "aria-label": m.tab_schedule() }}
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
                  <i className="bi bi-calendar-check" aria-hidden="true"></i>
                  <span className="main-tab-label">{m.tab_time_off()}</span>
                </>
              }
              tabAttrs={{ "aria-label": m.tab_time_off() }}
            >
              <Suspense fallback={loadingFallback}>
                <TimeOffView isActive={activeKey === "timeoff"} />
              </Suspense>
            </Tab>
          )}

          {timeTrackingEnabled && (
            <Tab
              eventKey="timetracking"
              title={
                <>
                  <i className="bi bi-stopwatch" aria-hidden="true"></i>
                  <span className="main-tab-label">{m.tab_time_tracking()}</span>
                </>
              }
              tabAttrs={{ "aria-label": m.tab_time_tracking() }}
            >
              {activeKey === "timetracking" && (
                <Suspense fallback={loadingFallback}>
                  <TimeTrackingView />
                </Suspense>
              )}
            </Tab>
          )}

          {ganttEnabled && (
            <Tab
              eventKey="gantt"
              title={
                <>
                  <i className="bi bi-bar-chart-steps" aria-hidden="true"></i>
                  <span className="main-tab-label">{m.tab_gantt()}</span>
                </>
              }
              tabAttrs={{ "aria-label": m.tab_gantt() }}
            >
              {activeKey === "gantt" && (
                <Suspense fallback={loadingFallback}>
                  <GanttView />
                </Suspense>
              )}
            </Tab>
          )}
        </Tabs>
      </div>

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
