import { useMemo, useRef, useState } from "react";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import type { Dayjs } from "dayjs";
import type { EventFlag, HdayEvent, TimeLocationFlag, TypeFlag } from "../lib/hday/types";
import { buildPreviewLine, normalizeEventFlags } from "../lib/hday/parser";
import { isValidDate } from "../lib/hday/validation";
import { useEventStore } from "../contexts/EventStoreContext";
import { useSettings } from "../contexts/SettingsContext";
import { useToast } from "../contexts/ToastContext";
import { dayjs } from "../utils/dateTimeUtils";
import { usePublicHolidays } from "../hooks/usePublicHolidays";
import { useSchoolHolidays } from "../hooks/useSchoolHolidays";
import { getMonthlyPaydayMap } from "../utils/paydayUtils";
import { calculateShift } from "../utils/shiftCalculations";
import { SCHEDULE_OPTIONS } from "../data/rosters";
import { isWorkingDay, hasTimeOffEvent, isPublicHolidayForShift } from "../utils/workingDayUtils";
import { getEffectiveTeam } from "../utils/scheduleUtils";
import { MonthCalendar } from "./calendar/MonthCalendar";
import { EventModal } from "./EventModal";
import { ConfirmationDialog } from "./ConfirmationDialog";

const TYPE_FLAG_OPTIONS: Array<[TypeFlag | "none", string]> = [
  ["none", "Holiday (default)"],
  ["business", "Business trip"],
  ["course", "Training/Course"],
  ["in", "In office"],
  ["weekend", "Weekend"],
  ["birthday", "Birthday"],
  ["ill", "Sick leave"],
  ["other", "Other"],
];

const TIME_LOCATION_FLAG_OPTIONS: Array<[TimeLocationFlag | "none", string]> = [
  ["none", "Full day"],
  ["half_am", "AM (half day)"],
  ["half_pm", "PM (half day)"],
  ["onsite", "Onsite"],
  ["no_fly", "No fly"],
  ["can_fly", "Can fly"],
];

const TYPE_FLAGS_AS_EVENT_FLAGS: readonly EventFlag[] = TYPE_FLAG_OPTIONS.map(
  ([flag]) => flag,
).filter((f) => f !== "none") as EventFlag[];

const TIME_LOCATION_FLAGS_AS_EVENT_FLAGS: readonly EventFlag[] = TIME_LOCATION_FLAG_OPTIONS.map(
  ([flag]) => flag,
).filter((f) => f !== "none") as EventFlag[];

const DEFAULT_WEEKDAY = 1;

interface CalendarViewProps {
  myTeam: number | null;
  onOpenSettings?: () => void;
  onOpenScheduleTab?: () => void;
}

/**
 * CalendarView displays a monthly calendar showing the user's working schedule
 * with full event management capabilities.
 *
 * This view integrates:
 * - User's roster schedule (shift pattern)
 * - Time-off events from event store with add/edit/delete
 * - Public holidays (with shift-specific logic)
 * - School holidays
 * - Paydays
 *
 * Key Features:
 * - Shows working vs. non-working days based on schedule
 * - Full event management (click to add, view, edit, delete)
 * - Displays shift information and time-off events together
 *
 * @param props.myTeam - The user's team number from onboarding or null
 * @param props.onOpenSettings - Optional callback to open settings dialog
 * @param props.onOpenScheduleTab - Optional callback to open Schedule tab
 */
