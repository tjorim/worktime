import type { Dayjs } from "dayjs";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Button from "react-bootstrap/Button";
import Tab from "react-bootstrap/Tab";
import Tabs from "react-bootstrap/Tabs";
import type { ScheduleOption } from "../data/rosters";
import { useSettings } from "../contexts/SettingsContext";
import type { TabKey } from "../contexts/SettingsContext";
import { useIsMobile } from "../hooks/useIsMobile";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useSyncedState } from "../hooks/useSyncedState";
import { dayjs } from "../utils/dateTimeUtils";
import { CalendarView } from "./CalendarView";
import { ScheduleDetailModal } from "./schedule/ScheduleDetailModal";
import { ScheduleTabView } from "./ScheduleTabView";
import { TimeOffView } from "./TimeOffView";
import { TimeTrackingView } from "./timeTracking/TimeTrackingView";

interface MainTabsProps {
  myTeam: number | null;
  currentDate: Dayjs;
  setCurrentDate: (date: Dayjs) => void;
  activeTab?: TabKey;
  onTabChange?: (tab: TabKey) => void;
  onChangeSchedule?: () => void;
  onChangeTeam?: () => void;
  onOpenSettings?: () => void;
}

export function MainTabs({
  myTeam,
  currentDate,
  setCurrentDate,
  activeTab = "calendar",
  onTabChange,
  onChangeSchedule,
  onChangeTeam,
  onOpenSettings,
}: MainTabsProps) {
  const tabsId = useId();
  const [activeKey, setActiveKey] = useSyncedState(activeTab);
  const [showTeamDetail, setShowTeamDetail] = useState(false);
  const [selectedTeamForDetail, setSelectedTeamForDetail] = useState<number>(1);
  const [selectedScheduleForDetail, setSelectedScheduleForDetail] = useState<ScheduleOption | null>(
    null,
  );
  const [showMobileActions, setShowMobileActions] = useState(false);
  const isMobile = useIsMobile();
  const fabRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const prevShowMobileActionsRef = useRef(false);
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
    };
  }, [setActiveTab, timeOffEnabled, timeTrackingEnabled]);

  useKeyboardShortcuts(shortcuts);

  const availableTabs = useMemo<TabKey[]>(
    () => [
      "calendar",
      "schedule",
      ...(timeOffEnabled ? (["timeoff"] as TabKey[]) : []),
      ...(timeTrackingEnabled ? (["timetracking"] as TabKey[]) : []),
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

  useEffect(() => {
    if (!isMobile) {
      setShowMobileActions(false);
    }
  }, [isMobile]);

  useEffect(() => {
    const prev = prevShowMobileActionsRef.current;
    prevShowMobileActionsRef.current = showMobileActions;
    if (showMobileActions && !prev) {
      const firstItem = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
      firstItem?.focus();
    } else if (!showMobileActions && prev) {
      fabRef.current?.focus();
    }
  }, [showMobileActions]);

  useEffect(() => {
    if (!showMobileActions) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowMobileActions(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showMobileActions]);

  const mobileActions = useMemo(
    () => [
      {
        key: "today",
        label: activeKey === "schedule" ? "Go to Today" : "Open Schedule",
        icon: activeKey === "schedule" ? "bi-calendar-day" : "bi-calendar-week",
        onClick: () => {
          if (activeKey !== "schedule") {
            setActiveTab("schedule");
            return;
          }
          setCurrentDate(dayjs());
        },
      },
      {
        key: "switch-team",
        label: myTeam ? "Switch Team" : "Set My Team",
        icon: "bi-people",
        onClick: () => onChangeTeam?.(),
      },
      {
        key: "settings",
        label: "Open Settings",
        icon: "bi-gear",
        onClick: () => onOpenSettings?.(),
      },
      {
        key: "change-schedule",
        label: "Change Schedule",
        icon: "bi-clipboard-list",
        onClick: () => onChangeSchedule?.(),
      },
    ],
    [
      activeKey,
      myTeam,
      onChangeSchedule,
      onChangeTeam,
      onOpenSettings,
      setActiveTab,
      setCurrentDate,
    ],
  );

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
                  Time Off
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
                  Time Tracking
                </>
              }
            >
              <TimeTrackingView />
            </Tab>
          )}
        </Tabs>
      </main>

      {isMobile && (
        <div className="mobile-fab-container">
          {showMobileActions && (
            <div
              className="mobile-fab-backdrop"
              onClick={() => setShowMobileActions(false)}
              aria-hidden="true"
            />
          )}
          {showMobileActions && (
            <div
              id="mobile-quick-actions"
              className="mobile-fab-menu"
              role="menu"
              aria-label="Quick actions"
              ref={menuRef}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
                  if (!items?.length) return;
                  const idx = Array.from(items).indexOf(document.activeElement as HTMLElement);
                  const next =
                    event.key === "ArrowDown"
                      ? items[(idx + 1) % items.length]
                      : items[(idx - 1 + items.length) % items.length];
                  next?.focus();
                }
              }}
            >
              {mobileActions.map((action) => (
                <Button
                  key={action.key}
                  variant="light"
                  className="mobile-fab-menu-item"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => {
                    action.onClick();
                    setShowMobileActions(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Tab") {
                      setShowMobileActions(false);
                    }
                  }}
                >
                  <i className={`bi ${action.icon} me-2`} aria-hidden="true"></i>
                  {action.label}
                </Button>
              ))}
            </div>
          )}
          <Button
            ref={fabRef}
            className="mobile-fab"
            onClick={() => setShowMobileActions((prev) => !prev)}
            aria-label={showMobileActions ? "Close quick actions" : "Open quick actions"}
            aria-expanded={showMobileActions}
            aria-haspopup="menu"
            aria-controls={showMobileActions ? "mobile-quick-actions" : undefined}
          >
            <i
              className={`bi ${showMobileActions ? "bi-x-lg" : "bi-plus-lg"}`}
              aria-hidden="true"
            ></i>
          </Button>
        </div>
      )}

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
