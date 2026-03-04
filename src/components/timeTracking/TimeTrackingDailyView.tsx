import { useEffect, useMemo, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import InputGroup from "react-bootstrap/InputGroup";
import ReactSelect from "react-select";
import { useSettings } from "../../contexts/SettingsContext";
import { useToast } from "../../contexts/ToastContext";
import { dayjs } from "../../utils/dateTimeUtils";
import { useLiveTime } from "../../hooks/useLiveTime";
import { useWorkLocationStorage } from "../../hooks/useWorkLocationStorage";
import { DayNavigationButtonGroup } from "../shared/NavigationButtonGroup";
import { bootstrapSelectClassNames } from "../../utils/reactSelectStyles";
import * as m from "../../paraglide/messages.js";

type TemplateOption = { value: string; label: string };
import { ConfirmationDialog } from "../ConfirmationDialog";
import { OtherLocationModal } from "../calendar/OtherLocationModal";
import { DailyTaskList, type EditRequest } from "./DailyTaskList";
import { TimelineProgressBar } from "./TimelineProgressBar";
import { TaskEntryForm } from "./TaskEntryForm";
import {
  buildLabelColorMap,
  buildLabelNameMap,
  getContrastingTextColor,
  useDefaultLabelColor,
  type TimeTrackingLabel,
} from "./constants";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "./types";
import { isValidRange, overlaps } from "./timeUtils";

type TimeTrackingDailyViewProps = {
  tasks: StoredTimeTrackingTask[];
  labels: TimeTrackingLabel[];
  templates: TimeTrackingTemplate[];
  selectedDate: string;
  onSelectedDateChange: (date: string) => void;
  onAddTask: (payload: StoredTimeTrackingTask) => Promise<boolean>;
  onUpdateTaskTimes: (payload: {
    id: string;
    newStartTime: string;
    newStopTime: string | null | undefined;
    newText?: string;
    newLabel?: string;
  }) => void;
  onRemoveTask: (id: string) => void;
  onToggleBreak: (taskId: string, includesBreak: boolean) => void;
};

function todayIso() {
  return dayjs().format("YYYY-MM-DD");
}

interface WorkLocationDayHeaderProps {
  date: string; // YYYY-MM-DD
}

function WorkLocationDayHeader({ date }: WorkLocationDayHeaderProps) {
  const { settings } = useSettings();
  const year = dayjs(date).year();
  const { workLocationMap, setLocationForDate, clearLocationForDate } =
    useWorkLocationStorage(year);
  const toast = useToast();
  const [showOtherModal, setShowOtherModal] = useState(false);

  const dayjsDate = dayjs(date);
  const dateKey = dayjsDate.format("YYYY-MM-DD");
  const stored = workLocationMap.get(dateKey);

  const handleHome = () => {
    const ok = setLocationForDate(dayjsDate, "home");
    if (!ok) toast.showError(m.tt_configure_home_country());
  };

  const handleOffice = () => {
    const ok = setLocationForDate(dayjsDate, "office");
    if (!ok) toast.showError(m.tt_configure_office_country());
  };

  const handleClear = () => {
    clearLocationForDate(dayjsDate);
  };

  const showHome = !!settings.homeCountry;
  const showOffice = !!settings.officeCountry;

  return (
    <>
      <div className="d-flex align-items-center gap-2 flex-wrap">
        {showHome && (
          <Button
            size="sm"
            variant={stored?.location === "home" ? "primary" : "outline-secondary"}
            onClick={handleHome}
            aria-pressed={stored?.location === "home"}
            title="Work from home"
          >
            <i className="bi bi-house me-1" aria-hidden="true"></i>
            Home
          </Button>
        )}
        {showOffice && (
          <Button
            size="sm"
            variant={stored?.location === "office" ? "primary" : "outline-secondary"}
            onClick={handleOffice}
            aria-pressed={stored?.location === "office"}
            title="Work from office"
          >
            <i className="bi bi-building me-1" aria-hidden="true"></i>
            Office
          </Button>
        )}
        <Button
          size="sm"
          variant={stored?.location === "other" ? "primary" : "outline-secondary"}
          onClick={() => setShowOtherModal(true)}
          aria-pressed={stored?.location === "other"}
          title="Other location"
        >
          <i className="bi bi-geo-alt me-1" aria-hidden="true"></i>
          Other…
        </Button>
        {stored && (
          <Button
            size="sm"
            variant="outline-danger"
            onClick={handleClear}
            aria-label="Clear work location"
            title="Clear work location"
          >
            <i className="bi bi-x" aria-hidden="true"></i>
          </Button>
        )}
      </div>
      <OtherLocationModal
        show={showOtherModal}
        date={dayjsDate}
        existing={stored}
        onHide={() => setShowOtherModal(false)}
        onConfirm={(countryCode, label) => {
          const ok = setLocationForDate(dayjsDate, "other", { countryCode, label });
          if (ok) {
            setShowOtherModal(false);
          } else {
            toast.showError(m.tt_could_not_save_location());
          }
        }}
      />
    </>
  );
}

function formatDuration(totalSeconds: number) {
  const clampedSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(clampedSeconds / 3600);
  const minutes = Math.floor((clampedSeconds % 3600) / 60);
  const seconds = clampedSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function TimeTrackingDailyView({
  // oxlint-disable-line max-lines-per-function
  tasks,
  labels,
  templates = [],
  selectedDate,
  onSelectedDateChange,
  onAddTask,
  onUpdateTaskTimes,
  onRemoveTask,
  onToggleBreak,
}: TimeTrackingDailyViewProps) {
  const date = selectedDate || todayIso();
  const [editRequest, setEditRequest] = useState<EditRequest | null>(null);
  const [text, setText] = useState("");
  const [selectedLabel, setSelectedLabel] = useState<string>("");
  const [start, setStart] = useState("");
  const [stop, setStop] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [error, setError] = useState("");
  const { settings } = useSettings();
  const toast = useToast();
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const liveTime = useLiveTime({ precision: "second" });
  const dailyDate = dayjs(date);
  const isDailyCurrent = dailyDate.isSame(dayjs(), "day");
  const colorByLabelId = useMemo(() => buildLabelColorMap(labels), [labels]);
  const labelNameById = useMemo(() => buildLabelNameMap(labels), [labels]);
  const templateOptions = useMemo(
    () =>
      templates.map((template) => ({
        value: template.id,
        label: `${template.text} (${template.start}-${template.stop}) [${labelNameById[template.label] ?? "Unknown label"}]`,
      })),
    [templates, labelNameById],
  );
  const selectedTemplateOption = useMemo(
    () => templateOptions.find((option) => option.value === selectedTemplateId) ?? null,
    [selectedTemplateId, templateOptions],
  );
  const defaultLabelColor = useDefaultLabelColor();

  useEffect(() => {
    const fallback = labels[0]?.id ?? "";
    if (!selectedLabel || !labels.some((item) => item.id === selectedLabel)) {
      setSelectedLabel(fallback);
    }
  }, [labels, selectedLabel]);

  const dailyTasks = useMemo(
    () =>
      tasks
        .filter((task) => dayjs(task.startTime).format("YYYY-MM-DD") === date)
        .sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf()),
    [tasks, date],
  );

  const runningTask = useMemo(
    () =>
      tasks.reduce<StoredTimeTrackingTask | null>((latest, task) => {
        if (task.stopTime === undefined || task.stopTime === null) {
          if (!latest || task.startTime > latest.startTime) {
            return task;
          }
        }
        return latest;
      }, null),
    [tasks],
  );

  const runningElapsed = useMemo(() => {
    if (!runningTask) {
      return null;
    }
    const start = dayjs(runningTask.startTime);
    return formatDuration(liveTime.diff(start, "second"));
  }, [liveTime, runningTask]);

  const runningLabelBackground = useMemo(
    () =>
      runningTask ? (colorByLabelId[runningTask.label] ?? defaultLabelColor) : defaultLabelColor,
    [runningTask, colorByLabelId, defaultLabelColor],
  );
  const runningLabelTextColor = useMemo(
    () => getContrastingTextColor(runningLabelBackground),
    [runningLabelBackground],
  );

  const hasTaskDetails = text.trim().length > 0 && selectedLabel.trim().length > 0;
  const hasCompletedRange = hasTaskDetails && start.trim().length > 0 && stop.trim().length > 0;
  const canAddCompletedTask = hasCompletedRange && isValidRange(start, stop);
  const canStartNow = !runningTask && hasTaskDetails;
  const startDisabledReason = runningTask
    ? m.tt_reason_stopwatch_running()
    : !text.trim()
      ? m.tt_reason_enter_task_name()
      : !selectedLabel
        ? m.tt_reason_select_label()
        : undefined;
  const addDisabledReason = !text.trim()
    ? m.tt_reason_enter_task_name()
    : !start.trim() || !stop.trim()
      ? m.tt_reason_enter_start_stop()
      : !isValidRange(start, stop)
        ? m.tt_reason_stop_after_start()
        : undefined;

  const handleAddTask = async () => {
    setError("");
    if (!text || !date || !start || !stop) {
      setError(m.tt_error_fill_all_fields());
      return;
    }
    if (!selectedLabel) {
      setError(m.tt_error_configure_label());
      return;
    }
    if (!isValidRange(start, stop)) {
      setError(m.tt_error_stop_after_start());
      return;
    }
    const dailyForOverlap = dailyTasks.map((t) => ({
      id: t.id,
      start: dayjs(t.startTime).format("HH:mm"),
      stop: (t.stopTime ? dayjs(t.stopTime) : dayjs()).format("HH:mm"),
    }));
    if (overlaps(start, stop, dailyForOverlap)) {
      setError(m.tt_error_time_overlap());
      return;
    }

    const added = await onAddTask({
      id: crypto.randomUUID(),
      text,
      label: selectedLabel,
      startTime: `${date}T${start}`,
      stopTime: `${date}T${stop}`,
    });
    if (!added) {
      setError(m.tt_error_task_already_running());
      return;
    }
    setText("");
    setStart("");
    setStop("");
  };

  const handleStartNow = async () => {
    setError("");
    if (runningTask) {
      setError(m.tt_error_task_already_running_start());
      return;
    }
    if (!text.trim()) {
      setError(m.tt_error_enter_task_name());
      return;
    }
    if (!selectedLabel) {
      setError(m.tt_error_configure_label());
      return;
    }
    const now = dayjs();
    const startTime = now.format("YYYY-MM-DDTHH:mm");
    const startDate = now.format("YYYY-MM-DD");
    const added = await onAddTask({
      id: crypto.randomUUID(),
      text: text.trim(),
      label: selectedLabel,
      startTime,
    });
    if (!added) {
      setError(m.tt_error_task_already_running_start());
      return;
    }
    onSelectedDateChange(startDate);
    setText("");
  };

  const handleStopNow = () => {
    if (!runningTask) {
      return;
    }
    setError("");
    const startDayjs = dayjs(runningTask.startTime);
    const startDate = startDayjs.format("YYYY-MM-DD");
    const now = dayjs();
    if (!now.isSame(startDayjs, "day")) {
      setEditRequest({
        task: runningTask,
        info: `This task started on ${startDate} and spans midnight. Set a stop time on ${startDate} to complete it.`,
      });
      return;
    }
    if (now.isBefore(startDayjs)) {
      setError(m.tt_error_stop_after_start());
      return;
    }
    if (now.diff(startDayjs, "minute") < 1) {
      setShowDiscardConfirm(true);
      return;
    }
    const stopTime = now.format("YYYY-MM-DDTHH:mm");
    onUpdateTaskTimes({
      id: runningTask.id,
      newStartTime: runningTask.startTime,
      newStopTime: stopTime,
    });
  };

  const handleUpdateTask = async (payload: {
    id: string;
    text: string;
    label: string;
    start: string;
    stop?: string | null;
  }): Promise<boolean> => {
    setError("");
    if (!payload.text.trim() || !payload.label || !payload.start) {
      setError(m.tt_error_fill_all_fields());
      return false;
    }
    // Validate stop time if provided (for stopped tasks)
    if (payload.stop) {
      if (!isValidRange(payload.start, payload.stop)) {
        setError(m.tt_error_stop_after_start());
        return false;
      }
    }
    if (!labels.some((item) => item.id === payload.label)) {
      setError(m.tt_error_select_valid_label());
      return false;
    }
    if (payload.stop == null) {
      const otherRunning = tasks.some(
        (task) => (task.stopTime === undefined || task.stopTime === null) && task.id !== payload.id,
      );
      if (otherRunning) {
        setError(m.tt_error_task_running_leave());
        return false;
      }
    }
    const taskDate = tasks.find((item) => item.id === payload.id)?.startTime.slice(0, 10) ?? date;
    const newStartTime = `${taskDate}T${payload.start}`;
    const newStopTime = payload.stop ? `${taskDate}T${payload.stop}` : null;

    // Overlap checking: only check if we have a stop time.
    // Use the edited task's own date (not the currently selected view date)
    // so cross-day edits validate against the correct day.
    if (payload.stop) {
      const sameDayTasks = tasks.filter(
        (task) => dayjs(task.startTime).format("YYYY-MM-DD") === taskDate,
      );
      const dailyForOverlap = sameDayTasks.map((task) => ({
        id: task.id,
        start: dayjs(task.startTime).format("HH:mm"),
        stop: (task.stopTime ? dayjs(task.stopTime) : dayjs()).format("HH:mm"),
      }));
      if (overlaps(payload.start, payload.stop, dailyForOverlap, payload.id)) {
        setError(m.tt_error_time_overlap());
        return false;
      }
    }

    onUpdateTaskTimes({
      id: payload.id,
      newText: payload.text.trim(),
      newLabel: payload.label,
      newStartTime,
      newStopTime,
    });
    toast.showSuccess(m.tt_task_updated());
    return true;
  };

  const handleApplyTemplate = () => {
    setError("");
    if (!selectedTemplateId) {
      setError(m.tt_error_select_template());
      return;
    }
    const template = templates.find((item) => item.id === selectedTemplateId);
    if (!template) {
      setError(m.tt_error_template_not_found());
      return;
    }

    const templateLabelExists = labels.some((label) => label.id === template.label);
    if (!templateLabelExists) {
      setSelectedLabel("");
      setError(m.tt_error_template_label_unavailable());
      return;
    }

    setText(template.text);
    setSelectedLabel(template.label);
    setStart(template.start);
    setStop(template.stop);
    toast.showSuccess(m.tt_template_applied({ name: template.text }));
  };

  return (
    <Card className="shadow-sm">
      <Card.Header>
        <div className="d-flex justify-content-between align-items-center mb-2">
          <span className="fw-semibold">
            <i className="bi bi-clock me-2" aria-hidden="true"></i>
            {m.tt_daily_heading()}
          </span>
          <DayNavigationButtonGroup
            isCurrent={isDailyCurrent}
            onPrevious={() =>
              onSelectedDateChange(dailyDate.subtract(1, "day").format("YYYY-MM-DD"))
            }
            onCurrent={() => onSelectedDateChange(dayjs().format("YYYY-MM-DD"))}
            onNext={() => onSelectedDateChange(dailyDate.add(1, "day").format("YYYY-MM-DD"))}
            selectorLabel="Jump to date:"
            selectorValue={date}
            onSelectorChange={onSelectedDateChange}
          />
        </div>
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2">
          <div className="text-muted small">
            {dailyDate.format("dddd, MMMM D, YYYY")}
            {isDailyCurrent && (
              <Badge bg="success" className="ms-2" aria-label="Current day">
                {m.today()}
              </Badge>
            )}
          </div>
          {settings.enableCrossBorderTracking && <WorkLocationDayHeader date={date} />}
        </div>
      </Card.Header>
      <Card.Body>
        {error && (
          <Alert variant="danger" aria-live="polite">
            {error}
          </Alert>
        )}
        {templates.length > 0 && (
          <Form.Group className="mb-2" controlId="timeTrackerTemplate">
            <Form.Label className="visually-hidden">Template</Form.Label>
            <InputGroup>
              <ReactSelect<TemplateOption>
                unstyled
                isClearable
                isSearchable
                inputId="timeTrackerTemplate"
                placeholder={m.tt_choose_template()}
                options={templateOptions}
                value={selectedTemplateOption}
                onChange={(selected) => setSelectedTemplateId(selected?.value ?? "")}
                classNames={bootstrapSelectClassNames}
                className="flex-fill"
              />
              <Button variant="outline-secondary" onClick={handleApplyTemplate}>
                {m.tt_use_template()}
              </Button>
            </InputGroup>
          </Form.Group>
        )}

        <div className="border rounded p-3 mb-3">
          <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
            <div>
              <div className="fw-semibold">{m.tt_quick_timer()}</div>
              <div className="small text-muted">{m.tt_quick_timer_desc()}</div>
            </div>
            {runningTask ? (
              <span className="badge text-bg-success">{m.tt_running_status()}</span>
            ) : (
              <span className="badge text-bg-secondary">{m.tt_idle_status()}</span>
            )}
          </div>
          {runningTask ? (
            <div className="mt-2">
              <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
                <div>
                  <div className="fw-semibold">
                    {runningTask.text}{" "}
                    <span
                      className="time-tracking-label"
                      style={{
                        backgroundColor: runningLabelBackground,
                        color: runningLabelTextColor,
                      }}
                    >
                      {labelNameById[runningTask.label] ?? m.tt_unknown_label()}
                    </span>
                  </div>
                  <div className="small text-muted">
                    Started {dayjs(runningTask.startTime).format("HH:mm")} · Elapsed{" "}
                    {runningElapsed}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={handleStopNow}
                  aria-label={`Stop Timer for ${runningTask.text}`}
                >
                  {m.tt_stop_timer()}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-2 d-flex flex-wrap align-items-center gap-2">
              <span className="text-muted small">
                {m.tt_enter_task_hint()}
              </span>
            </div>
          )}
        </div>

        <TaskEntryForm
          labels={labels}
          text={text}
          onTextChange={setText}
          label={selectedLabel}
          onLabelChange={setSelectedLabel}
          start={start}
          onStartChange={setStart}
          stop={stop}
          onStopChange={setStop}
          canSubmit={canAddCompletedTask}
          canStartNow={canStartNow}
          startDisabledReason={startDisabledReason}
          addDisabledReason={addDisabledReason}
          onSubmit={handleAddTask}
          onStartNow={handleStartNow}
        />

        <TimelineProgressBar
          tasks={dailyTasks}
          labels={labels}
          liveTime={liveTime}
          isToday={isDailyCurrent}
        />

        <DailyTaskList
          tasks={dailyTasks}
          labels={labels}
          editRequest={editRequest}
          onEditRequestHandled={() => setEditRequest(null)}
          onUpdateTask={handleUpdateTask}
          onRemoveTask={onRemoveTask}
          onToggleBreak={onToggleBreak}
          liveTime={liveTime}
          isToday={isDailyCurrent}
        />
      </Card.Body>

      <ConfirmationDialog
        isOpen={showDiscardConfirm}
        title={m.tt_discard_task_title()}
        message={m.tt_discard_task_message()}
        confirmLabel={m.discard()}
        variant="danger"
        onConfirm={() => {
          if (runningTask) {
            onRemoveTask(runningTask.id);
            toast.showSuccess(m.tt_task_discarded());
          }
          setShowDiscardConfirm(false);
        }}
        onCancel={() => {
          setShowDiscardConfirm(false);
        }}
      />
    </Card>
  );
}