export function CalendarView({ myTeam, onOpenSettings, onOpenScheduleTab }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState<Dayjs>(dayjs());
  const { events, addEvent, updateEvent, deleteEvent } = useEventStore();
  const { scheduleType } = useSettings();
  const toast = useToast();

  // Fetch holidays for the current month's year
  const currentYear = currentMonth.year();
  const { publicHolidayMap } = usePublicHolidays(currentYear);
  const { schoolHolidayMap } = useSchoolHolidays(currentYear);

  // Get payday information for the year
  const paydayMapForYear = useMemo(
    () => getMonthlyPaydayMap(currentYear, publicHolidayMap),
    [currentYear, publicHolidayMap],
  );

  // Modal state
  const [showEventModal, setShowEventModal] = useState(false);
  const [editIndex, setEditIndex] = useState(-1);
  const [modalMode, setModalMode] = useState<"add" | "edit" | "view">("add");

  // Event form state
  const [eventType, setEventType] = useState<"range" | "weekly">("range");
  const [eventWeekday, setEventWeekday] = useState(DEFAULT_WEEKDAY);
  const [eventStart, setEventStart] = useState("");
  const [eventEnd, setEventEnd] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [eventFlags, setEventFlags] = useState<EventFlag[]>([]);

  // Validation errors
  const [startDateError, setStartDateError] = useState("");
  const [endDateError, setEndDateError] = useState("");

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState(-1);

  // Refs
  const formRef = useRef<HTMLDivElement>(null);

  const resetForm = () => {
    setEventType("range");
    setEventWeekday(DEFAULT_WEEKDAY);
    setEventStart("");
    setEventEnd("");
    setEventTitle("");
    setEventFlags([]);
    setStartDateError("");
    setEndDateError("");
  };

  const prefillFormFromEvent = (event: HdayEvent) => {
    if (event.type === "range") {
      setEventType("range");
      setEventStart(event.start || "");
      setEventEnd(event.end || "");
      setEventWeekday(DEFAULT_WEEKDAY);
    } else if (event.type === "weekly") {
      setEventType("weekly");
      setEventWeekday(event.weekday || DEFAULT_WEEKDAY);
      setEventStart("");
      setEventEnd("");
    }
    setEventTitle(event.title || "");
    setEventFlags(event.flags || []);
    setStartDateError("");
    setEndDateError("");
  };

  const handleAddEventForDate = (date: Dayjs) => {
    resetForm();
    setEditIndex(-1);
    setModalMode("add");
    setEventType("range");
    setEventStart(date.format("YYYY/MM/DD"));
    setEventEnd(date.format("YYYY/MM/DD"));
    setShowEventModal(true);
  };

  const handleOpenViewModal = (index: number) => {
    const event = events[index];
    if (!event) return;

    setEditIndex(index);
    prefillFormFromEvent(event);
    setModalMode("view");
    setShowEventModal(true);
  };

  const handleOpenEditModal = (index: number) => {
    const event = events[index];
    if (!event) return;

    setEditIndex(index);
    prefillFormFromEvent(event);
    setModalMode("edit");
    setShowEventModal(true);
  };

  const handleSwitchToEdit = () => {
    setModalMode("edit");
  };

  const handleTypeFlagChange = (flag: TypeFlag | "none") => {
    if (flag === "none") {
      setEventFlags((prev) => prev.filter((f) => !TYPE_FLAGS_AS_EVENT_FLAGS.includes(f)));
    } else {
      setEventFlags((prev) => {
        const filtered = prev.filter((f) => !TYPE_FLAGS_AS_EVENT_FLAGS.includes(f));
        return [...filtered, flag];
      });
    }
  };

  const handleTimeFlagChange = (flag: TimeLocationFlag | "none") => {
    if (flag === "none") {
      setEventFlags((prev) => prev.filter((f) => !TIME_LOCATION_FLAGS_AS_EVENT_FLAGS.includes(f)));
    } else {
      setEventFlags((prev) => {
        const filtered = prev.filter((f) => !TIME_LOCATION_FLAGS_AS_EVENT_FLAGS.includes(f));
        return [...filtered, flag];
      });
    }
  };

  const handleSubmitEvent = () => {
    // Validate dates with same logic as TimeOffView
    let valid = true;

    if (eventType === "range") {
      // Validate start date
      if (!eventStart) {
        setStartDateError("Start date is required");
        valid = false;
      } else if (!isValidDate(eventStart)) {
        setStartDateError("Invalid date (e.g., Feb 30 or April 31)");
        valid = false;
      } else {
        setStartDateError("");
      }

      // Validate end date
      if (eventEnd && !isValidDate(eventEnd)) {
        setEndDateError("Invalid date (e.g., Feb 30 or April 31)");
        valid = false;
      } else if (eventEnd && eventStart && dayjs(eventEnd).isBefore(dayjs(eventStart))) {
        setEndDateError("End date must be after start date");
        valid = false;
      } else {
        setEndDateError("");
      }
    }

    if (!valid) {
      toast.showError("Please fix validation errors before saving");
      return;
    }

    const normalizedFlags = normalizeEventFlags(eventFlags);

    const newEvent: HdayEvent =
      eventType === "range"
        ? {
            type: "range",
            start: eventStart,
            end: eventEnd || eventStart,
            title: eventTitle || undefined,
            flags: normalizedFlags.length > 0 ? normalizedFlags : undefined,
            raw: buildPreviewLine({
              eventType,
              start: eventStart,
              end: eventEnd,
              title: eventTitle,
              flags: normalizedFlags,
              weekday: eventWeekday,
            }),
          }
        : {
            type: "weekly",
            weekday: eventWeekday,
            title: eventTitle || undefined,
            flags: normalizedFlags.length > 0 ? normalizedFlags : undefined,
            raw: buildPreviewLine({
              eventType,
              start: eventStart,
              end: eventEnd,
              title: eventTitle,
              flags: normalizedFlags,
              weekday: eventWeekday,
            }),
          };

    if (modalMode === "edit" && editIndex >= 0) {
      updateEvent(editIndex, newEvent);
      toast.showSuccess("Event updated successfully", "✏️");
    } else {
      addEvent(newEvent);
      toast.showSuccess("Event added successfully", "✅");
    }

    setShowEventModal(false);
    resetForm();
  };

  const handleDeleteClick = (index: number) => {
    setDeleteIndex(index);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = () => {
    if (deleteIndex >= 0) {
      deleteEvent(deleteIndex);
      toast.showSuccess("Event deleted successfully", "🗑️");
    }
    setShowDeleteConfirm(false);
    setDeleteIndex(-1);
  };

  // Get shift calculation function for the user's team and schedule
  // Uses getEffectiveTeam to handle single-user schedules (like "9-5")
  const getShiftForDate = useMemo(() => {
    if (!scheduleType) return undefined;

    // Get effective team - handles single-user schedules where myTeam is null
    const effectiveTeam = getEffectiveTeam(myTeam, scheduleType);
    if (!effectiveTeam) return undefined;

    const roster = SCHEDULE_OPTIONS.find((opt) => opt.value === scheduleType);
    if (!roster) return undefined;

    return (date: Dayjs) => {
      const shift = calculateShift(date, effectiveTeam, scheduleType);
      const shiftConfig = roster.shiftConfig.shiftDisplayOverrides?.[shift.code];

      // Determine if this is actually a working day
      const actuallyWorking = isWorkingDay(
        date,
        effectiveTeam,
        scheduleType,
        events,
        publicHolidayMap,
      );

      // Additional context for display
      let displayLabel = shiftConfig?.displayName || shift.name;
      if (!actuallyWorking && shift.code !== "O") {
        if (hasTimeOffEvent(date, events)) {
          displayLabel = "Time Off";
        } else if (isPublicHolidayForShift(date, effectiveTeam, scheduleType, publicHolidayMap)) {
          displayLabel = "Public Holiday";
        }
      }

      return {
        code: shiftConfig?.displayCode || shift.code,
        label: displayLabel,
        isWorking: actuallyWorking,
      };
    };
  }, [myTeam, scheduleType, events, publicHolidayMap]);

  const previewLine = buildPreviewLine({
    eventType,
    start: eventStart,
    end: eventEnd,
    title: eventTitle,
    flags: eventFlags,
    weekday: eventWeekday,
  });

  return (
    <div className="calendar-view py-3">
      <Card>
        <Card.Body>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <Card.Title className="mb-0">
              <i className="bi bi-calendar3 me-2" aria-hidden="true"></i>
              My Working Calendar
            </Card.Title>
            {!getShiftForDate && (
              <small className="text-muted">
                <i className="bi bi-info-circle me-1"></i>
                Select your schedule to see your working calendar
              </small>
            )}
          </div>

          {!getShiftForDate ? (
            <div className="text-center py-5">
              <div className="mb-4">
                <i className="bi bi-calendar3 fs-1 text-muted mb-3 d-inline-block"></i>
              </div>
              <h4>Welcome to Your Working Calendar!</h4>
              <p className="text-muted mb-4">
                This calendar shows your working schedule with shift patterns, time-off events, and
                public holidays all in one place.
              </p>
              <p className="mb-4">
                To get started, please select your work schedule (5-shift, 9-5, etc.) in Settings.
              </p>
              {onOpenSettings && (
                <div className="mb-3">
                  <Button variant="primary" onClick={onOpenSettings}>
                    <i className="bi bi-gear me-2" aria-hidden="true"></i>
                    Choose Schedule
                  </Button>
                </div>
              )}
              <p className="text-muted mb-3">
                You can still explore the Today and Week schedule views before making a selection.
              </p>
              {onOpenScheduleTab && (
                <div>
                  <Button variant="outline-secondary" onClick={onOpenScheduleTab}>
                    <i className="bi bi-calendar-week me-2" aria-hidden="true"></i>
                    View Schedule
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <MonthCalendar
              events={events}
              month={currentMonth}
              publicHolidays={publicHolidayMap}
              schoolHolidays={schoolHolidayMap}
              paydayMap={paydayMapForYear}
              onMonthChange={setCurrentMonth}
              onAddEvent={handleAddEventForDate}
              onViewEvent={handleOpenViewModal}
              onEditEvent={handleOpenEditModal}
              onDeleteEvent={handleDeleteClick}
              getShiftForDate={getShiftForDate}
            />
          )}
        </Card.Body>
      </Card>

      {/* Event Modal for Add/Edit/View */}
      <EventModal
        show={showEventModal}
        mode={modalMode}
        formRef={formRef}
        eventType={eventType}
        eventWeekday={eventWeekday}
        eventStart={eventStart}
        eventEnd={eventEnd}
        eventTitle={eventTitle}
        eventFlags={eventFlags}
        startDateError={startDateError}
        endDateError={endDateError}
        previewLine={previewLine}
        typeFlagOptions={TYPE_FLAG_OPTIONS}
        timeLocationFlagOptions={TIME_LOCATION_FLAG_OPTIONS}
        typeFlagsAsEventFlags={TYPE_FLAGS_AS_EVENT_FLAGS}
        timeLocationFlagsAsEventFlags={TIME_LOCATION_FLAGS_AS_EVENT_FLAGS}
        onHide={() => setShowEventModal(false)}
        onEntered={() => formRef.current?.focus()}
        onEventTypeChange={setEventType}
        onEventTitleChange={setEventTitle}
        onEventWeekdayChange={setEventWeekday}
        onStartDateChange={setEventStart}
        onEndDateChange={setEventEnd}
        onTypeFlagChange={handleTypeFlagChange}
        onTimeFlagChange={handleTimeFlagChange}
        onResetForm={resetForm}
        onSubmit={handleSubmitEvent}
        onSwitchToEdit={handleSwitchToEdit}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteConfirm}
        title="Delete Event"
        message="Are you sure you want to delete this event? You can undo this from the Time Off tab."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
