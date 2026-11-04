import { entriesOverlap } from "@/lib/timeOff/overlap";
import {
  BuildingIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CirclePlusIcon,
  CircleXIcon,
  HouseIcon,
  MapPinIcon,
  PencilIcon,
  TrashIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import type { Dayjs } from "dayjs";
import { useMemo, useState, useCallback, useRef, useEffect, useId } from "react";
import { Button } from "@/components/ui/button";
import { dayjs, getWeekdayName } from "@/utils/dateTimeUtils";
import type { PublicHolidayInfo } from "@/types/publicHolidays";
import type { SchoolHolidayInfo } from "@/types/schoolHolidays";
import type { PaydayInfo } from "@/types/paydays";
import type { WorkLocation, WorkLocationMap } from "@/types/workLocation";
import type { TimeOffEntry } from "@/lib/timeOff/types";
import { isTimeOffDateEntry, isTimeOffRangeEntry, isTimeOffWeeklyEntry } from "@/lib/timeOff/types";
import type { ShiftResult } from "@/utils/shiftCalculations";
import { DayCell, type DayEvent } from "@/components/calendar/DayCell";
import { ContextMenu, type ContextMenuItem } from "@/components/shared/ContextMenu";
import * as m from "@/paraglide/messages.js";

interface MonthCalendarProps {
  entries?: TimeOffEntry[];
  month: Dayjs;
  publicHolidays?: Map<string, PublicHolidayInfo>;
  schoolHolidays?: Map<string, SchoolHolidayInfo>;
  paydayMap?: Map<string, PaydayInfo>;
  workLocationMap?: WorkLocationMap;
  onMonthChange: (month: Dayjs) => void;
  onAddEvent: (date: Dayjs) => void;
  onViewEvent: (id: string) => void;
  onEditEvent: (id: string) => void;
  onDeleteEvent?: (id: string) => void;
  onSetWorkLocation?: (date: Dayjs, location: WorkLocation | null) => void;
  onSetOtherLocation?: (date: Dayjs) => void;
  allowEventActions?: boolean;
  showHomeLocationAction?: boolean;
  showOfficeLocationAction?: boolean;
  showOtherLocationAction?: boolean;
  // Optional: Provide shift calculation function to show working schedule
  getShiftForDate?: (date: Dayjs) => ShiftResult["shift"] | undefined;
}

const DAY_FORMAT = "YYYY-MM-DD";

/**
 * Builds a complete calendar grid for the given month.
 * Includes days from adjacent months to fill complete weeks (Sunday to Saturday).
 * This ensures the calendar displays a consistent 5-7 week grid.
 * @param month - The target month as a dayjs object
 * @returns An array of dayjs objects representing all days to display in the grid
 */
const buildCalendarDays = (month: Dayjs) => {
  const start = month.startOf("month").startOf("week");
  const end = month.endOf("month").endOf("week");
  const days: Dayjs[] = [];
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
  entries,
  month,
  publicHolidays = new Map(),
  schoolHolidays = new Map(),
  paydayMap = new Map(),
  workLocationMap,
  onMonthChange,
  onAddEvent,
  onViewEvent,
  onEditEvent,
  onDeleteEvent,
  onSetWorkLocation,
  onSetOtherLocation,
  allowEventActions = true,
  showHomeLocationAction = false,
  showOfficeLocationAction = false,
  showOtherLocationAction = false,
  getShiftForDate,
}: MonthCalendarProps) {
  const keyboardHintId = useId();
  const sourceEntries = useMemo(() => entries ?? [], [entries]);
  const days = useMemo(() => buildCalendarDays(month), [month]);
  const today = dayjs();

  // --- Roving tabindex: track which cell index is the focus target ---
  const [focusedIndex, setFocusedIndex] = useState<number>(() => {
    // Default to today if it's in the grid, otherwise first day of the displayed month
    const todayIdx = days.findIndex((d) => d.isSame(today, "day"));
    if (todayIdx >= 0) return todayIdx;
    return days.findIndex((d) => d.isSame(month, "month"));
  });

  // Imperative focus is requested explicitly (keyboard navigation), never as a side effect of the
  // focus target changing, so changing month with the mouse does not pull focus into the grid.
  const [focusRequest, setFocusRequest] = useState<{ index: number } | null>(null);
  // Page Up/Down change the month; the day to focus once the new month has rendered.
  const [pendingFocusDay, setPendingFocusDay] = useState<Dayjs | null>(null);

  // Reset focused index when month changes, as a same-render response rather
  // than a follow-up effect.
  const [prevMonth, setPrevMonth] = useState(month);
  if (prevMonth !== month) {
    setPrevMonth(month);
    const pendingIdx =
      pendingFocusDay && pendingFocusDay.isSame(month, "month")
        ? days.findIndex((d) => d.isSame(pendingFocusDay, "day"))
        : -1;
    const todayIdx = days.findIndex((d) => d.isSame(today, "day"));
    if (pendingIdx >= 0) {
      setFocusedIndex(pendingIdx);
      setFocusRequest({ index: pendingIdx });
    } else if (todayIdx >= 0) {
      setFocusedIndex(todayIdx);
    } else {
      const firstOfMonth = days.findIndex((d) => d.isSame(month, "month"));
      setFocusedIndex(firstOfMonth >= 0 ? firstOfMonth : 0);
    }
    if (pendingFocusDay) setPendingFocusDay(null);
  }

  // Cell refs for imperative focus. Populated by each cell's ref callback (see
  // below) as cells mount/unmount, so the array naturally tracks `days` without
  // needing to be pre-sized here.
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (focusRequest) cellRefs.current[focusRequest.index]?.focus();
  }, [focusRequest]);

  const cellIndexOf = (target: EventTarget): number => {
    if (!(target instanceof HTMLElement)) return -1;
    const cell = target.closest<HTMLDivElement>('[role="gridcell"]');
    return cell ? cellRefs.current.indexOf(cell) : -1;
  };

  // Keep the roving tabindex on whichever day has focus, however it got it (click, tap, Tab).
  const handleGridFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    const index = cellIndexOf(e.target);
    if (index >= 0) setFocusedIndex(index);
  };

  // WAI-ARIA grid keys. Navigation starts from the day that holds focus (the cell itself or an
  // event button inside it), not from remembered state, so a clicked cell is never out of sync.
  const handleGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.metaKey || e.shiftKey) return;
    const current = cellIndexOf(e.target);
    if (current < 0) return;
    const rowStart = Math.floor(current / 7) * 7;
    let nextIndex: number;

    if (e.ctrlKey) {
      // Ctrl+Home / Ctrl+End: first / last day of the grid.
      if (e.key === "Home") nextIndex = 0;
      else if (e.key === "End") nextIndex = days.length - 1;
      else return;
    } else {
      switch (e.key) {
        case "ArrowRight":
          nextIndex = Math.min(current + 1, days.length - 1);
          break;
        case "ArrowLeft":
          nextIndex = Math.max(current - 1, 0);
          break;
        case "ArrowDown":
          nextIndex = current + 7 < days.length ? current + 7 : current;
          break;
        case "ArrowUp":
          nextIndex = current >= 7 ? current - 7 : current;
          break;
        case "Home":
          nextIndex = rowStart;
          break;
        case "End":
          nextIndex = Math.min(rowStart + 6, days.length - 1);
          break;
        case "PageUp":
        case "PageDown": {
          const day = days[current];
          if (!day) return;
          e.preventDefault();
          const step = e.key === "PageUp" ? -1 : 1;
          setPendingFocusDay(day.add(step, "month"));
          onMonthChange(month.add(step, "month"));
          return;
        }
        default:
          return; // Leave every other key (Tab, Enter, ...) alone
      }
    }

    // Always consume handled keys so arrows at the edge of the grid do not scroll the page.
    e.preventDefault();
    setFocusedIndex(nextIndex);
    setFocusRequest({ index: nextIndex });
  };

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    type: "day" | "event";
    x: number;
    y: number;
    date?: Dayjs;
    eventId?: string;
  } | null>(null);

  // Track which element triggered the context menu for focus return
  const triggerRef = useRef<HTMLElement | null>(null);

  // One boolean per entry, computed once per data change rather than per visible day.
  const overlappingIds = useMemo(
    () =>
      new Set(
        sourceEntries
          .filter((entry) =>
            sourceEntries.some((other) => other.id !== entry.id && entriesOverlap(entry, other)),
          )
          .map((entry) => entry.id),
      ),
    [sourceEntries],
  );

  const dayEvents = useMemo(() => {
    const map = new Map<string, DayEvent[]>();

    // If there are no days to display, return empty map
    if (days.length === 0) {
      return map;
    }

    const visibleStart = days[0]!;
    const visibleEnd = days[days.length - 1]!;
    const dayKeys = new Set(days.map((day) => day.format(DAY_FORMAT)));

    const addEvent = (date: Dayjs, entry: DayEvent) => {
      const key = date.format(DAY_FORMAT);
      if (!dayKeys.has(key)) return;
      const list = map.get(key) ?? [];
      list.push({
        ...entry,
        overlapping: overlappingIds.has(entry.entry.id),
      });
      map.set(key, list);
    };

    if (sourceEntries.length > 0) {
      sourceEntries.forEach((entry) => {
        if (isTimeOffDateEntry(entry)) {
          const date = dayjs(entry.date);
          if (
            !date.isValid() ||
            date.isBefore(visibleStart, "day") ||
            date.isAfter(visibleEnd, "day")
          ) {
            return;
          }
          addEvent(date, { entry });
          return;
        }

        if (isTimeOffRangeEntry(entry)) {
          const rangeStart = dayjs(entry.start).startOf("day");
          const rangeEnd = dayjs(entry.end).startOf("day");
          if (
            !rangeStart.isValid() ||
            !rangeEnd.isValid() ||
            rangeEnd.isBefore(rangeStart, "day")
          ) {
            return;
          }

          let current = rangeStart.isBefore(visibleStart, "day") ? visibleStart : rangeStart;
          const end = rangeEnd.isAfter(visibleEnd, "day") ? visibleEnd : rangeEnd;
          if (end.isBefore(current, "day")) {
            return;
          }

          while (current.isSameOrBefore(end, "day")) {
            addEvent(current, { entry });
            current = current.add(1, "day");
          }
          return;
        }

        if (isTimeOffWeeklyEntry(entry)) {
          let current = visibleStart;
          while (current.isSameOrBefore(visibleEnd, "day")) {
            if (current.isoWeekday() === entry.weekday) {
              addEvent(current, { entry });
            }
            current = current.add(1, "day");
          }
        }
      });
    }

    return map;
  }, [days, sourceEntries, overlappingIds]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => getWeekdayName(index + 1)),
    [],
  );

  // Context menu handlers — capture the triggering element for focus return
  const handleDayContextMenu = useCallback(
    (date: Dayjs, x: number, y: number, el: HTMLElement | null) => {
      // Use the actual triggering element for focus return
      triggerRef.current = el;
      setContextMenu({ type: "day", x, y, date });
    },
    [],
  );

  const handleEventContextMenu = useCallback(
    (id: string, x: number, y: number, el: HTMLElement | null) => {
      if (!allowEventActions) return;
      // Use the actual triggering element for focus return
      triggerRef.current = el;
      setContextMenu({ type: "event", x, y, eventId: id });
    },
    [allowEventActions],
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Wrap callbacks to close context menu when actions are taken
  const handleAddEventWrapper = useCallback(
    (date: Dayjs) => {
      handleCloseContextMenu();
      onAddEvent(date);
    },
    [handleCloseContextMenu, onAddEvent],
  );

  const handleViewEventWrapper = useCallback(
    (id: string) => {
      handleCloseContextMenu();
      onViewEvent(id);
    },
    [handleCloseContextMenu, onViewEvent],
  );

  const handleEditEventWrapper = useCallback(
    (id: string) => {
      handleCloseContextMenu();
      onEditEvent(id);
    },
    [handleCloseContextMenu, onEditEvent],
  );

  const getContextMenuItems = (): ContextMenuItem[] => {
    if (contextMenu?.type === "day" && contextMenu.date) {
      const items: ContextMenuItem[] = [];
      const date = contextMenu.date;
      const dayKey = date.format("YYYY-MM-DD");
      const stored = workLocationMap?.get(dayKey);
      const currentLocation = stored?.location;
      const hasStoredLocation = !!stored;
      if (allowEventActions) {
        items.push({
          label: m.calendar_context_add_event(),
          icon: CirclePlusIcon,
          onClick: () => handleAddEventWrapper(date),
        });
      }
      // Home/Office actions
      if (onSetWorkLocation && (showHomeLocationAction || showOfficeLocationAction)) {
        if (showHomeLocationAction) {
          items.push({
            label: m.calendar_context_work_from_home(),
            icon: HouseIcon,
            disabled: currentLocation === "home",
            onClick: () => {
              handleCloseContextMenu();
              onSetWorkLocation(date, "home");
            },
          });
        }
        if (showOfficeLocationAction) {
          items.push({
            label: m.calendar_context_work_from_office(),
            icon: BuildingIcon,
            disabled: currentLocation === "office",
            onClick: () => {
              handleCloseContextMenu();
              onSetWorkLocation(date, "office");
            },
          });
        }
      }
      // Other Location action
      if (showOtherLocationAction && onSetOtherLocation) {
        if (items.length) items.push({ separator: true });
        items.push({
          label: m.calendar_context_other_location(),
          icon: MapPinIcon,
          onClick: () => {
            handleCloseContextMenu();
            onSetOtherLocation(date);
          },
        });
      }
      // Clear Work Location action
      if (hasStoredLocation && onSetWorkLocation) {
        items.push({
          label: m.calendar_context_clear_work_location(),
          icon: CircleXIcon,
          onClick: () => {
            handleCloseContextMenu();
            onSetWorkLocation(date, null);
          },
        });
      }
      return items;
    }
    if (contextMenu?.type === "event" && contextMenu.eventId !== undefined) {
      const items: ContextMenuItem[] = [
        {
          label: m.calendar_context_edit_event(),
          icon: PencilIcon,
          onClick: () => handleEditEventWrapper(contextMenu.eventId!),
        },
      ];
      if (onDeleteEvent) {
        items.push({
          label: m.calendar_context_delete_event(),
          icon: TrashIcon,
          variant: "danger" as const,
          onClick: () => {
            handleCloseContextMenu();
            onDeleteEvent(contextMenu.eventId!);
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
    const result: Dayjs[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      result.push(days.slice(i, i + 7));
    }
    return result;
  }, [days]);

  return (
    <div className="month-calendar">
      <div className="month-calendar-header flex items-center justify-between mb-4">
        <div className="month-calendar-title" data-testid="month-title" aria-live="polite">
          <span>{month.format("MMMM YYYY")}</span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onMonthChange(month.subtract(1, "month"))}
            aria-label={m.calendar_nav_previous_month()}
          >
            <Icon icon={ChevronLeftIcon} />
          </Button>
          <Button
            variant={isCurrentMonth ? "default" : "outline"}
            size="sm"
            onClick={() => onMonthChange(today.startOf("month"))}
            disabled={isCurrentMonth}
            title={m.calendar_nav_current_month_label()}
          >
            <Icon icon={HouseIcon} className="mr-1" />
            {m.calendar_nav_current_month_text()}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onMonthChange(month.add(1, "month"))}
            aria-label={m.calendar_nav_next_month()}
          >
            <Icon icon={ChevronRightIcon} />
          </Button>
        </div>
      </div>

      <p id={keyboardHintId} className="mb-2 text-xs text-muted-foreground pointer-coarse:hidden">
        {m.calendar_keyboard_hint()}
      </p>
      <div
        className="month-calendar-grid"
        role="grid"
        aria-label={m.calendar_grid_label({ month: month.format("MMMM YYYY") })}
        aria-describedby={keyboardHintId}
        onFocus={handleGridFocus}
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
              const dayKey = day.format("YYYY-MM-DD");
              const hdayKey = day.format("YYYY/MM/DD");
              const cellEvents = dayEvents.get(key) ?? [];
              return (
                <DayCell
                  key={key}
                  date={day}
                  isCurrentMonth={day.isSame(month, "month")}
                  isToday={day.isSame(today, "day")}
                  isWeekend={day.isoWeekday() >= 6}
                  publicHoliday={publicHolidays.get(dayKey) ?? publicHolidays.get(hdayKey)}
                  schoolHoliday={schoolHolidays.get(dayKey) ?? schoolHolidays.get(hdayKey)}
                  paydayInfo={paydayMap.get(dayKey) ?? paydayMap.get(hdayKey)}
                  workLocation={workLocationMap?.get(dayKey)}
                  events={cellEvents}
                  shiftBadge={getShiftForDate ? getShiftForDate(day) : undefined}
                  onViewEvent={handleViewEventWrapper}
                  onDayContextMenu={handleDayContextMenu}
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
      {contextMenu !== null && contextMenuItems.length > 0 && (
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
