import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import Button from "react-bootstrap/Button";
import { dayjs, formatHdayDate, getWeekdayName } from "../../utils/dateTimeUtils";
import type { HdayEvent } from "../../lib/hday/types";
import type { PublicHolidayInfo } from "../../types/publicHolidays";
import type { SchoolHolidayInfo } from "../../types/schoolHolidays";
import type { PaydayInfo } from "../../types/paydays";
import { DayCell, type DayEvent } from "./DayCell";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";

interface MonthCalendarProps {
  events: HdayEvent[];
  month: dayjs.Dayjs;
  publicHolidays?: Map<string, PublicHolidayInfo>;
  schoolHolidays?: Map<string, SchoolHolidayInfo>;
  paydayMap?: Map<string, PaydayInfo>;
  onMonthChange: (month: dayjs.Dayjs) => void;
  onAddEvent: (date: dayjs.Dayjs) => void;
  onViewEvent: (index: number) => void;
  onEditEvent: (index: number) => void;
  onDeleteEvent?: (index: number) => void;
  allowEventActions?: boolean;
  // Optional: Provide shift calculation function to show working schedule
  getShiftForDate?: (
    date: dayjs.Dayjs,
  ) => { code: string; label: string; isWorking: boolean } | undefined;
}

const DAY_FORMAT = "YYYY-MM-DD";

/**
 * Parses an .hday date string (YYYY/MM/DD) to a dayjs object.
 * Converts slashes to hyphens for compatibility with dayjs.
 * @param value - The date string in YYYY/MM/DD format
 * @returns A dayjs object, or null if the input is undefined
 */
