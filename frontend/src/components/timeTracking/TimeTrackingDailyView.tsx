import { useEffect, useMemo, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Card from "react-bootstrap/Card";
import { useSettings } from "@/contexts/SettingsContext";
import { useToast } from "@/contexts/ToastContext";
import { dayjs } from "@/utils/dateTimeUtils";
import { useLiveTime } from "@/hooks/useLiveTime";
import { useGanttTasks } from "@/hooks/useGanttTasks";
import * as m from "@/paraglide/messages.js";

import { DailyDiscardConfirmation } from "./DailyDiscardConfirmation";
import { DailyTaskList, type EditRequest } from "./DailyTaskList";
import { DailyQuickTimer } from "./DailyQuickTimer";
import { DailyTemplatePicker } from "./DailyTemplatePicker";
import { DailyViewHeader } from "./DailyViewHeader";
import { TimelineProgressBar } from "./TimelineProgressBar";
import { TaskEntryForm } from "./TaskEntryForm";
import {
  buildLabelColorMap,
  buildLabelNameMap,
  useDefaultLabelColor,
  type TimeTrackingLabel,
} from "./constants";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "./types";
import { isValidRange, overlaps } from "./timeUtils";
import { useDailyTaskSummary } from "./hooks/useDailyTaskSummary";

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
    ganttTaskId?: string;
  }) => void;
  onRemoveTask: (id: string) => void;
  onToggleBreak: (taskId: string, includesBreak: boolean) => void;
};

function todayIso() {
  return dayjs().format("YYYY-MM-DD");
}

export function TimeTrackingDailyView({
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
  const [selectedGanttTaskId, setSelectedGanttTaskId] = useState("");
  const [start, setStart] = useState("");
  const [stop, setStop] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [error, setError] = useState("");
  const { settings } = useSettings();
  const { tasks: ganttTasks } = useGanttTasks();
  const showGanttPicker = settings.enableGantt && ganttTasks.length > 0;
  const toast = useToast();
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const liveTime = useLiveTime({ precision: "second" });
  const isDailyCurrent = dayjs(date).isSame(dayjs(), "day");
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

  const { dailyTasks, runningTask } = useDailyTaskSummary(tasks, date);

  const hasTaskDetails = text.trim().length > 0 && selectedLabel.trim().length > 0;
  const hasCompletedRange = hasTaskDetails && start.trim().length > 0 && stop.trim().length > 0;
  const canAddCompletedTask = hasCompletedRange && isValidRange(start, stop);
  const canStartNow = !runningTask && selectedLabel.trim().length > 0;
  const startDisabledReason = runningTask
    ? m.tt_reason_stopwatch_running()
    : !selectedLabel.trim()
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
    if (!selectedLabel.trim()) {
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
      ganttTaskId: selectedGanttTaskId || undefined,
      startTime: `${date}T${start}`,
      stopTime: `${date}T${stop}`,
    });
    if (!added) {
      setError(m.tt_error_task_already_running());
      return;
    }
    setText("");
    setSelectedGanttTaskId("");
    setStart("");
    setStop("");
  };

  const handleStartNow = async () => {
    setError("");
    if (runningTask) {
      setError(m.tt_error_task_already_running_start());
      return;
    }
    if (!selectedLabel.trim()) {
      setError(m.tt_error_configure_label());
      return;
    }
    const now = dayjs();
    const startTime = now.format("YYYY-MM-DDTHH:mm");
    const startDate = now.format("YYYY-MM-DD");
    const added = await onAddTask({
      id: crypto.randomUUID(),
      text: text.trim() || m.tt_default_task_name(),
      label: selectedLabel,
      ganttTaskId: selectedGanttTaskId || undefined,
      startTime,
    });
    if (!added) {
      setError(m.tt_error_task_already_running_start());
      return;
    }
    onSelectedDateChange(startDate);
    setText("");
    setSelectedGanttTaskId("");
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
    ganttTaskId: string;
  }): Promise<boolean> => {
    setError("");
    if (!payload.text.trim() || !payload.label || !payload.start) {
      setError(m.tt_error_fill_all_fields());
      return false;
    }
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

    const currentGanttTaskId = tasks.find((item) => item.id === payload.id)?.ganttTaskId ?? "";
    onUpdateTaskTimes({
      id: payload.id,
      newText: payload.text.trim(),
      newLabel: payload.label,
      ...(payload.ganttTaskId !== currentGanttTaskId ? { ganttTaskId: payload.ganttTaskId } : {}),
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
        <DailyViewHeader
          date={date}
          crossBorderEnabled={settings.enableCrossBorderTracking}
          onSelectedDateChange={onSelectedDateChange}
        />
      </Card.Header>
      <Card.Body>
        {error && (
          <Alert variant="danger" aria-live="polite">
            {error}
          </Alert>
        )}
        <DailyTemplatePicker
          options={templateOptions}
          value={selectedTemplateOption}
          onChange={setSelectedTemplateId}
          onApply={handleApplyTemplate}
        />

        <DailyQuickTimer
          runningTask={runningTask}
          liveTime={liveTime}
          colorByLabelId={colorByLabelId}
          labelNameById={labelNameById}
          defaultLabelColor={defaultLabelColor}
          onStopNow={handleStopNow}
        />

        <TaskEntryForm
          labels={labels}
          text={text}
          onTextChange={setText}
          label={selectedLabel}
          onLabelChange={setSelectedLabel}
          ganttTasks={ganttTasks}
          ganttTaskId={selectedGanttTaskId}
          onGanttTaskChange={setSelectedGanttTaskId}
          showGanttPicker={showGanttPicker}
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
          ganttTasks={ganttTasks}
          showGanttPicker={showGanttPicker}
          editRequest={editRequest}
          onEditRequestHandled={() => setEditRequest(null)}
          onUpdateTask={handleUpdateTask}
          onRemoveTask={onRemoveTask}
          onToggleBreak={onToggleBreak}
          liveTime={liveTime}
          isToday={isDailyCurrent}
        />
      </Card.Body>

      <DailyDiscardConfirmation
        isOpen={showDiscardConfirm}
        runningTask={runningTask}
        onRemoveTask={onRemoveTask}
        onClose={() => setShowDiscardConfirm(false)}
      />
    </Card>
  );
}
