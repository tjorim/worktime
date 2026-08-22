import { useEffect, useMemo, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Card from "react-bootstrap/Card";
import { useSettings } from "@/contexts/SettingsContext";
import { useToast } from "@/contexts/ToastContext";
import { dayjs, formatTimeByPreference } from "@/utils/dateTimeUtils";
import { useLiveTime } from "@/hooks/useLiveTime";
import { useGanttTasks } from "@/hooks/useGanttTasks";
import * as m from "@/paraglide/messages.js";

import { DailyDiscardConfirmation } from "./DailyDiscardConfirmation";
import { DailyTaskList, type EditRequest } from "./DailyTaskList";
import { DailyTemplatePicker } from "./DailyTemplatePicker";
import { DailyViewHeader } from "./DailyViewHeader";
import { TimelineProgressBar } from "./TimelineProgressBar";
import { TaskEntryForm } from "./TaskEntryForm";
import { StopTimerConflictDialog } from "./StopTimerConflictDialog";
import { LabelModal } from "./LabelModal";
import {
  buildLabelColorMap,
  buildLabelNameMap,
  getContrastingTextColor,
  isHexColor,
  normalizeLabelName,
  useDefaultLabelColor,
  type Label,
} from "./constants";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "./types";
import { BREAK_DURATION_MINUTES, isValidRange, overlaps } from "./timeUtils";
import { useDailyTaskSummary } from "./hooks/useDailyTaskSummary";

type TimeTrackingDailyViewProps = {
  tasks: StoredTimeTrackingTask[];
  labels: Label[];
  templates: TimeTrackingTemplate[];
  selectedDate: string;
  onSelectedDateChange: (date: string) => void;
  onAddTask: (payload: StoredTimeTrackingTask) => Promise<boolean>;
  onUpdateLabels: (labels: Label[]) => void;
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
  /** One-shot request to open a specific entry's edit modal, e.g. from another tab. */
  externalEditRequest?: EditRequest | null;
  onExternalEditRequestHandled?: () => void;
};

function todayIso() {
  return dayjs().format("YYYY-MM-DD");
}

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return [hours, minutes, seconds].map((part) => part.toString().padStart(2, "0")).join(":");
}