const parseHdayDate = (value?: string) => {
  if (!value) return null;
  const parsed = dayjs(value.replace(/\//g, "-"));
  return parsed.isValid() ? parsed : null;
};

/**
 * Builds a complete calendar grid for the given month.
 * Includes days from adjacent months to fill complete weeks (Sunday to Saturday).
 * This ensures the calendar displays a consistent 5-7 week grid.
 * @param month - The target month as a dayjs object
 * @returns An array of dayjs objects representing all days to display in the grid
 */
const buildCalendarDays = (month: dayjs.Dayjs) => {
  const start = month.startOf("month").startOf("week");
  const end = month.endOf("month").endOf("week");
  const days: dayjs.Dayjs[] = [];
  let current = start;
  while (current.isSameOrBefore(end, "day")) {
    days.push(current);
    current = current.add(1, "day");
  }
  return days;
};

/**
 * MonthCalendar displays a monthly calendar grid view for .hday time-off events.
 *
 * Features:
 * - Visual month overview with event chips on each day
 * - Maps both range events (spanning multiple days) and weekly recurring events
 * - Highlights weekends, today, and public/school holidays
 * - Visual indicators for courses, holidays, and paydays
 * - Click-to-add events on any day, click-to-edit existing events
 * - Month navigation buttons (previous, today, next)
 * - Arrow-key navigation between day cells (roving tabindex)
 * - Keyboard and touch context menu access
 *
 * Accessibility:
 * - ARIA grid semantics (grid > row > columnheader / gridcell)
 * - Roving tabindex with arrow-key navigation
 * - Screen reader announcements for month changes
 * - Focus return to trigger element after context menu dismissal
 */
export function MonthCalendar({
  events,
  month,
  publicHolidays = new Map(),
  schoolHolidays = new Map(),
  paydayMap = new Map(),
  onMonthChange,
  onAddEvent,
  onViewEvent,
  onEditEvent,
  onDeleteEvent,
  allowEventActions = true,
  getShiftForDate,
}: MonthCalendarProps) {
  const days = useMemo(() => buildCalendarDays(month), [month]);
  const today = dayjs();

  // --- Roving tabindex: track which cell index is the focus target ---
  const [focusedIndex, setFocusedIndex] = useState<number>(() => {
    // Default to today if it's in the grid, otherwise first day of the displayed month
    const todayIdx = days.findIndex((d) => d.isSame(today, "day"));
    if (todayIdx >= 0) return todayIdx;
    return days.findIndex((d) => d.isSame(month, "month"));
  });

  // Reset focused index when month changes
  useEffect(() => {
    const todayIdx = days.findIndex((d) => d.isSame(today, "day"));
    if (todayIdx >= 0) {
      setFocusedIndex(todayIdx);
    } else {
      const firstOfMonth = days.findIndex((d) => d.isSame(month, "month"));
      setFocusedIndex(firstOfMonth >= 0 ? firstOfMonth : 0);
    }
    // oxlint-disable-next-line exhaustive-deps -- days is derived from month; today is a fresh dayjs() each render
  }, [month]);

  // Cell refs for imperative focus
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Ensure array size matches days
  if (cellRefs.current.length !== days.length) {
    cellRefs.current = new Array(days.length).fill(null);
  }

  // Whether the last focusedIndex change was from keyboard nav (should imperatively focus)
  const shouldFocusRef = useRef(false);

  useEffect(() => {
    if (shouldFocusRef.current) {
      cellRefs.current[focusedIndex]?.focus();
      shouldFocusRef.current = false;
    }
  }, [focusedIndex]);

  // Arrow-key navigation handler on the grid
  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      let nextIndex: number | null = null;

      switch (e.key) {
        case "ArrowRight":
          nextIndex = Math.min(focusedIndex + 1, days.length - 1);
          break;
        case "ArrowLeft":
          nextIndex = Math.max(focusedIndex - 1, 0);
          break;
        case "ArrowDown":
          nextIndex = Math.min(focusedIndex + 7, days.length - 1);
          break;
        case "ArrowUp":
          nextIndex = Math.max(focusedIndex - 7, 0);
          break;
        case "Home":
          // First day of current row (row = group of 7)
          nextIndex = Math.floor(focusedIndex / 7) * 7;
          break;
        case "End":
          // Last day of current row
          nextIndex = Math.min(Math.floor(focusedIndex / 7) * 7 + 6, days.length - 1);
          break;
        default:
          return; // Don't prevent default for non-navigation keys
      }

      if (nextIndex !== null && nextIndex !== focusedIndex) {
        e.preventDefault();
        shouldFocusRef.current = true;
        setFocusedIndex(nextIndex);
      }
    },
    [focusedIndex, days.length],
  );

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    type: "day" | "event";
    x: number;
    y: number;
    date?: dayjs.Dayjs;
    eventIndex?: number;
  } | null>(null);

  // Track which element triggered the context menu for focus return
  const triggerRef = useRef<HTMLElement | null>(null);

  const dayEvents = useMemo(() => {
    const map = new Map<string, DayEvent[]>();

    // If there are no days to display, return empty map
    if (days.length === 0) {
      return map;
    }

    const visibleStart = days[0]!;
    const visibleEnd = days[days.length - 1]!;
    const dayKeys = new Set(days.map((day) => day.format(DAY_FORMAT)));

    const addEvent = (date: dayjs.Dayjs, entry: DayEvent) => {
      const key = date.format(DAY_FORMAT);
      if (!dayKeys.has(key)) return;
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    };

    events.forEach((event, index) => {
      if (event.type === "range") {
        const start = parseHdayDate(event.start);
        const end = parseHdayDate(event.end ?? event.start);
        if (!start || !end) return;

        // Clamp the event range to the currently visible calendar window
        // This prevents performance issues with very long-range events
        const rangeStart = start.isBefore(visibleStart) ? visibleStart : start;
        const rangeEnd = end.isAfter(visibleEnd) ? visibleEnd : end;

        if (rangeStart.isAfter(rangeEnd)) {
          // Event does not intersect the visible range
          return;
        }

        let current: dayjs.Dayjs = rangeStart;
        while (current.isSameOrBefore(rangeEnd, "day")) {
          addEvent(current, { event, index });
          current = current.add(1, "day");
        }
      } else if (
        event.type === "weekly" &&
        event.weekday &&
        event.weekday >= 1 &&
        event.weekday <= 7
      ) {
        const firstOccurrence = days.find((day) => day.isoWeekday() === event.weekday);
        if (!firstOccurrence) return;
        let current = firstOccurrence;
        const lastDay = days[days.length - 1]!;
        while (current.isSameOrBefore(lastDay, "day")) {
          addEvent(current, { event, index });
          current = current.add(7, "day");
        }
      }
    });

    return map;
  }, [days, events]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => getWeekdayName(index + 1)),
    [],
  );

  // Context menu handlers — capture the triggering element for focus return
  const handleDayContextMenu = useCallback(
    (date: dayjs.Dayjs, x: number, y: number) => {
      if (!allowEventActions) return;
      // The focused day cell is the trigger
      triggerRef.current = cellRefs.current[focusedIndex] ?? null;
      setContextMenu({ type: "day", x, y, date });
    },
    [allowEventActions, focusedIndex],
  );

  const handleEventContextMenu = useCallback(
    (index: number, x: number, y: number) => {
      if (!allowEventActions) return;
      // Try to capture the currently focused element as trigger
      triggerRef.current = document.activeElement as HTMLElement | null;
      setContextMenu({ type: "event", x, y, eventIndex: index });
    },
    [allowEventActions],
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Wrap callbacks to close context menu when actions are taken
  const handleAddEventWrapper = useCallback(
    (date: dayjs.Dayjs) => {
      handleCloseContextMenu();
      onAddEvent(date);
    },
    [handleCloseContextMenu, onAddEvent],
  );

  const handleViewEventWrapper = useCallback(
    (index: number) => {
      handleCloseContextMenu();
      onViewEvent(index);
    },
    [handleCloseContextMenu, onViewEvent],
  );

  const handleEditEventWrapper = useCallback(
    (index: number) => {
      handleCloseContextMenu();
      onEditEvent(index);
    },
    [handleCloseContextMenu, onEditEvent],
  );

  const getContextMenuItems = (): ContextMenuItem[] => {
    if (contextMenu?.type === "day" && contextMenu.date) {
      return [
        {
          label: "Add new event",
          icon: "bi-plus-circle",
          onClick: () => handleAddEventWrapper(contextMenu.date!),
        },
      ];
    }
    if (contextMenu?.type === "event" && contextMenu.eventIndex !== undefined) {
      const items: ContextMenuItem[] = [
        {
          label: "Edit event",
          icon: "bi-pencil",
          onClick: () => handleEditEventWrapper(contextMenu.eventIndex!),
        },
      ];
      if (onDeleteEvent) {
        items.push({
          label: "Delete event",
          icon: "bi-trash",
          variant: "danger" as const,
          onClick: () => {
            handleCloseContextMenu();
            onDeleteEvent(contextMenu.eventIndex!);
          },
        });
      }
      return items;
    }
    return [];
  };

  const contextMenuItems = getContextMenuItems();

  // Check if we're viewing the current month (reuse today for consistency)
  const currentMonth = today.startOf("month");
  const isCurrentMonth = month.isSame(currentMonth, "month");

  // Split days into rows of 7 for ARIA grid row structure
  const rows = useMemo(() => {
    const result: dayjs.Dayjs[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      result.push(days.slice(i, i + 7));
    }
    return result;
  }, [days]);

  return (
    <div className="month-calendar">
      <div className="month-calendar-header d-flex align-items-center justify-content-between mb-3">
        <div className="month-calendar-title" data-testid="month-title" aria-live="polite">
          <span>{month.format("MMMM YYYY")}</span>
        </div>
        <div className="d-flex gap-2">
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => onMonthChange(month.subtract(1, "month"))}
            aria-label="Previous month"
          >
            <i className="bi bi-chevron-left" aria-hidden="true"></i>
          </Button>
          <Button
            variant={isCurrentMonth ? "primary" : "outline-primary"}
            size="sm"
            onClick={() => onMonthChange(today.startOf("month"))}
            disabled={isCurrentMonth}
            aria-label="Jump to current month"
          >
            <i className="bi bi-house me-1" aria-hidden="true"></i>
            This Month
          </Button>
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => onMonthChange(month.add(1, "month"))}
            aria-label="Next month"
          >
            <i className="bi bi-chevron-right" aria-hidden="true"></i>
          </Button>
        </div>
      </div>

      <div
        className="month-calendar-grid"
        role="grid"
        aria-label={`Calendar for ${month.format("MMMM YYYY")}`}
        onKeyDown={handleGridKeyDown}
      >
        {/* Weekday header row */}
        <div role="row" className="month-calendar-header-row">
          {weekDays.map((label) => (
            <div key={label} role="columnheader" className="month-calendar-weekday">
              {label}
            </div>
          ))}
        </div>

        {/* Day cell rows */}
        {rows.map((row, rowIndex) => (
          <div key={row[0]!.format(DAY_FORMAT)} role="row" className="month-calendar-week-row">
            {row.map((day) => {
              const globalIndex = rowIndex * 7 + row.indexOf(day);
              const key = day.format(DAY_FORMAT);
              const dayKey = formatHdayDate(day);
              const cellEvents = dayEvents.get(key) ?? [];
              return (
                <DayCell
                  key={key}
                  date={day}
                  isCurrentMonth={day.isSame(month, "month")}
                  isToday={day.isSame(today, "day")}
                  isWeekend={day.isoWeekday() >= 6}
                  publicHoliday={publicHolidays.get(dayKey)}
                  schoolHoliday={schoolHolidays.get(dayKey)}
                  paydayInfo={paydayMap.get(dayKey)}
                  events={cellEvents}
                  shiftBadge={getShiftForDate ? getShiftForDate(day) : undefined}
                  onViewEvent={handleViewEventWrapper}
                  onDayContextMenu={allowEventActions ? handleDayContextMenu : undefined}
                  onEventContextMenu={allowEventActions ? handleEventContextMenu : undefined}
                  isFocusTarget={globalIndex === focusedIndex}
                  cellRef={(el) => {
                    cellRefs.current[globalIndex] = el;
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Context menu */}
      {allowEventActions && (
        <ContextMenu
          isOpen={contextMenu !== null}
          x={contextMenu?.x ?? 0}
          y={contextMenu?.y ?? 0}
          onClose={handleCloseContextMenu}
          items={contextMenuItems}
          triggerRef={triggerRef}
        />
      )}
    </div>
  );
}
