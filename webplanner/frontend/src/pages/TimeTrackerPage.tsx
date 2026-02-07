import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { Alert, Button, Card, Col, Form, ListGroup, Row } from "react-bootstrap";
import {
  addTask,
  addTemplate,
  deleteTemplate,
  fetchTasks,
  fetchTemplates,
  removeTask,
  updateTaskTimes,
  updateTemplate,
} from "../api/client";
import { ProgressBar } from "../components/ProgressBar";
import { TemplateModal } from "../components/TemplateModal";
import type { Task, Template } from "../types";
import { calculateDurationHours, isValidRange, overlaps } from "../utils/time";
import { getTasks, getTemplates, saveTasks, saveTemplates } from "../storage/localStore";

const tags = [
  "Factory-Improvement",
  "Support",
  "Meeting",
  "NPI-DUV",
  "NPI-EUV",
  "Department-Improvement",
  "Training",
  "Lunch",
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function TimeTrackerPage() {
  const [date, setDate] = useState(todayIso());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [text, setText] = useState("");
  const [tag, setTag] = useState(tags[0]);
  const [start, setStart] = useState("");
  const [stop, setStop] = useState("");
  const [error, setError] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);

  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [showEditTemplate, setShowEditTemplate] = useState(false);
  const [templateForm, setTemplateForm] = useState({
    text: "",
    tag: tags[0],
    start: "",
    stop: "",
  });
  const [editTemplateId, setEditTemplateId] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchTasks(date);
        setTasks(data);
      } catch (err) {
        console.error("Failed to load tasks.", err);
        setError("Failed to load tasks.");
      }
    };
    load();
  }, [date]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchTemplates();
        setTemplates(data);
      } catch (err) {
        console.error("Failed to load templates.", err);
        setError("Failed to load templates.");
      }
    };
    load();
  }, []);

  const totalHours = useMemo(
    () => tasks.reduce((sum, t) => sum + calculateDurationHours(t.start, t.stop), 0),
    [tasks],
  );

  const resetTemplateForm = () => setTemplateForm({ text: "", tag: tags[0], start: "", stop: "" });

  const handleAddTask = async () => {
    setError("");
    if (!text || !date || !start || !stop) {
      setError("Please fill in all fields.");
      return;
    }
    if (!isValidRange(start, stop)) {
      setError("Stop time must be after start time.");
      return;
    }
    if (overlaps(start, stop, tasks)) {
      setError("Time range overlaps an existing task.");
      return;
    }

    await addTask({
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
    const data = await fetchTasks(date);
    setTasks(data);
  };

  const handleUpdateTask = async (taskId: string, newStart: string, newStop: string) => {
    setError("");
    if (!newStart || !newStop) {
      setError("Please select both start and stop times.");
      return;
    }
    if (!isValidRange(newStart, newStop)) {
      setError("Stop time must be after start time.");
      return;
    }
    if (overlaps(newStart, newStop, tasks, taskId)) {
      setError("Time range overlaps an existing task.");
      return;
    }

    await updateTaskTimes({ date, id: taskId, newStart, newStop });
    const data = await fetchTasks(date);
    setTasks(data);
  };

  const handleRemoveTask = async (taskId: string) => {
    await removeTask(taskId);
    const data = await fetchTasks(date);
    setTasks(data);
  };

  const handleApplyTemplate = (tpl: Template) => {
    setText(tpl.text);
    setTag(tpl.tag);
    setStart(tpl.start);
    setStop(tpl.stop);
  };

  const handleSaveTemplate = async () => {
    if (!templateForm.text || !templateForm.start || !templateForm.stop) {
      setError("Fill all template fields.");
      return;
    }
    if (!isValidRange(templateForm.start, templateForm.stop)) {
      setError("Template stop time must be after start time.");
      return;
    }
    await addTemplate(templateForm);
    resetTemplateForm();
    setShowNewTemplate(false);
    setTemplates(await fetchTemplates());
  };

  const handleEditTemplate = (tpl: Template) => {
    setEditTemplateId(tpl.id);
    setTemplateForm({
      text: tpl.text,
      tag: tpl.tag,
      start: tpl.start,
      stop: tpl.stop,
    });
    setShowEditTemplate(true);
  };

  const handleUpdateTemplate = async () => {
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
    await updateTemplate({
      id: editTemplateId,
      template: templateForm,
    });
    setShowEditTemplate(false);
    setEditTemplateId(null);
    resetTemplateForm();
    setTemplates(await fetchTemplates());
  };

  const handleDeleteTemplate = async (tpl: Template) => {
    await deleteTemplate(tpl.id);
    setTemplates(await fetchTemplates());
  };

  const handleExport = () => {
    const payload = {
      tasks: getTasks(),
      templates: getTemplates(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `webplanner-export-${date}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        tasks?: Array<Task & { date: string }>;
        templates?: Template[];
      };
      if (parsed.tasks) {
        saveTasks(parsed.tasks);
        setTasks(await fetchTasks(date));
      }
      if (parsed.templates) {
        saveTemplates(parsed.templates);
        setTemplates(await fetchTemplates());
      }
      setError("");
    } catch {
      setError("Import failed. Please select a valid export file.");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <Card className="shadow-sm">
      <Card.Body>
        <Card.Title>Task Manager</Card.Title>

        {error && <Alert variant="danger">{error}</Alert>}

        <Row className="g-3 align-items-end">
          <Col md={3}>
            <Form.Group>
              <Form.Label>Select Date</Form.Label>
              <Form.Control type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Form.Group>
          </Col>
          <Col md={4}>
            <Form.Group>
              <Form.Label>Task</Form.Label>
              <Form.Control value={text} onChange={(e) => setText(e.target.value)} />
            </Form.Group>
          </Col>
          <Col md={3}>
            <Form.Group>
              <Form.Label>Tag</Form.Label>
              <Form.Select value={tag} onChange={(e) => setTag(e.target.value)}>
                {tags.map((item) => (
                  <option key={item} value={item}>
                    {item.replace("-", " ")}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={2}>
            <Form.Group>
              <Form.Label>Start</Form.Label>
              <Form.Control type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </Form.Group>
          </Col>
          <Col md={2}>
            <Form.Group>
              <Form.Label>Stop</Form.Label>
              <Form.Control type="time" value={stop} onChange={(e) => setStop(e.target.value)} />
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
              {templates.map((tpl) => (
                <ListGroup.Item key={tpl.id} className="d-flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline-primary"
                    onClick={() => handleApplyTemplate(tpl)}
                  >
                    {tpl.text} ({tpl.start}-{tpl.stop})
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    onClick={() => handleEditTemplate(tpl)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-danger"
                    onClick={() => handleDeleteTemplate(tpl)}
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
          <Button size="sm" variant="outline-light" onClick={handleExport}>
            Export Data
          </Button>
          <Form.Label className="btn btn-outline-light btn-sm mb-0">
            Import Data
            <Form.Control type="file" accept="application/json" onChange={handleImport} hidden />
          </Form.Label>
        </div>

        <ListGroup className="mt-3">
          {tasks.map((task) => (
            <ListGroup.Item key={task.id}>
              <div className="fw-semibold">
                {task.text} <span className={`tag tag-${task.tag}`}>{task.tag}</span>
              </div>
              <div className="small text-muted mb-2">
                Start: {task.start} · Stop: {task.stop}
              </div>
              <Row className="g-2 align-items-center">
                <Col md={3}>
                  <Form.Control type="time" defaultValue={task.start} id={`start-${task.id}`} />
                </Col>
                <Col md={3}>
                  <Form.Control type="time" defaultValue={task.stop} id={`stop-${task.id}`} />
                </Col>
                <Col md={6} className="d-flex gap-2">
                  <Button
                    size="sm"
                    variant="outline-primary"
                    onClick={() => {
                      const newStart = (
                        document.getElementById(`start-${task.id}`) as HTMLInputElement
                      ).value;
                      const newStop = (
                        document.getElementById(`stop-${task.id}`) as HTMLInputElement
                      ).value;
                      handleUpdateTask(task.id, newStart, newStop);
                    }}
                  >
                    Update
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-danger"
                    onClick={() => handleRemoveTask(task.id)}
                  >
                    Remove
                  </Button>
                </Col>
              </Row>
            </ListGroup.Item>
          ))}
        </ListGroup>
      </Card.Body>

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
    </Card>
  );
}
