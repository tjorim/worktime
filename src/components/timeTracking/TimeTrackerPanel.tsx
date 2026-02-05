import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { Alert, Button, Col, Form, ListGroup, Row } from "react-bootstrap";
import { ProgressBar } from "./ProgressBar";
import { TIME_TRACKING_TAGS, type TimeTrackingTag } from "./constants";
import { TemplateModal } from "./TemplateModal";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "./types";
import { calculateDurationHours, isValidRange, overlaps } from "./timeUtils";

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

type TimeTrackerPanelProps = {
  tasks: StoredTimeTrackingTask[];
  templates: TimeTrackingTemplate[];
  onAddTask: (payload: StoredTimeTrackingTask) => void;
  onUpdateTaskTimes: (payload: {
    date: string;
    id: string;
    newStart: string;
    newStop: string;
  }) => void;
  onRemoveTask: (id: string) => void;
  onAddTemplate: (payload: Omit<TimeTrackingTemplate, "id">) => void;
  onUpdateTemplate: (payload: { id: number; template: Omit<TimeTrackingTemplate, "id"> }) => void;
  onDeleteTemplate: (id: number) => void;
  onExportData: (date: string) => void;
  onImportData: (payload: ImportPayload) => void;
};

function todayIso() {
  return dayjs().format("YYYY-MM-DD");
}

function tagToClass(tag: string) {
  return tag.toLowerCase().replace(/[^a-z0-9]+/g, "-");
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
  const [editTemplateId, setEditTemplateId] = useState<number | null>(null);
  const [editTimes, setEditTimes] = useState<Record<string, { start: string; stop: string }>>({});

  const dailyTasks = useMemo(() => tasks.filter((task) => task.date === date), [tasks, date]);

  useEffect(() => {
    setEditTimes((prev) => {
      const next: Record<string, { start: string; stop: string }> = {};
      dailyTasks.forEach((task) => {
        next[task.id] = prev[task.id] ?? { start: task.start, stop: task.stop };
      });
      return next;
    });
  }, [dailyTasks]);

  const totalHours = useMemo(
    () => dailyTasks.reduce((sum, task) => sum + calculateDurationHours(task.start, task.stop), 0),
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
    if (overlaps(start, stop, dailyTasks)) {
      setError("Time range overlaps an existing task.");
      return;
    }

    onAddTask({
      id: crypto.randomUUID(),
      date,
      text,
      tag,
      start,
      stop,
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
    if (overlaps(edit.start, edit.stop, dailyTasks, taskId)) {
      setError("Time range overlaps an existing task.");
      return;
    }

    onUpdateTaskTimes({ date, id: taskId, newStart: edit.start, newStop: edit.stop });
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
      const parsed = JSON.parse(text) as ImportPayload;
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

      <Row className="g-3 align-items-end">
        <Col md={3}>
          <Form.Group controlId="timeTrackerDate">
            <Form.Label>Select Date</Form.Label>
            <Form.Control
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-required="true"
              aria-describedby={error ? "date-error" : undefined}
            />
            {error && (
              <div id="date-error" className="text-danger small mt-1">
                {error}
              </div>
            )}
          </Form.Group>
        </Col>
        <Col md={4}>
          <Form.Group controlId="timeTrackerTask">
            <Form.Label>Task</Form.Label>
            <Form.Control
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-required="true"
              aria-describedby={error ? "task-error" : undefined}
            />
            {error && (
              <div id="task-error" className="text-danger small mt-1">
                {error}
              </div>
            )}
          </Form.Group>
        </Col>
        <Col md={3}>
          <Form.Group controlId="timeTrackerTag">
            <Form.Label>Tag</Form.Label>
            <Form.Select
              value={tag}
              onChange={(e) => setTag(e.target.value as TimeTrackingTag)}
              aria-required="true"
              aria-describedby={error ? "tag-error" : undefined}
            >
              {TIME_TRACKING_TAGS.map((item) => (
                <option key={item} value={item}>
                  {item.replaceAll("-", " ")}
                </option>
              ))}
            </Form.Select>
            {error && (
              <div id="tag-error" className="text-danger small mt-1">
                {error}
              </div>
            )}
          </Form.Group>
        </Col>
        <Col md={2}>
          <Form.Group controlId="timeTrackerStart">
            <Form.Label>Start</Form.Label>
            <Form.Control
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              aria-required="true"
              aria-describedby={error ? "start-error" : undefined}
            />
            {error && (
              <div id="start-error" className="text-danger small mt-1">
                {error}
              </div>
            )}
          </Form.Group>
        </Col>
        <Col md={2}>
          <Form.Group controlId="timeTrackerStop">
            <Form.Label>Stop</Form.Label>
            <Form.Control
              type="time"
              value={stop}
              onChange={(e) => setStop(e.target.value)}
              aria-required="true"
              aria-describedby={error ? "stop-error" : undefined}
            />
            {error && (
              <div id="stop-error" className="text-danger small mt-1">
                {error}
              </div>
            )}
          </Form.Group>
        </Col>
        <Col md={2}>
          <Button className="w-100" onClick={handleAddTask}>
            Add Task
          </Button>
        </Col>
      </Row>

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

      {dailyTasks.length === 0 ? (
        <Alert className="mt-3" variant="secondary">
          No time entries yet for this date.
        </Alert>
      ) : (
        <ListGroup className="mt-3">
          {dailyTasks.map((task) => {
            const edit = editTimes[task.id] ?? { start: task.start, stop: task.stop };
            return (
              <ListGroup.Item key={task.id}>
                <div className="fw-semibold">
                  {task.text}{" "}
                  <span className={`time-tracking-tag time-tracking-tag-${tagToClass(task.tag)}`}>
                    {task.tag}
                  </span>
                </div>
                <div className="small text-muted mb-2">
                  Start: {task.start} · Stop: {task.stop}
                </div>
                <Row className="g-2 align-items-center">
                  <Col md={3}>
                    <Form.Control
                      type="time"
                      value={edit.start}
                      aria-label={`Start time for ${task.id}`}
                      onChange={(event) =>
                        setEditTimes((prev) => ({
                          ...prev,
                          [task.id]: { ...edit, start: event.target.value },
                        }))
                      }
                    />
                  </Col>
                  <Col md={3}>
                    <Form.Control
                      type="time"
                      value={edit.stop}
                      aria-label={`Stop time for ${task.id}`}
                      onChange={(event) =>
                        setEditTimes((prev) => ({
                          ...prev,
                          [task.id]: { ...edit, stop: event.target.value },
                        }))
                      }
                    />
                  </Col>
                  <Col md={6} className="d-flex gap-2">
                    <Button
                      size="sm"
                      variant="outline-primary"
                      onClick={() => handleUpdateTask(task.id)}
                    >
                      Update
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-danger"
                      onClick={() => onRemoveTask(task.id)}
                    >
                      Remove
                    </Button>
                  </Col>
                </Row>
              </ListGroup.Item>
            );
          })}
        </ListGroup>
      )}

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
