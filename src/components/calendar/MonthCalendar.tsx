import { useMemo, useState } from "react";
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
  while (current.isBefore(end) || current.isSame(end, "day")) {
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
 *
 * Accessibility:
 * - ARIA labels for all interactive elements
 * - Screen reader announcements for month changes
 * - Semantic calendar grid structure
 *
 * @param props - Component props
 * @param props.events - Array of .hday events to display
 * @param props.month - The currently displayed month
 * @param props.publicHolidays - Map of public holidays by date key
 * @param props.schoolHolidays - Map of school holidays by date key
 * @param props.paydayMap - Map of paydays by date key
 * @param props.onMonthChange - Callback when month navigation occurs
 * @param props.onAddEvent - Callback when user clicks to add event on a date
 * @param props.onEditEvent - Callback when user clicks to edit an existing event
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
  getShiftForDate,
}: MonthCalendarProps) {
  const days = useMemo(() => buildCalendarDays(month), [month]);
  const today = dayjs();

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    type: "day" | "event";
    x: number;
    y: number;
    date?: dayjs.Dayjs;
    eventIndex?: number;
  } | null>(null);

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
        while (current.isBefore(rangeEnd) || current.isSame(rangeEnd, "day")) {
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
        while (current.isBefore(lastDay) || current.isSame(lastDay, "day")) {
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

  // Context menu handlers
  const handleDayContextMenu = (date: dayjs.Dayjs, x: number, y: number) => {
    setContextMenu({ type: "day", x, y, date });
  };

  const handleEventContextMenu = (index: number, x: number, y: number) => {
    setContextMenu({ type: "event", x, y, eventIndex: index });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  // Wrap callbacks to close context menu when actions are taken
  const handleAddEventWrapper = (date: dayjs.Dayjs) => {
    handleCloseContextMenu();
    onAddEvent(date);
  };

  const handleViewEventWrapper = (index: number) => {
    handleCloseContextMenu();
    onViewEvent(index);
  };

  const handleEditEventWrapper = (index: number) => {
    handleCloseContextMenu();
    onEditEvent(index);
  };

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

      <div className="month-calendar-grid" aria-label="Month calendar">
        {weekDays.map((label) => (
          <div key={label} className="month-calendar-weekday">
            {label}
          </div>
        ))}

        {days.map((day) => {
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
              onDayContextMenu={handleDayContextMenu}
              onEventContextMenu={handleEventContextMenu}
            />
          );
        })}
      </div>

      {/* Context menu */}
      <ContextMenu
        isOpen={contextMenu !== null}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        onClose={handleCloseContextMenu}
        items={contextMenuItems}
      />
    </div>
  );
}
