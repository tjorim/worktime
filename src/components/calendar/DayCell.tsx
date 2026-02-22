import { useRef, useCallback, useEffect, useState, type KeyboardEvent } from "react";
import clsx from "clsx";
import type { HdayEvent } from "../../lib/hday/types";
import type { PublicHolidayInfo } from "../../types/publicHolidays";
import type { SchoolHolidayInfo } from "../../types/schoolHolidays";
import type { PaydayInfo } from "../../types/paydays";
import type { WorkLocationInfo } from "../../types/workLocation";
import { dayjs } from "../../utils/dateTimeUtils";
import { WORK_LOCATION_ICON_CLASS } from "./workLocationConstants";
import {
  getEventColorClass,
  getEventTypeLabel,
  getTimeLocationSymbol,
} from "../../lib/hday/parser";

export type DayEvent = {
  event: HdayEvent;
  index: number;
};

interface DayCellProps {
  date: dayjs.Dayjs;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  publicHoliday?: PublicHolidayInfo;
  paydayInfo?: PaydayInfo;
  schoolHoliday?: SchoolHolidayInfo;
  events: DayEvent[];
  shiftBadge?: { code: string; label: string; isWorking: boolean }; // Optional shift info
  workLocation?: WorkLocationInfo; // Optional work location (home/office/other)
  onViewEvent: (index: number) => void;
  onDayContextMenu?: (date: dayjs.Dayjs, x: number, y: number, el: HTMLElement | null) => void;
  onEventContextMenu?: (index: number, x: number, y: number, el: HTMLElement | null) => void;
  /** Whether this cell is the roving-tabindex focus target */
  isFocusTarget?: boolean;
  /** Callback ref so MonthCalendar can imperatively focus this cell */
  cellRef?: (el: HTMLDivElement | null) => void;
}

/**
 * Maximum number of events to display per day before showing overflow count.
 * Limit ensures calendar cells remain readable on all screen sizes.
 */
const MAX_EVENTS = 3;

/**
 * Accessible labels for time/location symbols displayed in events.
 * Maps each symbol to a human-readable description for screen readers.
 */
const SYMBOL_LABELS: Record<string, string> = {
  "◐": "Morning half-day event",
  "◑": "Afternoon half-day event",
  W: "Onsite support",
  N: "Not able to fly",
  F: "In principle able to fly",
};

/**
 * Determines which visual indicator icons to display for a day based on event flags.
 * Currently supports:
 * - 📘 Course/training indicator for events with "course" flag
 *
 * @param events - Array of DayEvent objects for the day
 * @returns Array of emoji strings to display as indicators
 */
const getIndicatorIcons = (events: DayEvent[]) => {
  const icons = new Set<string>();

  events.forEach(({ event }) => {
    const flags = event.flags ?? [];
    if (flags.includes("course")) {
      icons.add("📘");
    }
  });

  return Array.from(icons);
};

const getIndicatorDetails = (
  publicHoliday?: PublicHolidayInfo,
  paydayInfo?: PaydayInfo,
  schoolHoliday?: SchoolHolidayInfo,
) => {
  return [
    publicHoliday && {
      key: "public-holiday",
      emoji: "🎉",
      title: publicHoliday.localName,
      label: publicHoliday.name,
    },
    schoolHoliday && {
      key: "school-holiday",
      emoji: "🏫",
      title: schoolHoliday.localName,
      label: schoolHoliday.name,
    },
    paydayInfo && {
      key: "payday",
      emoji: "💶",
      title: paydayInfo.name,
      label: paydayInfo.name,
    },
  ].filter(Boolean) as Array<{
    key: string;
    emoji: string;
    title: string;
    label: string;
  }>;
};

const getWorkLocationLabel = (workLocation?: WorkLocationInfo): string | undefined => {
  if (!workLocation) return undefined;

  switch (workLocation.location) {
    case "home":
      return "Working from home";
    case "office":
      return "Working from office";
    case "other": {
      if (workLocation.label) {
        return `Other location: ${workLocation.label} (${workLocation.countryCode})`;
      }
      return `Other location (${workLocation.countryCode})`;
    }
    default:
      return undefined;
  }
};

/** Minimum touch move distance (px) before canceling long-press */
const LONG_PRESS_MOVE_THRESHOLD = 10;
/** Long-press duration (ms) to trigger context menu on touch devices */
const LONG_PRESS_DURATION = 500;

/**
 * Opens a context menu positioned at the center of the given element's bounding rect.
 */
