import { isValidRange, isValidTaskInterval, taskStopTime } from "@/lib/timeTracking/timeUtils";
import { InfoIcon, TriangleAlertIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import "temporal-polyfill/global";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CalendarEvent } from "@schedule-x/calendar";
import {
  createViewDay,
  createViewMonthAgenda,
  createViewMonthGrid,
  createViewWeek,
} from "@schedule-x/calendar";
import { localDateTime, createDragAndDropPlugin } from "@/features/calendar/dragAndDropAdapter";
import { ScheduleXCalendar, useCalendarApp } from "@schedule-x/react";
import { Temporal } from "temporal-polyfill";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScheduleDetailModal } from "@/components/schedule/ScheduleDetailModal";
import { TaskEditModal, type TaskEditForm } from "@/components/shared/TaskEditModal";
import { TaskEntryForm } from "@/components/shared/TaskEntryForm";
import type { StoredTimeTrackingTask } from "@/lib/timeTracking/types";
import { useSettings } from "@/contexts/SettingsContext";
import { useToast } from "@/contexts/ToastContext";
import { buildCalendarConfig } from "@/features/calendar/mapToScheduleXEvents";
import { useCalendarRangeData, type CalendarRange } from "@/features/calendar/useCalendarRangeData";
import { useDevicePreferences } from "@/hooks/useDevicePreferences";
import { useTimeTrackingStorage } from "@/hooks/useTimeTrackingStorage";
import { dayjs } from "@/utils/dateTimeUtils";
import { getEffectiveTeam } from "@/utils/scheduleUtils";
import "@/features/calendar/calendar.css";
import * as m from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { withCalendarEventContent } from "@/features/calendar/calendarEventContent";

const EMPTY_EDIT_FORM: TaskEditForm = {
  text: "",
  label: "",
  start: "",
  stop: "",
  includesBreak: false,
};

function currentMonthRange(): CalendarRange {
  const now = dayjs();
  return {
    start: now.startOf("month").startOf("week").format("YYYY-MM-DD"),
    end: now.endOf("month").endOf("week").format("YYYY-MM-DD"),
  };
}

function calendarDate(value: Temporal.ZonedDateTime | Temporal.PlainDate | string): string {
  return value.toString().slice(0, 10);
}

function isValidCompletedRange(start: string, stop: string): boolean {
  return isValidRange(start, stop);
}

interface CalendarViewProps {
  onChangeSchedule?: () => void;
  onChangeTeam?: () => void;
}

/** Unified Schedule-X view for shifts, time-off entries, and time-tracking tasks. */
export function CalendarView(props: CalendarViewProps) {
  // The Schedule-X React hook reads configuration only once on mount.
  const { settings } = useSettings();
  return <ConfiguredCalendarView key={`${getLocale()}:${settings.timeFormat}`} {...props} />;
}