export function TimeTrackingDailyView({
  tasks,
  labels,
  templates = [],
  selectedDate,
  onSelectedDateChange,
  onAddTask,
  onUpdateLabels,
  onUpdateTaskTimes,
  onRemoveTask,
  onToggleBreak,
  externalEditRequest,
  onExternalEditRequestHandled,
}: TimeTrackingDailyViewProps) {
  const date = selectedDate || todayIso();
  const [editRequest, setEditRequest] = useState<EditRequest | null>(null);

  useEffect(() => {
    if (externalEditRequest) {
      setEditRequest(externalEditRequest);
      onExternalEditRequestHandled?.();
    }
  }, [externalEditRequest, onExternalEditRequestHandled]);
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
  const [stopConflict, setStopConflict] = useState<{
    runningTask: StoredTimeTrackingTask;
    tasks: StoredTimeTrackingTask[];
    now: string;
  } | null>(null);
  const [showCreateLabelModal, setShowCreateLabelModal] = useState(false);
  const [createLabelForm, setCreateLabelForm] = useState({ name: "", color: "" });
  const liveTime = useLiveTime({ precision: "second" });
  const isDailyCurrent = dayjs(date).isSame(dayjs(), "day");
  const labelNameById = useMemo(() => buildLabelNameMap(labels), [labels]);
  const labelColorById = useMemo(() => buildLabelColorMap(labels), [labels]);
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
  const nowFallsInsideTask = dailyTasks.some((task) => {
    if (!task.stopTime || task.id === runningTask?.id) return false;
    const startTime = dayjs(task.startTime);
    return !liveTime.isBefore(startTime) && liveTime.isBefore(dayjs(task.stopTime));
  });
  const timerElapsed = runningTask
    ? formatDuration(liveTime.diff(dayjs(runningTask.startTime), "second"))
    : undefined;
  const isRunningTaskVisible = runningTask
    ? dailyTasks.some((task) => task.id === runningTask.id)
    : false;

  const hasTaskDetails = text.trim().length > 0 && selectedLabel.trim().length > 0;
  const hasCompletedRange = hasTaskDetails && start.trim().length > 0 && stop.trim().length > 0;
  const canAddCompletedTask = hasCompletedRange && isValidRange(start, stop);
  const canStartNow = !runningTask && !nowFallsInsideTask && selectedLabel.trim().length > 0;
  const startDisabledReason = runningTask
    ? m.tt_reason_stopwatch_running()
    : nowFallsInsideTask
      ? m.tt_error_time_overlap()
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
    if (nowFallsInsideTask) {
      setError(m.tt_error_time_overlap());
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
    const reachedTasks = tasks
      .filter((task) => task.id !== runningTask.id)
      .filter((task) => {
        const taskStart = dayjs(task.startTime);
        return task.stopTime && taskStart.isAfter(startDayjs) && !taskStart.isAfter(now);
      })
      .sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf());
    if (reachedTasks.length > 0) {
      setStopConflict({
        runningTask,
        tasks: reachedTasks,
        now: now.format("HH:mm"),
      });
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

  const handleResolveStopConflict = (stopTime: string) => {
    if (!stopConflict) return;
    const taskDate = dayjs(stopConflict.runningTask.startTime).format("YYYY-MM-DD");
    const stopDateTime = `${taskDate}T${stopTime}`;

    for (const plannedTask of stopConflict.tasks) {
      if (!plannedTask.stopTime || !dayjs(plannedTask.startTime).isBefore(stopDateTime)) continue;
      if (!dayjs(plannedTask.stopTime).isAfter(stopDateTime)) {
        onRemoveTask(plannedTask.id);
      } else {
        onUpdateTaskTimes({
          id: plannedTask.id,
          newStartTime: stopDateTime,
          newStopTime: plannedTask.stopTime,
        });
        if (
          plannedTask.includesBreak &&
          dayjs(plannedTask.stopTime).diff(dayjs(stopDateTime), "minute") <
            BREAK_DURATION_MINUTES
        ) {
          onToggleBreak(plannedTask.id, false);
        }
      }
    }

    onUpdateTaskTimes({
      id: stopConflict.runningTask.id,
      newStartTime: stopConflict.runningTask.startTime,
      newStopTime: stopDateTime,
    });
    setStopConflict(null);
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
    const originalTask = tasks.find((item) => item.id === payload.id);
    const newStartTime = `${taskDate}T${payload.start}`;
    const newStopTime = payload.stop ? `${taskDate}T${payload.stop}` : null;

    if (
      originalTask &&
      dayjs(originalTask.startTime).isAfter(liveTime) &&
      !dayjs(newStartTime).isAfter(liveTime)
    ) {
      setError(m.tt_error_planned_task_in_past());
      return false;
    }

    const sameDayTasks = tasks.filter(
      (task) => dayjs(task.startTime).format("YYYY-MM-DD") === taskDate,
    );
    const dailyForOverlap = sameDayTasks.map((task) => ({
      id: task.id,
      start: dayjs(task.startTime).format("HH:mm"),
      stop: (task.stopTime ? dayjs(task.stopTime) : liveTime).format("HH:mm"),
    }));
    const overlapStop = payload.stop || liveTime.format("HH:mm");
    if (overlaps(payload.start, overlapStop, dailyForOverlap, payload.id)) {
      setError(m.tt_error_time_overlap());
      return false;
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

  const handleOpenCreateLabelModal = () => {
    setCreateLabelForm({ name: "", color: defaultLabelColor });
    setShowCreateLabelModal(true);
  };

  const handleCloseCreateLabelModal = () => {
    setShowCreateLabelModal(false);
  };

  const handleCreateLabelSubmit = () => {
    const name = normalizeLabelName(createLabelForm.name);
    if (!name) {
      toast.showError(m.tt_label_name_required());
      return;
    }
    if (!isHexColor(createLabelForm.color)) {
      toast.showError(m.tt_label_color_invalid());
      return;
    }
    if (labels.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      toast.showError(m.tt_label_name_unique());
      return;
    }

    const newLabel: Label = { id: crypto.randomUUID(), name, color: createLabelForm.color };
    onUpdateLabels([...labels, newLabel]);
    setSelectedLabel(newLabel.id);
    toast.showSuccess(m.tt_label_added());
    setShowCreateLabelModal(false);
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
          showTimerControls
          isTimerRunning={runningTask !== null}
          timerElapsed={timerElapsed}
          runningTaskSummary={
            runningTask
              ? {
                  task: runningTask.text,
                  label: labelNameById[runningTask.label] ?? m.tt_unknown_label(),
                  time: `${dayjs(runningTask.startTime).format("YYYY-MM-DD")} ${formatTimeByPreference(
                    dayjs(runningTask.startTime),
                    settings.timeFormat,
                  )}`,
                  labelColor: labelColorById[runningTask.label] ?? defaultLabelColor,
                  labelTextColor: getContrastingTextColor(
                    labelColorById[runningTask.label] ?? defaultLabelColor,
                  ),
                  showDetails: !isRunningTaskVisible,
                }
              : undefined
          }
          startDisabledReason={startDisabledReason}
          addDisabledReason={addDisabledReason}
          onSubmit={handleAddTask}
          onStartNow={handleStartNow}
          onStopNow={handleStopNow}
          onCreateLabel={handleOpenCreateLabelModal}
        />

        <TimelineProgressBar
          tasks={dailyTasks}
          labels={labels}
          liveTime={liveTime}
          isToday={isDailyCurrent}
        />

        <DailyTaskList
          tasks={dailyTasks}
          validationTasks={tasks}
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

      <StopTimerConflictDialog
        key={`${stopConflict?.runningTask.id ?? "closed"}-${stopConflict?.now ?? ""}`}
        isOpen={stopConflict !== null}
        runningTask={stopConflict?.runningTask ?? null}
        conflictingTasks={stopConflict?.tasks ?? []}
        initialStopTime={stopConflict?.now ?? ""}
        onConfirm={handleResolveStopConflict}
        onClose={() => setStopConflict(null)}
      />

      <LabelModal
        show={showCreateLabelModal}
        title={m.tt_add_label_title()}
        submitLabel={m.tt_save_label()}
        value={createLabelForm}
        onChange={setCreateLabelForm}
        onClose={handleCloseCreateLabelModal}
        onSubmit={handleCreateLabelSubmit}
      />
    </Card>
  );
}
