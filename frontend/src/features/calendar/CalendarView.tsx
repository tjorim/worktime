import "temporal-polyfill/global";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CalendarEvent } from "@schedule-x/calendar";
import {
  createViewDay,
  createViewMonthAgenda,
  createViewMonthGrid,
  createViewWeek,
} from "@schedule-x/calendar";
import { createDragAndDropPlugin } from "@/features/calendar/dragAndDropAdapter";
import { ScheduleXCalendar, useCalendarApp } from "@schedule-x/react";
import { Temporal } from "temporal-polyfill";
import Alert from "react-bootstrap/Alert";
import Modal from "react-bootstrap/Modal";
import { ScheduleDetailModal } from "@/components/schedule/ScheduleDetailModal";
import { TaskEditModal, type TaskEditForm } from "@/components/timeTracking/TaskEditModal";
import { TaskEntryForm } from "@/components/timeTracking/TaskEntryForm";
import type { StoredTimeTrackingTask } from "@/components/timeTracking/types";
import { useSettings } from "@/contexts/SettingsContext";
import { useToast } from "@/contexts/ToastContext";
import { buildCalendarConfig } from "@/features/calendar/mapToScheduleXEvents";
import { useCalendarRangeData, type CalendarRange } from "@/features/calendar/useCalendarRangeData";
import { useTimeTrackingStorage } from "@/hooks/useTimeTrackingStorage";
import { dayjs } from "@/utils/dateTimeUtils";
import "@schedule-x/theme-default/dist/index.css";
import "@/features/calendar/calendar.css";

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

function localDateTime(value: Temporal.ZonedDateTime | Temporal.PlainDate | string): string | null {
  if (typeof value === "string") {
    return value.replace(" ", "T");
  }
  if (value instanceof Temporal.ZonedDateTime) {
    return value.toPlainDateTime().toString({ smallestUnit: "minute" });
  }
  return null;
}

function isValidCompletedRange(start: string, stop: string): boolean {
  return Boolean(
    start && stop && dayjs(`2000-01-01T${start}`).isBefore(dayjs(`2000-01-01T${stop}`)),
  );
}

interface CalendarViewProps {
  onChangeSchedule?: () => void;
  onChangeTeam?: () => void;
}

/** Unified Schedule-X view for shifts, time-off entries, and time-tracking tasks. */
export function CalendarView({ onChangeSchedule, onChangeTeam }: CalendarViewProps) {
  const [range, setRange] = useState<CalendarRange>(currentMonthRange);
  const events = useCalendarRangeData(range);
  const { scheduleType, myTeam } = useSettings();
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
  const eventRef = useRef(events);
  const taskRef = useRef(tasks);
  const updateTaskTimesRef = useRef(updateTaskTimes);
  const dragAndDropPlugin = useMemo(() => createDragAndDropPlugin(15), []);

  useEffect(() => {
    eventRef.current = events;
  }, [events]);

  useEffect(() => {
    taskRef.current = tasks;
    updateTaskTimesRef.current = updateTaskTimes;
  }, [tasks, updateTaskTimes]);

  useEffect(() => {
    if (!addLabel && labels[0]) setAddLabel(labels[0].id);
  }, [addLabel, labels]);

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
          if (stopTime && !dayjs(startTime).isSame(dayjs(stopTime), "day")) {
            toast.showError("A time-tracking task cannot span multiple days.");
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
      calendarApp.setTheme(document.documentElement.dataset.bsTheme === "dark" ? "dark" : "light");
    };
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-bs-theme"],
    });
    return () => observer.disconnect();
  }, [calendarApp]);

  const saveTaskEdit = () => {
    if (!selectedTask || !editForm.text.trim() || !editForm.label || !editForm.start) {
      setEditError("Fill in the task, label, and start time.");
      return;
    }
    if (editForm.stop && !isValidCompletedRange(editForm.start, editForm.stop)) {
      setEditError("Stop time must be after start time.");
      return;
    }
    updateTaskTimes({
      id: selectedTask.id,
      newStartTime: `${dayjs(selectedTask.startTime).format("YYYY-MM-DD")}T${editForm.start}`,
      newStopTime: editForm.stop
        ? `${dayjs(selectedTask.startTime).format("YYYY-MM-DD")}T${editForm.stop}`
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
    await addTask({
      id: crypto.randomUUID(),
      text: addText.trim(),
      label: addLabel,
      startTime: `${addDate}T${addStart}`,
      stopTime: `${addDate}T${addStop}`,
    });
    setAddDate("");
  };

  return (
    <section className="unified-calendar p-3" aria-label="Unified calendar">
      <Alert variant="info" className="py-2">
        Shifts, time off, and time tracking are shown together. Drag a time-tracking task to
        reschedule it.
      </Alert>
      {(!scheduleType || myTeam === null) && (
        <Alert variant="warning" className="d-flex align-items-center gap-2 py-2">
          <i className="bi bi-exclamation-triangle" aria-hidden="true"></i>
          <span>
            No roster configured — no shifts will appear.
            {onChangeSchedule && (
              <>
                {" "}
                <Alert.Link as="button" onClick={onChangeSchedule}>
                  Pick a schedule
                </Alert.Link>
                {onChangeTeam && " or "}
              </>
            )}
            {onChangeTeam && (
              <Alert.Link as="button" onClick={onChangeTeam}>
                Pick a team
              </Alert.Link>
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

      <Modal show={Boolean(addDate)} onHide={() => setAddDate("")} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>Add time-tracking task</Modal.Title>
        </Modal.Header>
        <Modal.Body>
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
            startDisabledReason="Use Time Tracking to start a live timer."
            addDisabledReason="Enter a task, label, and valid time range."
            onSubmit={saveNewTask}
            onStartNow={() => undefined}
          />
        </Modal.Body>
      </Modal>

      <Modal show={timeOffEvent !== null} onHide={() => setTimeOffEvent(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Time-off details</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <dl className="mb-0">
            <dt>Title</dt>
            <dd>{timeOffEvent?.title}</dd>
            <dt>Dates</dt>
            <dd>
              {timeOffEvent
                ? `${calendarDate(timeOffEvent.start)} – ${calendarDate(timeOffEvent.end)}`
                : ""}
            </dd>
            <dt>Type</dt>
            <dd>{String(timeOffEvent?.entryType ?? "")}</dd>
          </dl>
        </Modal.Body>
      </Modal>

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