function ConfiguredCalendarView({ onChangeSchedule, onChangeTeam }: CalendarViewProps) {
  const [range, setRange] = useState<CalendarRange>(currentMonthRange);
  const rangeEvents = useCalendarRangeData(range);
  const { scheduleType, myTeam, settings } = useSettings();
  const locale = getLocale() === "nl" ? "nl-NL" : "en-GB";
  const events = useMemo(
    () => rangeEvents.map((event) => withCalendarEventContent(event, locale, settings.timeFormat)),
    [rangeEvents, locale, settings.timeFormat],
  );
  // Mirrors useCalendarRangeData's own effective-team check so single-user schedules
  // (e.g. "9-5", teamCount === 1) don't trigger a false "no roster configured" warning.
  const effectiveTeam = scheduleType ? getEffectiveTeam(myTeam, scheduleType) : null;
  const toast = useToast();
  const { tasks, labels, addTask, updateTaskTimes } = useTimeTrackingStorage();
  const [selectedTask, setSelectedTask] = useState<StoredTimeTrackingTask | null>(null);
  const [editForm, setEditForm] = useState<TaskEditForm>(EMPTY_EDIT_FORM);
  const [editError, setEditError] = useState("");
  const [timeOffEvent, setTimeOffEvent] = useState<CalendarEvent | null>(null);
  const [shiftTeam, setShiftTeam] = useState<number | null>(null);
  const [addDate, setAddDate] = useState("");
  const [addText, setAddText] = useState("");
  const [addLabel, setAddLabel] = useState("");
  const [addStart, setAddStart] = useState("");
  const [addStop, setAddStop] = useState("");
  const { isHintDismissed, setHintDismissed } = useDevicePreferences();
  const showHelp = !isHintDismissed("unifiedCalendar");
  const calendarElementRef = useRef<HTMLElement>(null);
  const eventRef = useRef(events);
  const taskRef = useRef(tasks);
  const updateTaskTimesRef = useRef(updateTaskTimes);
  const dragAndDropPlugin = useMemo(() => createDragAndDropPlugin(15), []);

  const dismissHelp = () => {
    setHintDismissed("unifiedCalendar", true);
  };

  const restoreHelp = () => {
    setHintDismissed("unifiedCalendar", false);
  };

  useEffect(() => {
    eventRef.current = events;
  }, [events]);

  useEffect(() => {
    taskRef.current = tasks;
    updateTaskTimesRef.current = updateTaskTimes;
  }, [tasks, updateTaskTimes]);

  // Default to the first label once labels are available. Safe to run during
  // render: the `!addLabel` guard makes it idempotent once set.
  if (!addLabel && labels[0]) setAddLabel(labels[0].id);

  const openTask = useCallback((task: StoredTimeTrackingTask) => {
    setSelectedTask(task);
    setEditForm({
      text: task.text,
      label: task.label,
      start: dayjs(task.startTime).format("HH:mm"),
      stop: task.stopTime ? dayjs(task.stopTime).format("HH:mm") : "",
      includesBreak: task.includesBreak ?? false,
    });
    setEditError("");
  }, []);

  const handleEventClick = useCallback(
    (event: CalendarEvent) => {
      if (typeof event.taskId === "string") {
        const task = taskRef.current.find((item) => item.id === event.taskId);
        if (task) openTask(task);
        return;
      }
      if (typeof event.entryId === "string") {
        setTimeOffEvent(event);
        return;
      }
      if (typeof event.team === "number") setShiftTeam(event.team);
    },
    [openTask],
  );

  const calendarApp = useCalendarApp(
    {
      views: [createViewMonthGrid(), createViewWeek(), createViewDay(), createViewMonthAgenda()],
      defaultView: "month-grid",
      timezone: Temporal.Now.timeZoneId(),
      locale,
      weekOptions: {
        timeAxisFormatOptions: {
          hour: "numeric",
          minute: "2-digit",
          hour12: settings.timeFormat === "12h",
        },
      },
      calendars: buildCalendarConfig(labels),
      callbacks: {
        onRangeUpdate: (nextRange) => {
          setRange({ start: calendarDate(nextRange.start), end: calendarDate(nextRange.end) });
        },
        onEventClick: handleEventClick,
        onEventUpdate: (event) => {
          if (typeof event.taskId !== "string") return;
          const task = taskRef.current.find((item) => item.id === event.taskId);
          const startTime = localDateTime(event.start);
          const renderedStopTime = localDateTime(event.end);
          if (!task || !startTime || !renderedStopTime) return;
          const stopTime = task.stopTime ? renderedStopTime : undefined;
          if (
            stopTime &&
            (!dayjs(stopTime).isAfter(dayjs(startTime)) ||
              dayjs(stopTime).diff(dayjs(startTime), "hour", true) > 24)
          ) {
            toast.showError(m.tt_duration_limit());
            setTimeout(() => {
              calendarApp?.events.set(eventRef.current);
            }, 0);
            return;
          }
          updateTaskTimesRef.current({
            id: task.id,
            newStartTime: startTime,
            newStopTime: stopTime,
          });
        },
        onClickDateTime: (dateTime) => {
          const dateTimeStr = typeof dateTime === "string" ? dateTime : dateTime.toString();
          const normalized = dateTimeStr.replace(" ", "T");
          let datePart = normalized.slice(0, 10);
          let startPart = "09:00";
          let stopPart = "10:00";

          try {
            if (normalized.includes("T")) {
              const pdt = Temporal.PlainDateTime.from(normalized);
              datePart = pdt.toPlainDate().toString();
              startPart = pdt.toPlainTime().toString({ smallestUnit: "minute" });
              stopPart = pdt.add({ hours: 1 }).toPlainTime().toString({ smallestUnit: "minute" });
            } else {
              datePart = Temporal.PlainDate.from(normalized).toString();
            }
          } catch {
            const [dateFallback, timeFallback] = normalized.split("T");
            datePart = dateFallback ?? normalized.slice(0, 10);
            if (timeFallback) {
              startPart = timeFallback.slice(0, 5);
              const colonIdx = startPart.indexOf(":");
              const h = colonIdx >= 0 ? parseInt(startPart.slice(0, colonIdx), 10) : 0;
              const m = colonIdx >= 0 ? startPart.slice(colonIdx + 1) : "00";
              stopPart = `${String((h + 1) % 24).padStart(2, "0")}:${m}`;
            }
          }

          setAddDate(datePart);
          setAddStart(startPart);
          setAddStop(stopPart);
          setAddText("");
        },
      },
    },
    [dragAndDropPlugin],
  );

  useEffect(() => {
    calendarApp?.events.set(events);
  }, [calendarApp, events]);

  useEffect(() => {
    if (!calendarApp) return;
    const updateTheme = () => {
      calendarApp.setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    };
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, [calendarApp]);

  useEffect(() => {
    const element = calendarElementRef.current;
    if (!element) return;
    // Schedule-X owns these controls and can replace them on navigation.
    const nameControls = () => {
      element.querySelectorAll(".sx__date-input-wrapper").forEach((wrapper) => {
        const label = wrapper.querySelector("label");
        if (label?.id) wrapper.querySelector("input")?.setAttribute("aria-labelledby", label.id);
      });
      // The all-day row is named by the vendor but otherwise has a generic role.
      element.querySelectorAll(".sx__date-grid").forEach((grid) => {
        grid.setAttribute("role", "group");
      });
      // The visible view name (e.g. Month) must be part of the accessible name.
      element.querySelectorAll(".sx__view-selection-selected-item").forEach((button) => {
        button.removeAttribute("aria-label");
      });
    };
    nameControls();
    const observer = new MutationObserver(nameControls);
    observer.observe(element, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const saveTaskEdit = () => {
    if (!selectedTask || !editForm.text.trim() || !editForm.label || !editForm.start) {
      setEditError(m.calendar_task_fill_required());
      return;
    }
    if (editForm.stop && !isValidCompletedRange(editForm.start, editForm.stop)) {
      setEditError(m.calendar_task_stop_after_start());
      return;
    }
    if (
      editForm.stop &&
      !isValidTaskInterval(
        `${dayjs(selectedTask.startTime).format("YYYY-MM-DD")}T${editForm.start}`,
        taskStopTime(
          dayjs(selectedTask.startTime).format("YYYY-MM-DD"),
          editForm.start,
          editForm.stop,
        ),
      )
    ) {
      setEditError(m.tt_duration_limit());
      return;
    }
    updateTaskTimes({
      id: selectedTask.id,
      newStartTime: `${dayjs(selectedTask.startTime).format("YYYY-MM-DD")}T${editForm.start}`,
      newStopTime: editForm.stop
        ? taskStopTime(
            dayjs(selectedTask.startTime).format("YYYY-MM-DD"),
            editForm.start,
            editForm.stop,
          )
        : undefined,
      newText: editForm.text.trim(),
      newLabel: editForm.label,
      includesBreak: editForm.includesBreak,
    });
    setSelectedTask(null);
  };

  const canAddTask = Boolean(
    addText.trim() && addLabel && isValidCompletedRange(addStart, addStop),
  );
  const saveNewTask = async () => {
    if (!canAddTask) return;
    if (!isValidTaskInterval(`${addDate}T${addStart}`, taskStopTime(addDate, addStart, addStop))) {
      toast.showError(m.tt_duration_limit());
      return;
    }
    await addTask({
      id: crypto.randomUUID(),
      text: addText.trim(),
      label: addLabel,
      startTime: `${addDate}T${addStart}`,
      stopTime: taskStopTime(addDate, addStart, addStop),
    });
    setAddDate("");
  };

  return (
    <section
      ref={calendarElementRef}
      data-slot="unified-calendar"
      className="px-0 py-4 sm:px-4"
      aria-label={m.calendar_unified_label()}
    >
      {showHelp ? (
        <Alert variant="info" className="py-2">
          {m.unified_calendar_help()}
          <Button variant="ghost" size="sm" onClick={dismissHelp} aria-label={m.close()}>
            {m.close()}
          </Button>
        </Alert>
      ) : (
        <div className="flex justify-end mb-2">
          <Button
            variant="link"
            size="sm"
            className="text-muted-foreground p-0"
            onClick={restoreHelp}
          >
            <Icon icon={InfoIcon} className="mr-1" />
            {m.unified_calendar_show_help()}
          </Button>
        </div>
      )}
      {effectiveTeam === null && (
        <Alert variant="warning" className="flex items-center gap-2 py-2">
          <Icon icon={TriangleAlertIcon} />
          <span>
            {m.calendar_no_roster()}
            {onChangeSchedule && (
              <>
                {" "}
                <Button variant="link" className="p-0" onClick={onChangeSchedule}>
                  {m.calendar_pick_schedule()}
                </Button>
                {onChangeTeam && ` ${m.calendar_pick_or()} `}
              </>
            )}
            {onChangeTeam && (
              <Button variant="link" className="p-0" onClick={onChangeTeam}>
                {m.calendar_pick_team()}
              </Button>
            )}
          </span>
        </Alert>
      )}
      <ScheduleXCalendar calendarApp={calendarApp} />

      <TaskEditModal
        show={selectedTask !== null}
        labels={labels}
        value={editForm}
        onChange={setEditForm}
        onClose={() => setSelectedTask(null)}
        onSubmit={saveTaskEdit}
        error={editError}
      />

      <Dialog
        open={Boolean(addDate)}
        onOpenChange={(open) => {
          if (!open) (() => setAddDate(""))();
        }}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{m.calendar_add_task_title()}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto p-4">
            <TaskEntryForm
              labels={labels}
              text={addText}
              onTextChange={setAddText}
              label={addLabel}
              onLabelChange={setAddLabel}
              start={addStart}
              onStartChange={setAddStart}
              stop={addStop}
              onStopChange={setAddStop}
              canSubmit={canAddTask}
              canStartNow={false}
              showTimerControls={false}
              isTimerRunning={false}
              startDisabledReason={m.calendar_start_disabled_reason()}
              addDisabledReason={m.calendar_add_disabled_reason()}
              onSubmit={saveNewTask}
              onStartNow={() => undefined}
              onStopNow={() => undefined}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={timeOffEvent !== null}
        onOpenChange={(open) => {
          if (!open) (() => setTimeOffEvent(null))();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.calendar_time_off_details()}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto p-4">
            <dl className="mb-0">
              <dt>{m.calendar_detail_title()}</dt>
              <dd>{timeOffEvent?.title}</dd>
              <dt>{m.calendar_detail_dates()}</dt>
              <dd>
                {timeOffEvent
                  ? `${calendarDate(timeOffEvent.start)} – ${calendarDate(timeOffEvent.end)}`
                  : ""}
              </dd>
              <dt>{m.calendar_detail_type()}</dt>
              <dd>{String(timeOffEvent?.entryType ?? "")}</dd>
            </dl>
          </div>
        </DialogContent>
      </Dialog>

      {shiftTeam !== null && scheduleType && (
        <ScheduleDetailModal
          show
          onHide={() => setShiftTeam(null)}
          teamNumber={shiftTeam}
          scheduleType={scheduleType}
        />
      )}
    </section>
  );
}
