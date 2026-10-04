import {
  Calendar as CalendarIcon,
  ChartGantt as ChartGanttIcon,
  Layers as LayersIcon,
  List as ListIcon,
  Plane as PlaneIcon,
  Timer as TimerIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import type { Dayjs } from "dayjs";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { ScheduleOption } from "@/data/rosters";
import { useSettings } from "@/contexts/SettingsContext";
import type { TabKey } from "@/contexts/SettingsContext";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useSyncedState } from "@/hooks/useSyncedState";
import * as m from "@/paraglide/messages.js";
import { ScheduleDetailModal } from "@/components/schedule/ScheduleDetailModal";
import { ScheduleTabView } from "@/components/ScheduleTabView";
import { MobileQuickActions } from "@/components/MobileQuickActions";

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
  import("@/features/timeTracking/TimeTrackingView").then((module) => ({
    default: module.TimeTrackingView,
  })),
);
const GanttView = lazy(() =>
  import("@/features/gantt/GanttView").then((module) => ({
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
  // One-shot handoff for opening a specific time-tracking entry's edit modal from
  // another tab (e.g. a Gantt task's linked entries list).
  pendingTaskEditId?: string | null;
  onRequestTaskEdit?: (taskId: string) => void;
  onClearPendingTaskEdit?: () => void;
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
  pendingTaskEditId,
  onRequestTaskEdit,
  onClearPendingTaskEdit,
}: MainTabsProps) {
  const { settings } = useSettings();
  const [activeKey, setActiveKey] = useSyncedState(activeTab);
  const [showTeamDetail, setShowTeamDetail] = useState(false);
  const [selectedTeamForDetail, setSelectedTeamForDetail] = useState<number>(1);
  const [selectedScheduleForDetail, setSelectedScheduleForDetail] = useState<ScheduleOption | null>(
    null,
  );
  const [timeOffAddRequest, setTimeOffAddRequest] = useState(0);
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

  const handleNavigateToEntry = useCallback(
    (entryId: string) => {
      onRequestTaskEdit?.(entryId);
      setActiveTab("timetracking");
    },
    [onRequestTaskEdit, setActiveTab],
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
      <div className="flex justify-center py-4" aria-live="polite">
        <Spinner role="status" size="sm">
          <span className="sr-only">{m.loading()}</span>
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
        <Tabs value={activeKey} onValueChange={(value) => setActiveTab(value as TabKey)}>
          <TabsList className="w-full h-auto justify-start overflow-x-auto" aria-label="Worktime">
            {availableTabs.map((key) => {
              const labels = {
                calendar: m.tab_calendar(),
                "unified-calendar": m.tab_unified_calendar(),
                schedule: m.tab_schedule(),
                timeoff: m.tab_time_off(),
                timetracking: m.tab_time_tracking(),
                gantt: m.tab_gantt(),
              };
              const icons = {
                calendar: CalendarIcon,
                "unified-calendar": LayersIcon,
                schedule: ListIcon,
                timeoff: PlaneIcon,
                timetracking: TimerIcon,
                gantt: ChartGanttIcon,
              };
              return (
                <TabsTrigger
                  key={key}
                  value={key}
                  className="min-h-11 min-w-0 flex-col sm:flex-row flex-1 sm:flex-none whitespace-normal px-1 sm:px-3"
                  aria-label={labels[key]}
                >
                  <Icon icon={icons[key]} />
                  <span className="text-xs sm:text-sm wrap-anywhere">{labels[key]}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
          <TabsContent value="calendar" keepMounted>
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
          </TabsContent>

          {unifiedCalendarEnabled && (
            <TabsContent value="unified-calendar" keepMounted>
              {activeKey === "unified-calendar" && (
                <Suspense fallback={loadingFallback}>
                  <UnifiedCalendarView
                    onChangeSchedule={onChangeSchedule}
                    onChangeTeam={onChangeTeam}
                  />
                </Suspense>
              )}
            </TabsContent>
          )}

          <TabsContent value="schedule" keepMounted>
            <ScheduleTabView
              myTeam={myTeam}
              currentDate={currentDate}
              setCurrentDate={setCurrentDate}
              onTeamClick={handleTeamClick}
              onChangeSchedule={onChangeSchedule}
              onChangeTeam={onChangeTeam}
              isActive={activeKey === "schedule"}
            />
          </TabsContent>

          {timeOffEnabled && (
            <TabsContent value="timeoff" keepMounted>
              <Suspense fallback={loadingFallback}>
                <TimeOffView
                  isActive={activeKey === "timeoff"}
                  addEventRequest={timeOffAddRequest}
                />
              </Suspense>
            </TabsContent>
          )}

          {timeTrackingEnabled && (
            <TabsContent value="timetracking" keepMounted>
              {activeKey === "timetracking" && (
                <Suspense fallback={loadingFallback}>
                  <TimeTrackingView
                    pendingTaskEditId={pendingTaskEditId}
                    onClearPendingTaskEdit={onClearPendingTaskEdit}
                  />
                </Suspense>
              )}
            </TabsContent>
          )}

          {ganttEnabled && (
            <TabsContent value="gantt" keepMounted>
              {activeKey === "gantt" && (
                <Suspense fallback={loadingFallback}>
                  <GanttView onNavigateToEntry={handleNavigateToEntry} />
                </Suspense>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>

      <MobileQuickActions
        canAddTimeOff={timeOffEnabled}
        canTrackTime={timeTrackingEnabled}
        onAddTimeOff={() => {
          setTimeOffAddRequest((request) => request + 1);
          setActiveTab("timeoff");
        }}
        onTrackTime={() => {
          setActiveTab("timetracking");
        }}
        onOpenCalendar={() => setActiveTab("calendar")}
      />

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
