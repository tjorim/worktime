import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import type { Dayjs } from "dayjs";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import Row from "react-bootstrap/Row";
import { dayjs } from "../../utils/dateTimeUtils";
import { DailyTaskList } from "./DailyTaskList";
import { ProgressBar } from "./ProgressBar";
import { TaskEntryForm } from "./TaskEntryForm";
import { TIME_TRACKING_TAGS, type TimeTrackingTag } from "./constants";
import { TemplateModal } from "./TemplateModal";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "./types";
import { isValidRange, overlaps } from "./timeUtils";

type TemplateFormState = {
  text: string;
  tag: TimeTrackingTag;
  start: string;
  stop: string;
};

type ImportPayload = {
  tasks?: StoredTimeTrackingTask[];
  templates?: TimeTrackingTemplate[];
};

function validateImportPayload(parsed: unknown): parsed is ImportPayload {
  if (!parsed || typeof parsed !== "object") {
    return false;
  }

  const payload = parsed as Record<string, unknown>;

  // At least one of tasks or templates must be present
  if (!("tasks" in payload) && !("templates" in payload)) {
    return false;
  }

  // If tasks is present, it must be an array
  if ("tasks" in payload && payload.tasks !== undefined && !Array.isArray(payload.tasks)) {
    return false;
  }

  // If templates is present, it must be an array
  if (
    "templates" in payload &&
    payload.templates !== undefined &&
    !Array.isArray(payload.templates)
  ) {
    return false;
  }

  return true;
}

type TimeTrackerPanelProps = {
  tasks: StoredTimeTrackingTask[];
  templates: TimeTrackingTemplate[];
  onAddTask: (payload: StoredTimeTrackingTask) => void;
  onUpdateTaskTimes: (payload: { id: string; newStartTime: Dayjs; newStopTime: Dayjs }) => void;
  onRemoveTask: (id: string) => void;
  onAddTemplate: (payload: Omit<TimeTrackingTemplate, "id">) => void;
  onUpdateTemplate: (payload: { id: string; template: Omit<TimeTrackingTemplate, "id"> }) => void;
  onDeleteTemplate: (id: string) => void;
  onExportData: (date: string) => void;
  onImportData: (payload: ImportPayload) => void;
};

function todayIso() {
  return dayjs().format("YYYY-MM-DD");
}

