import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import type { Dayjs } from "dayjs";
import { normalizeEventFlags } from "@/lib/hday/flags";
import { buildPreviewLine } from "@/lib/hday/serializer";
import {
  buildTimeOffEntryForRange,
  createWeeklyTimeOffEntry,
  getEntryTimeFlagFromDisplayFlags,
  getEntryTypeFromDisplayFlags,
} from "@/lib/timeOff/codecs";
import { useEventStore } from "@/contexts/EventStoreContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useToast } from "@/contexts/ToastContext";
import { dayjs } from "@/utils/dateTimeUtils";
import { usePublicHolidays } from "@/hooks/usePublicHolidays";
import { useSchoolHolidays } from "@/hooks/useSchoolHolidays";
import { useWorkLocationStorage } from "@/hooks/useWorkLocationStorage";
import { usePaydates } from "@/hooks/usePaydates";
import { useLongWeekend } from "@/hooks/useLongWeekend";
import { calculateShift } from "@/utils/shiftCalculations";
import { SCHEDULE_OPTIONS } from "@/data/rosters";
import { isWorkingDay, hasTimeOffEvent, isPublicHolidayForShift } from "@/utils/workingDayUtils";
import { getEffectiveTeam } from "@/utils/scheduleUtils";
import {
  buildEventFormState,
  isEventFormDirty,
  serializeEventFormState,
  serializeEventFormStateFromEntry,
} from "@/utils/eventFormState";
import { useEventForm } from "@/hooks/useEventForm";
import { MonthCalendar } from "./calendar/MonthCalendar";
import { CalendarLegend } from "./calendar/CalendarLegend";
import { LocationYearSummary } from "./calendar/LocationYearSummary";
import { OtherLocationModal } from "./calendar/OtherLocationModal";
import * as m from "@/paraglide/messages.js";
import { EventModal } from "./EventModal";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { EmptyState } from "./shared/EmptyState";
import { SetupActionButton } from "./shared/SetupActionButton";
import {
  getTypeFlagOptions,
  getTimeLocationFlagOptions,
  TYPE_FLAGS_AS_EVENT_FLAGS,
  TIME_LOCATION_FLAGS_AS_EVENT_FLAGS,
  DEFAULT_WEEKDAY,
} from "@/data/timeoffConstants";
import type { WorkLocation } from "@/types/workLocation";
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
  const { entries, addEntries, updateEntry, deleteEntry } = useEventStore();
  const { scheduleType, settings } = useSettings();
  const toast = useToast();
  const timeOffEnabled = settings.enableTimeOff;
  const calendarEntries = useMemo(() => (timeOffEnabled ? entries : []), [timeOffEnabled, entries]);

  // Fetch holidays for the current month's year
  const currentYear = currentMonth.year();
  const { publicHolidayMap } = usePublicHolidays(currentYear);
  const { schoolHolidayMap } = useSchoolHolidays(currentYear);
  const { workLocationMap, setLocationForDate, clearLocationForDate } =
    useWorkLocationStorage(currentYear);

  // Fetch payday dates from the backend
  const { paydayMap: paydayMapForYear } = usePaydates(currentYear);

  // Fetch long weekend data (only for standard 9-5 schedule)
  const { longWeekendMap } = useLongWeekend(
    currentYear,
    settings.maxBridgeDays,
    undefined, // default country (NL)
    scheduleType === "9-5",
  );

  // Modal state
  const [showEventModal, setShowEventModal] = useState(false);
  const [editEntryId, setEditEntryId] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<"add" | "edit" | "view">("add");

  // Other location modal state
  const [showOtherLocationModal, setShowOtherLocationModal] = useState(false);
  const [otherLocationDate, setOtherLocationDate] = useState<Dayjs>(dayjs());
  // Annual summary toggle
  const [showAnnualSummary, setShowAnnualSummary] = useState(false);

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
    initFormForDate,
    prefillFormFromEntry,
    handleTypeFlagChange,
    handleTimeFlagChange,
  } = useEventForm();

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null);
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
    setEditEntryId(null);
    setModalMode("add");
    setInitialFormState(initFormForDate(date));
    setShowEventModal(true);
  };

  const loadEntryIntoForm = (entryId: string, mode: "view" | "edit") => {
    const entry = entries.find((currentEntry) => currentEntry.id === entryId);
    if (!entry) return;
    prefillFormFromEntry(entry);
    setInitialFormState(serializeEventFormStateFromEntry(entry, DEFAULT_WEEKDAY));
    setModalMode(mode);
  };

  const handleOpenViewModal = (eventId: string) => {
    if (!timeOffEnabled) return;
    setEditEntryId(eventId);
    loadEntryIntoForm(eventId, "view");
    setShowEventModal(true);
  };

  const handleOpenEditModal = (eventId: string) => {
    if (!timeOffEnabled) return;
    setEditEntryId(eventId);
    loadEntryIntoForm(eventId, "edit");
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
    if (!timeOffEnabled || !editEntryId) return;
    loadEntryIntoForm(editEntryId, "view");
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
      toast.showError(m.calendar_fix_validation_errors());
      return;
    }

    const normalizedFlags = normalizeEventFlags(eventFlags);

    const nextEntry =
      eventType === "weekly"
        ? createWeeklyTimeOffEntry({
            weekday: eventWeekday,
            note: eventTitle,
            entryType: getEntryTypeFromDisplayFlags(normalizedFlags),
            entryFlag: getEntryTimeFlagFromDisplayFlags(normalizedFlags),
          })
        : buildTimeOffEntryForRange({
            start: eventStart.replace(/\//g, "-"),
            end: (eventEnd || eventStart).replace(/\//g, "-"),
            note: eventTitle,
            entryType: getEntryTypeFromDisplayFlags(normalizedFlags),
            entryFlag: getEntryTimeFlagFromDisplayFlags(normalizedFlags),
          });

    if (modalMode === "edit" && editEntryId) {
      updateEntry(editEntryId, nextEntry);
      toast.showSuccess(m.calendar_event_updated(), "bi-pencil-fill");
    } else {
      addEntries([nextEntry]);
      toast.showSuccess(m.calendar_event_added());
    }

    setShowEventModal(false);
    setShowResetConfirm(false);
    resetForm();
  };

  const handleDeleteClick = (eventId: string) => {
    if (!timeOffEnabled) return;
    setDeleteEntryId(eventId);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = () => {
    if (!timeOffEnabled) return;
    if (deleteEntryId) {
      deleteEntry(deleteEntryId);
      toast.showSuccess(m.calendar_event_deleted(), "bi-trash");
    }
    setShowDeleteConfirm(false);
    setDeleteEntryId(null);
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
        calendarEntries,
        publicHolidayMap,
      );

      // Additional context for display
      let displayLabel = shift.name;
      if (!actuallyWorking && shift.code !== "O") {
        if (hasTimeOffEvent(date, calendarEntries)) {
          displayLabel = m.calendar_time_off();
        } else if (isPublicHolidayForShift(date, effectiveTeam, scheduleType, publicHolidayMap)) {
          displayLabel = m.calendar_public_holiday();
        }
      }

      return {
        code: shift.displayCode,
        label: displayLabel,
        isWorking: actuallyWorking,
      };
    };
  }, [myTeam, scheduleType, calendarEntries, publicHolidayMap]);

  // Cross-border tracking feature flag
  const crossBorderEnabled = settings.enableCrossBorderTracking;
  // Show each work-location action only when the feature is on and its country is configured
  const showHomeLocationAction = crossBorderEnabled && !!settings.homeCountry;
  const showOfficeLocationAction = crossBorderEnabled && !!settings.officeCountry;
  const showOtherLocationAction = crossBorderEnabled;

  const handleSetWorkLocation = useCallback(
    (date: Dayjs, location: WorkLocation | null) => {
      if (location === null) {
        clearLocationForDate(date);
      } else {
        const success = setLocationForDate(date, location);
        if (!success) {
          toast.showError(m.calendar_configure_country());
        }
      }
    },
    [clearLocationForDate, setLocationForDate, toast],
  );

  const handleSetOtherLocation = useCallback((date: Dayjs) => {
    setOtherLocationDate(date);
    setShowOtherLocationModal(true);
  }, []);

  const handleOtherLocationConfirm = useCallback(
    (countryCode: string, label?: string) => {
      const success = setLocationForDate(otherLocationDate, "other", { countryCode, label });
      if (!success) {
        toast.showError(m.calendar_could_not_save_location());
        return;
      }
      setShowOtherLocationModal(false);
    },
    [setLocationForDate, otherLocationDate, toast],
  );

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
            {m.calendar_heading()}
          </span>
          {!getShiftForDate ? (
            <small className="text-muted">
              <i className="bi bi-info-circle me-1" aria-hidden="true"></i>
              {m.calendar_select_schedule_hint()}
            </small>
          ) : (
            <div className="d-flex align-items-center gap-2">
              {crossBorderEnabled && (
                <Button
                  size="sm"
                  variant={showAnnualSummary ? "secondary" : "outline-secondary"}
                  onClick={() => setShowAnnualSummary((prev) => !prev)}
                  aria-pressed={showAnnualSummary}
                  title={m.calendar_annual_summary_toggle_title()}
                >
                  <i className="bi bi-list-columns me-1" aria-hidden="true"></i>
                  {m.calendar_annual_summary()}
                </Button>
              )}
              <CalendarLegend showEventTypes={timeOffEnabled} />
            </div>
          )}
        </Card.Header>
        <Card.Body>
          {!getShiftForDate ? (
            <div className="text-center">
              <EmptyState
                icon="bi-calendar3"
                title={m.calendar_welcome_title()}
                iconSize="2.5rem"
                description={
                  <>
                    {m.calendar_empty_state_description({
                      timeOff: timeOffEnabled ? m.calendar_empty_state_with_timeoff() : "",
                    })}
                    <span className="d-block mt-2">
                      {!scheduleType
                        ? m.calendar_empty_state_pick_schedule()
                        : m.calendar_empty_state_pick_team()}
                    </span>
                  </>
                }
              />
              <SetupActionButton onChangeSchedule={onChangeSchedule} onChangeTeam={onChangeTeam} />
              <p className="text-muted mt-4 mb-3 small">{m.calendar_empty_state_footer()}</p>
              {onOpenScheduleTab && (
                <div>
                  <Button size="sm" variant="outline-secondary" onClick={onOpenScheduleTab}>
                    <i className="bi bi-calendar-week me-2" aria-hidden="true"></i>
                    {m.calendar_view_schedule_btn()}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <>
              {crossBorderEnabled && showAnnualSummary && (
                <div className="mb-3">
                  <LocationYearSummary year={currentYear} workLocationMap={workLocationMap} />
                </div>
              )}
              <MonthCalendar
                entries={calendarEntries}
                month={currentMonth}
                publicHolidays={publicHolidayMap}
                schoolHolidays={schoolHolidayMap}
                paydayMap={paydayMapForYear}
                longWeekendMap={longWeekendMap}
                workLocationMap={workLocationMap}
                onMonthChange={setCurrentMonth}
                onAddEvent={handleAddEventForDate}
                onViewEvent={handleOpenViewModal}
                onEditEvent={handleOpenEditModal}
                onDeleteEvent={handleDeleteClick}
                onSetWorkLocation={handleSetWorkLocation}
                onSetOtherLocation={handleSetOtherLocation}
                allowEventActions={timeOffEnabled}
                showHomeLocationAction={showHomeLocationAction}
                showOfficeLocationAction={showOfficeLocationAction}
                showOtherLocationAction={showOtherLocationAction}
                getShiftForDate={getShiftForDate}
              />
            </>
          )}
        </Card.Body>
      </Card>

      {crossBorderEnabled && (
        <OtherLocationModal
          show={showOtherLocationModal}
          date={otherLocationDate}
          existing={workLocationMap.get(otherLocationDate.format("YYYY-MM-DD"))}
          onHide={() => setShowOtherLocationModal(false)}
          onConfirm={handleOtherLocationConfirm}
        />
      )}

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
            typeFlagOptions={getTypeFlagOptions()}
            timeLocationFlagOptions={getTimeLocationFlagOptions()}
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
            title={m.timeoff_reset_form_title()}
            message={m.timeoff_reset_form_message()}
            confirmLabel={m.timeoff_reset_btn()}
            cancelLabel={m.timeoff_keep_editing()}
            variant="warning"
            onConfirm={handleConfirmResetForm}
            onCancel={() => setShowResetConfirm(false)}
          />

          <ConfirmationDialog
            isOpen={showDeleteConfirm}
            title={m.timeoff_delete_event_title()}
            message={m.calendar_delete_event_message()}
            confirmLabel={m.delete()}
            cancelLabel={m.cancel()}
            variant="danger"
            onConfirm={handleConfirmDelete}
            onCancel={() => setShowDeleteConfirm(false)}
          />
        </>
      )}
    </div>
  );
}
