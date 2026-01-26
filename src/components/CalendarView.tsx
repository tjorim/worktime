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
 */
export function CalendarView({ myTeam, onOpenSettings }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState<Dayjs>(dayjs());
  const { events, addEvent, updateEvent, deleteEvent } = useEventStore();
  const { scheduleType } = useSettings();
  const toast = useToast();

  // Fetch holidays for the current month's year
  const { publicHolidayMap } = usePublicHolidays(currentMonth.year());
  const { schoolHolidayMap } = useSchoolHolidays(currentMonth.year());

  // Get payday information for the year
  const paydayMapForYear = useMemo(
    () => getMonthlyPaydayMap(currentMonth.year(), publicHolidayMap),
    [currentMonth, publicHolidayMap],
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
      const actuallyWorking = isWorkingDay(date, effectiveTeam, scheduleType, events, publicHolidayMap);

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
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="64"
                  height="64"
                  fill="currentColor"
                  className="text-muted mb-3"
                  viewBox="0 0 16 16"
                >
                  <path d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5M1 4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4z" />
                </svg>
              </div>
              <h4>Welcome to Your Working Calendar!</h4>
              <p className="text-muted mb-4">
                This calendar shows your working schedule with shift patterns, time-off events, and
                public holidays all in one place.
              </p>
              <p className="mb-4">
                To get started, please select your work schedule (5-shift, 9-5, etc.) in Settings.
              </p>
              <div className="d-flex gap-2 justify-content-center">
                {onOpenSettings && (
                  <Button variant="primary" size="lg" onClick={onOpenSettings}>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      fill="currentColor"
                      className="me-2"
                      viewBox="0 0 16 16"
                    >
                      <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492M5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0" />
                      <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115z" />
                    </svg>
                    Open Settings
                  </Button>
                )}
              </div>
              <div className="mt-4 text-muted small">
                <p className="mb-1">
                  <strong>Tip:</strong> You can also check the Schedule and Transfers tabs to
                  explore shift patterns before selecting your team.
                </p>
              </div>
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
        message="Are you sure you want to delete this event? This action can be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