export function TimeTrackerPanel({
  tasks,
  templates,
  onAddTask,
  onUpdateTaskTimes,
  onRemoveTask,
  onAddTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onExportData,
  onImportData,
}: TimeTrackerPanelProps) {
  const [date, setDate] = useState(todayIso());
  const [text, setText] = useState("");
  const [tag, setTag] = useState<TimeTrackingTag>(TIME_TRACKING_TAGS[0]);
  const [start, setStart] = useState("");
  const [stop, setStop] = useState("");
  const [error, setError] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);

  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [showEditTemplate, setShowEditTemplate] = useState(false);
  const [templateForm, setTemplateForm] = useState<TemplateFormState>({
    text: "",
    tag: TIME_TRACKING_TAGS[0],
    start: "",
    stop: "",
  });
  const [editTemplateId, setEditTemplateId] = useState<string | null>(null);
  const [editTimes, setEditTimes] = useState<Record<string, { start: string; stop: string }>>({});

  const dailyTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.startTime.format("YYYY-MM-DD") === date)
        .sort((a, b) => a.startTime.diff(b.startTime)),
    [tasks, date],
  );

  useEffect(() => {
    setEditTimes((prev) => {
      const next: Record<string, { start: string; stop: string }> = {};
      dailyTasks.forEach((task) => {
        next[task.id] = prev[task.id] ?? {
          start: task.startTime.format("HH:mm"),
          stop: task.stopTime.format("HH:mm"),
        };
      });
      return next;
    });
  }, [dailyTasks]);

  const totalHours = useMemo(
    () =>
      dailyTasks.reduce((sum, task) => sum + task.stopTime.diff(task.startTime, "hour", true), 0),
    [dailyTasks],
  );

  const resetTemplateForm = () =>
    setTemplateForm({ text: "", tag: TIME_TRACKING_TAGS[0], start: "", stop: "" });

  const handleAddTask = () => {
    setError("");
    if (!text || !date || !start || !stop) {
      setError("Please fill in all fields.");
      return;
    }
    if (!isValidRange(start, stop)) {
      setError("Stop time must be after start time.");
      return;
    }
    const dailyForOverlap = dailyTasks.map((t) => ({
      id: t.id,
      start: t.startTime.format("HH:mm"),
      stop: t.stopTime.format("HH:mm"),
    }));
    if (overlaps(start, stop, dailyForOverlap)) {
      setError("Time range overlaps an existing task.");
      return;
    }

    onAddTask({
      id: crypto.randomUUID(),
      text,
      tag,
      startTime: dayjs(`${date}T${start}`),
      stopTime: dayjs(`${date}T${stop}`),
    });
    setText("");
    setStart("");
    setStop("");
  };

  const handleUpdateTask = (taskId: string) => {
    setError("");
    const edit = editTimes[taskId];
    if (!edit?.start || !edit?.stop) {
      setError("Please select both start and stop times.");
      return;
    }
    if (!isValidRange(edit.start, edit.stop)) {
      setError("Stop time must be after start time.");
      return;
    }
    const dailyForOverlap = dailyTasks.map((t) => ({
      id: t.id,
      start: t.startTime.format("HH:mm"),
      stop: t.stopTime.format("HH:mm"),
    }));
    if (overlaps(edit.start, edit.stop, dailyForOverlap, taskId)) {
      setError("Time range overlaps an existing task.");
      return;
    }

    onUpdateTaskTimes({
      id: taskId,
      newStartTime: dayjs(`${date}T${edit.start}`),
      newStopTime: dayjs(`${date}T${edit.stop}`),
    });
  };

  const handleApplyTemplate = (template: TimeTrackingTemplate) => {
    setText(template.text);
    setTag(template.tag);
    setStart(template.start);
    setStop(template.stop);
  };

  const handleSaveTemplate = () => {
    if (!templateForm.text || !templateForm.start || !templateForm.stop) {
      setError("Fill all template fields.");
      return;
    }
    if (!isValidRange(templateForm.start, templateForm.stop)) {
      setError("Template stop time must be after start time.");
      return;
    }
    onAddTemplate(templateForm);
    resetTemplateForm();
    setShowNewTemplate(false);
  };

  const handleEditTemplate = (template: TimeTrackingTemplate) => {
    setEditTemplateId(template.id);
    setTemplateForm({
      text: template.text,
      tag: template.tag,
      start: template.start,
      stop: template.stop,
    });
    setShowEditTemplate(true);
  };

  const handleUpdateTemplate = () => {
    if (editTemplateId === null) {
      return;
    }
    if (!templateForm.text || !templateForm.start || !templateForm.stop) {
      setError("Fill all template fields.");
      return;
    }
    if (!isValidRange(templateForm.start, templateForm.stop)) {
      setError("Template stop time must be after start time.");
      return;
    }
    onUpdateTemplate({ id: editTemplateId, template: templateForm });
    setShowEditTemplate(false);
    setEditTemplateId(null);
    resetTemplateForm();
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      // Validate the parsed payload before importing
      if (!validateImportPayload(parsed)) {
        setError("Import failed. Please select a valid export file.");
        return;
      }

      onImportData(parsed);
      setError("");
    } catch {
      setError("Import failed. Please select a valid export file.");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div>
      {error && (
        <Alert variant="danger" aria-live="polite">
          {error}
        </Alert>
      )}

      <Row className="g-3 mb-3">
        <Col md={3}>
          <Form.Group controlId="timeTrackerDate">
            <Form.Label>Select Date</Form.Label>
            <Form.Control
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-required="true"
            />
          </Form.Group>
        </Col>
      </Row>

      <TaskEntryForm
        text={text}
        onTextChange={setText}
        tag={tag}
        onTagChange={setTag}
        start={start}
        onStartChange={setStart}
        stop={stop}
        onStopChange={setStop}
        onSubmit={handleAddTask}
      />

      <Button
        variant="outline-secondary"
        className="mt-3"
        onClick={() => setShowTemplates((prev) => !prev)}
      >
        {showTemplates ? "Hide templates" : "Show templates"}
      </Button>

      {showTemplates && (
        <div className="mt-3">
          <div className="d-flex justify-content-between align-items-center">
            <h5 className="mb-0">Quick Templates</h5>
            <Button size="sm" onClick={() => setShowNewTemplate(true)}>
              Add Template
            </Button>
          </div>
          <ListGroup className="mt-2">
            {templates.map((template) => (
              <ListGroup.Item key={template.id} className="d-flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline-primary"
                  onClick={() => handleApplyTemplate(template)}
                >
                  {template.text} ({template.start}-{template.stop})
                </Button>
                <Button
                  size="sm"
                  variant="outline-secondary"
                  onClick={() => handleEditTemplate(template)}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline-danger"
                  onClick={() => onDeleteTemplate(template.id)}
                >
                  Delete
                </Button>
              </ListGroup.Item>
            ))}
          </ListGroup>
        </div>
      )}

      <ProgressBar hours={totalHours} />

      <div className="d-flex flex-wrap gap-2 mt-3">
        <Button size="sm" variant="outline-secondary" onClick={() => onExportData(date)}>
          Export Data
        </Button>
        <Form.Label className="btn btn-outline-secondary btn-sm mb-0">
          Import Data
          <Form.Control type="file" accept="application/json" onChange={handleImport} hidden />
        </Form.Label>
      </div>

      <DailyTaskList
        tasks={dailyTasks}
        editTimes={editTimes}
        onEditTimesChange={setEditTimes}
        onUpdateTask={handleUpdateTask}
        onRemoveTask={onRemoveTask}
      />

      <TemplateModal
        show={showNewTemplate}
        title="Add New Template"
        submitLabel="Save Template"
        value={templateForm}
        onChange={setTemplateForm}
        onClose={() => {
          resetTemplateForm();
          setShowNewTemplate(false);
        }}
        onSubmit={handleSaveTemplate}
      />

      <TemplateModal
        show={showEditTemplate}
        title="Edit Template"
        submitLabel="Save Changes"
        value={templateForm}
        onChange={setTemplateForm}
        onClose={() => {
          resetTemplateForm();
          setShowEditTemplate(false);
        }}
        onSubmit={handleUpdateTemplate}
      />
    </div>
  );
}
