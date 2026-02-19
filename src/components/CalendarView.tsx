import { useEffect, useMemo, useRef, useState } from "react";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import type { Dayjs } from "dayjs";
import type { HdayEvent } from "../lib/hday/types";
import { buildPreviewLine, normalizeEventFlags } from "../lib/hday/parser";
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
import {
  buildEventFormState,
  isEventFormDirty,
  serializeEventFormState,
  serializeEventFormStateFromEvent,
} from "../utils/eventFormState";
import { useEventForm } from "../hooks/useEventForm";
import { MonthCalendar } from "./calendar/MonthCalendar";
import { CalendarLegend } from "./calendar/CalendarLegend";
import { EventModal } from "./EventModal";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { SetupActionButton } from "./shared/SetupActionButton";
import {
  TYPE_FLAG_OPTIONS,
  TIME_LOCATION_FLAG_OPTIONS,
  TYPE_FLAGS_AS_EVENT_FLAGS,
  TIME_LOCATION_FLAGS_AS_EVENT_FLAGS,
  DEFAULT_WEEKDAY,
} from "../data/timeoffConstants";

interface CalendarViewProps {
  myTeam: number | null;
  onChangeSchedule?: () => void;
  onChangeTeam?: () => void;
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
 * @param props.onChangeSchedule - Optional callback to open schedule selector
 * @param props.onChangeTeam - Optional callback to open team selector
 * @param props.onOpenScheduleTab - Optional callback to open Schedule tab
 */
export function CalendarView({
  myTeam,
  onChangeSchedule,
  onChangeTeam,
  onOpenScheduleTab,
}: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState<Dayjs>(dayjs());
  const { events, addEvent, updateEvent, deleteEvent } = useEventStore();
  const { scheduleType, settings } = useSettings();
  const toast = useToast();
  const timeOffEnabled = settings.enableTimeOff;
  const calendarEvents = useMemo(() => (timeOffEnabled ? events : []), [timeOffEnabled, events]);

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

  const {
    eventType,
    eventWeekday,
    eventStart,
    eventEnd,
    eventTitle,
    eventFlags,
    startDateError,
    endDateError,
    setEventType,
    setEventWeekday,
    setEventStart,
    setEventEnd,
    setEventTitle,
    resetForm,
    validateForm,
    prefillFormFromEvent,
    handleTypeFlagChange,
    handleTimeFlagChange,
  } = useEventForm();

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState(-1);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [initialFormState, setInitialFormState] = useState("");

  // Refs
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!timeOffEnabled) {
      setShowEventModal(false);
      setShowDeleteConfirm(false);
    }
  }, [timeOffEnabled]);

  const isFormDirty = isEventFormDirty(
    buildEventFormState(eventType, eventWeekday, eventStart, eventEnd, eventTitle, eventFlags),
    initialFormState,
  );

  const handleAddEventForDate = (date: Dayjs) => {
    if (!timeOffEnabled) return;
    resetForm();
    setEditIndex(-1);
    setModalMode("add");
    setEventType("range");
    setEventStart(date.format("YYYY/MM/DD"));
    setEventEnd(date.format("YYYY/MM/DD"));
    setInitialFormState(
      serializeEventFormState({
        type: "range",
        weekday: DEFAULT_WEEKDAY,
        start: date.format("YYYY/MM/DD"),
        end: date.format("YYYY/MM/DD"),
        title: "",
        flags: [],
      }),
    );
    setShowEventModal(true);
  };

  const loadEventIntoForm = (event: HdayEvent, mode: "view" | "edit") => {
    prefillFormFromEvent(event);
    setInitialFormState(serializeEventFormStateFromEvent(event, DEFAULT_WEEKDAY));
    setModalMode(mode);
  };

  const handleOpenViewModal = (index: number) => {
    if (!timeOffEnabled) return;
    const event = events[index];
    if (!event) return;

    setEditIndex(index);
    loadEventIntoForm(event, "view");
    setShowEventModal(true);
  };

  const handleOpenEditModal = (index: number) => {
    if (!timeOffEnabled) return;
    const event = events[index];
    if (!event) return;

    setEditIndex(index);
    loadEventIntoForm(event, "edit");
    setShowEventModal(true);
  };

  const handleSwitchToEdit = () => {
    if (!timeOffEnabled) return;
    setInitialFormState(
      serializeEventFormState(
        buildEventFormState(eventType, eventWeekday, eventStart, eventEnd, eventTitle, eventFlags),
      ),
    );
    setModalMode("edit");
  };

  const handleCancelEditMode = () => {
    if (!timeOffEnabled || editIndex < 0) return;

    const event = events[editIndex];
    if (!event) return;

    loadEventIntoForm(event, "view");
  };

  const handleResetForm = () => {
    if (isFormDirty) {
      setShowResetConfirm(true);
      return;
    }
    resetForm();
  };

  const handleConfirmResetForm = () => {
    resetForm();
    setShowResetConfirm(false);
  };

  const handleSubmitEvent = () => {
    if (!timeOffEnabled) return;
    if (!validateForm()) {
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
      toast.showSuccess("Event updated successfully", "bi-pencil-fill");
    } else {
      addEvent(newEvent);
      toast.showSuccess("Event added successfully");
    }

    setShowEventModal(false);
    setShowResetConfirm(false);
    resetForm();
  };

  const handleDeleteClick = (index: number) => {
    if (!timeOffEnabled) return;
    setDeleteIndex(index);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = () => {
    if (!timeOffEnabled) return;
    if (deleteIndex >= 0) {
      deleteEvent(deleteIndex);
      toast.showSuccess("Event deleted successfully", "bi-trash");
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

      // Determine if this is actually a working day
      const actuallyWorking = isWorkingDay(
        date,
        effectiveTeam,
        scheduleType,
        calendarEvents,
        publicHolidayMap,
      );

      // Additional context for display
      let displayLabel = shift.name;
      if (!actuallyWorking && shift.code !== "O") {
        if (hasTimeOffEvent(date, calendarEvents)) {
          displayLabel = "Time Off";
        } else if (isPublicHolidayForShift(date, effectiveTeam, scheduleType, publicHolidayMap)) {
          displayLabel = "Public Holiday";
        }
      }

      return {
        code: shift.displayCode,
        label: displayLabel,
        isWorking: actuallyWorking,
      };
    };
  }, [myTeam, scheduleType, calendarEvents, publicHolidayMap]);

  const handleHideEventModal = () => {
    setShowEventModal(false);
    setShowResetConfirm(false);
  };

  const previewLine = buildPreviewLine({
    eventType,
    start: eventStart,
    end: eventEnd,
    title: eventTitle,
    flags: eventFlags,
    weekday: eventWeekday,
  });

  return (
    <div className="py-3">
      <Card>
        <Card.Header className="d-flex flex-wrap align-items-center justify-content-between gap-2">
          <span className="fw-semibold">
            <i className="bi bi-calendar3 me-2" aria-hidden="true"></i>
            My Working Calendar
          </span>
          {!getShiftForDate ? (
            <small className="text-muted">
              <i className="bi bi-info-circle me-1" aria-hidden="true"></i>
              Select your schedule to see your working calendar
            </small>
          ) : (
            <CalendarLegend showEventTypes={timeOffEnabled} />
          )}
        </Card.Header>
        <Card.Body>
          {!getShiftForDate ? (
            <div className="text-center py-5">
              <div className="mb-4">
                <i className="bi bi-calendar3 fs-1 text-muted mb-3 d-inline-block"></i>
              </div>
              <h4>Welcome to Your Working Calendar!</h4>
              <p className="text-muted mb-4">
                This calendar shows your working schedule with shift patterns
                {timeOffEnabled ? ", time-off events," : ""} and public holidays all in one place.
              </p>
              <p className="text-muted mb-3">
                {!scheduleType
                  ? "To get started, please select your work schedule (5-shift, 9-5, etc.) in Settings."
                  : "To see your personalized calendar, please select your team in Settings."}
              </p>
              <SetupActionButton onChangeSchedule={onChangeSchedule} onChangeTeam={onChangeTeam} />
              <p className="text-muted mt-4 mb-3">
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
              events={calendarEvents}
              month={currentMonth}
              publicHolidays={publicHolidayMap}
              schoolHolidays={schoolHolidayMap}
              paydayMap={paydayMapForYear}
              onMonthChange={setCurrentMonth}
              onAddEvent={handleAddEventForDate}
              onViewEvent={handleOpenViewModal}
              onEditEvent={handleOpenEditModal}
              onDeleteEvent={handleDeleteClick}
              allowEventActions={timeOffEnabled}
              getShiftForDate={getShiftForDate}
            />
          )}
        </Card.Body>
      </Card>

      {timeOffEnabled && (
        <>
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
            onHide={handleHideEventModal}
            onEntered={() => formRef.current?.focus()}
            onEventTypeChange={setEventType}
            onEventTitleChange={setEventTitle}
            onEventWeekdayChange={setEventWeekday}
            onStartDateChange={setEventStart}
            onEndDateChange={setEventEnd}
            onTypeFlagChange={handleTypeFlagChange}
            onTimeFlagChange={handleTimeFlagChange}
            onResetForm={handleResetForm}
            onSubmit={handleSubmitEvent}
            onSwitchToEdit={handleSwitchToEdit}
            onCancelEditMode={handleCancelEditMode}
          />

          <ConfirmationDialog
            isOpen={showResetConfirm}
            title="Reset Event Form"
            message="You have unsaved changes. Resetting the form will clear your edits."
            confirmLabel="Reset"
            cancelLabel="Keep Editing"
            variant="warning"
            onConfirm={handleConfirmResetForm}
            onCancel={() => setShowResetConfirm(false)}
          />

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
        </>
      )}
    </div>
  );
}