function openMenuFromElement(el: HTMLElement, handler: (x: number, y: number) => void) {
  const rect = el.getBoundingClientRect();
  handler(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

/**
 * DayCell renders an individual day in the month calendar grid.
 *
 * Features:
 * - Displays up to 3 event chips with color coding and labels
 * - Shows overflow count when more than 3 events exist
 * - Visual indicators for courses, public holidays, school holidays, and paydays
 * - Highlights for weekends, today, and holidays
 * - Click-to-view existing events, right-click context menu for actions
 * - Keyboard accessible: Enter/Shift+F10 opens context menu
 * - Touch accessible: long-press opens context menu
 * - "+" add button visible on hover/focus-within
 *
 * Accessibility:
 * - role="gridcell" for ARIA grid semantics
 * - Roving tabindex (0 for focused cell, -1 for others)
 * - ARIA labels with full date and holiday information
 * - Color indicators supplemented with emoji symbols
 * - Semantic button elements for all interactive areas
 */
export function DayCell({
  date,
  isCurrentMonth,
  isToday,
  isWeekend,
  publicHoliday,
  paydayInfo,
  schoolHoliday,
  events,
  shiftBadge,
  workLocation,
  onViewEvent,
  onDayContextMenu,
  onEventContextMenu,
  isFocusTarget = false,
  cellRef,
}: DayCellProps) {
  const [isOverflowExpanded, setIsOverflowExpanded] = useState(false);
  const visibleEvents = events.slice(0, MAX_EVENTS);
  const hiddenEvents = events.slice(MAX_EVENTS);
  const hiddenCount = Math.max(events.length - visibleEvents.length, 0);
  const indicators = getIndicatorIcons(events);
  const holidayIndicators = getIndicatorDetails(publicHoliday, paydayInfo, schoolHoliday);
  const workLocationLabel = getWorkLocationLabel(workLocation);
  const ariaLabelParts = [date.format("dddd, MMMM D, YYYY")];
  if (isToday) {
    ariaLabelParts.push("Today");
  }
  if (shiftBadge) {
    ariaLabelParts.push(`Shift: ${shiftBadge.label}`);
  }
  if (workLocationLabel && shiftBadge?.isWorking) {
    ariaLabelParts.push(workLocationLabel);
  }
  if (publicHoliday) {
    ariaLabelParts.push(publicHoliday.name);
  }
  if (schoolHoliday) {
    ariaLabelParts.push(`School Holiday: ${schoolHoliday.name}`);
  }
  if (paydayInfo) {
    ariaLabelParts.push(paydayInfo.name);
  }

  // Long-press state for touch support
  const touchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);

  const clearLongPress = useCallback(() => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
    touchStartPos.current = null;
  }, []);

  // Cleanup long-press timer on unmount
  useEffect(() => {
    return () => {
      clearLongPress();
    };
  }, [clearLongPress]);

  useEffect(() => {
    if (isOverflowExpanded && hiddenCount === 0) {
      setIsOverflowExpanded(false);
    }
  }, [hiddenCount]); // oxlint-disable-line react-hooks/exhaustive-deps -- only hiddenCount should trigger this effect

  /** Start a long-press timer that fires `handler(x, y)` after LONG_PRESS_DURATION ms */
  const startLongPress = useCallback(
    (touch: React.Touch, handler: (x: number, y: number) => void) => {
      touchStartPos.current = { x: touch.clientX, y: touch.clientY };
      touchTimerRef.current = setTimeout(() => {
        handler(touch.clientX, touch.clientY);
        touchTimerRef.current = null;
      }, LONG_PRESS_DURATION);
    },
    [],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartPos.current || !touchTimerRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - touchStartPos.current.x;
      const dy = touch.clientY - touchStartPos.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_MOVE_THRESHOLD) {
        clearLongPress();
      }
    },
    [clearLongPress],
  );

  // Keyboard handler for the day cell itself
  const handleCellKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!onDayContextMenu) return;
      // Enter or Shift+F10 or ContextMenu key opens the day context menu
      if (e.key === "Enter" || (e.key === "F10" && e.shiftKey) || e.key === "ContextMenu") {
        e.preventDefault();
        e.stopPropagation();
        openMenuFromElement(e.currentTarget, (x, y) =>
          onDayContextMenu(date, x, y, e.currentTarget as HTMLElement),
        );
      }
    },
    [date, onDayContextMenu],
  );

  // Keyboard handler for event chip buttons
  const handleEventKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (!onEventContextMenu) return;
      if ((e.key === "F10" && e.shiftKey) || e.key === "ContextMenu") {
        e.preventDefault();
        e.stopPropagation();
        openMenuFromElement(e.currentTarget, (x, y) =>
          onEventContextMenu(index, x, y, e.currentTarget as HTMLElement),
        );
      }
    },
    [onEventContextMenu],
  );

  const renderEventButton = useCallback(
    ({ event, index }: DayEvent) => {
      const colorClass = getEventColorClass(event.flags, event.type);
      const label = event.title || getEventTypeLabel(event.flags);
      const symbol = getTimeLocationSymbol(event.flags);

      return (
        <button
          key={`${date.format("YYYY-MM-DD")}-${index}`}
          type="button"
          className="month-calendar-event"
          onClick={(eventClick) => {
            eventClick.stopPropagation();
            onViewEvent(index);
          }}
          onContextMenu={(e) => {
            if (onEventContextMenu) {
              e.preventDefault();
              e.stopPropagation();
              onEventContextMenu(index, e.clientX, e.clientY, e.currentTarget);
            }
          }}
          onKeyDown={(e) => handleEventKeyDown(e, index)}
          onTouchStart={(e) => {
            if (onEventContextMenu && e.touches[0]) {
              startLongPress(e.touches[0], (x, y) =>
                onEventContextMenu(index, x, y, e.currentTarget as HTMLElement),
              );
            }
          }}
          onTouchEnd={clearLongPress}
          onTouchMove={handleTouchMove}
          aria-label={`View ${label}`}
        >
          <span className={clsx("month-calendar-event-color", colorClass)} />
          <span className="month-calendar-event-label">
            {symbol && (
              <span
                className="month-calendar-event-symbol"
                role="img"
                aria-label={SYMBOL_LABELS[symbol] || symbol}
              >
                {symbol}
              </span>
            )}
            {label}
          </span>
        </button>
      );
    },
    [
      clearLongPress,
      date,
      handleEventKeyDown,
      handleTouchMove,
      onEventContextMenu,
      onViewEvent,
      startLongPress,
    ],
  );

  return (
    <div
      ref={cellRef}
      role="gridcell"
      tabIndex={isFocusTarget ? 0 : -1}
      aria-label={ariaLabelParts.join(" - ")}
      aria-haspopup={onDayContextMenu ? "menu" : undefined}
      className={clsx(
        "month-calendar-day",
        !isCurrentMonth && "is-other-month",
        isToday && "is-today",
        isWeekend && "is-weekend",
        publicHoliday && "is-public-holiday",
        schoolHoliday && "is-school-holiday",
        paydayInfo && "is-payday",
      )}
      onContextMenu={(e) => {
        if (onDayContextMenu) {
          e.preventDefault();
          e.stopPropagation();
          onDayContextMenu(date, e.clientX, e.clientY, e.currentTarget as HTMLElement);
        }
      }}
      onKeyDown={handleCellKeyDown}
      onTouchStart={(e) => {
        if (onDayContextMenu && e.touches[0]) {
          startLongPress(e.touches[0], (x, y) =>
            onDayContextMenu(date, x, y, e.currentTarget as HTMLElement),
          );
        }
      }}
      onTouchEnd={clearLongPress}
      onTouchMove={handleTouchMove}
    >
      <div className="month-calendar-day-header">
        <span className="month-calendar-day-number">{date.date()}</span>
        <span className="month-calendar-day-indicators" aria-hidden="true">
          {indicators.map((indicator) => (
            <span key={indicator} className="month-calendar-day-indicator">
              {indicator}
            </span>
          ))}
          {holidayIndicators.map((indicator) => (
            <span
              key={indicator.key}
              className="month-calendar-day-indicator"
              title={indicator.title}
            >
              {indicator.emoji}
            </span>
          ))}
          {workLocation && shiftBadge?.isWorking && (
            <span
              className="month-calendar-day-indicator month-calendar-work-location"
              title={workLocationLabel}
            >
              <i className={clsx("bi", WORK_LOCATION_ICON_CLASS[workLocation.location])}></i>
            </span>
          )}
        </span>
        {onDayContextMenu && (
          <button
            type="button"
            className="month-calendar-add-btn"
            tabIndex={-1}
            aria-label={`Add event on ${date.format("MMMM D, YYYY")}`}
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              onDayContextMenu(
                date,
                rect.left + rect.width / 2,
                rect.top + rect.height / 2,
                e.currentTarget,
              );
            }}
          >
            <i className="bi bi-plus" aria-hidden="true"></i>
          </button>
        )}
      </div>
      <div className="month-calendar-events">
        {/* Shift badge - shows working schedule when provided */}
        {shiftBadge && (
          <div
            className={clsx(
              "month-calendar-shift-badge",
              shiftBadge.isWorking ? "text-bg-success" : "text-bg-secondary",
            )}
            title={shiftBadge.label}
          >
            {shiftBadge.code}
          </div>
        )}
        {visibleEvents.map((dayEvent) => renderEventButton(dayEvent))}
        {hiddenCount > 0 && (
          <>
            <button
              type="button"
              className="month-calendar-event-overflow month-calendar-event-overflow-btn"
              onClick={(eventClick) => {
                eventClick.stopPropagation();
                setIsOverflowExpanded((current) => !current);
              }}
              aria-expanded={isOverflowExpanded}
              aria-label={`${isOverflowExpanded ? "Hide" : "Show"} ${hiddenCount} more ${hiddenCount === 1 ? "event" : "events"}`}
            >
              {isOverflowExpanded ? `-${hiddenCount} less` : `+${hiddenCount} more`}
            </button>
            {isOverflowExpanded && (
              <div className="month-calendar-overflow-list">
                {hiddenEvents.map((dayEvent) => renderEventButton(dayEvent))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
