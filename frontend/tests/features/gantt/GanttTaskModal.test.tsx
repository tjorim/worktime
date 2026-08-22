import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { GanttTaskModal } from "@/features/gantt/GanttTaskModal";
import { labelsCollection, tasksCollection } from "@/db/collections";

describe("GanttTaskModal", () => {
  it("shows validation feedback for required fields", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <GanttTaskModal
        show
        onHide={vi.fn()}
        onSave={onSave}
        existingTasks={[
          { id: "task-1", name: "Task One" },
          { id: "task-2", name: "Task Two" },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add Task" }));

    expect(screen.getByText("Task name is required.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("submits with selected dependencies", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <GanttTaskModal
        show
        onHide={vi.fn()}
        onSave={onSave}
        existingTasks={[
          { id: "task-1", name: "Task One" },
          { id: "task-2", name: "Task Two" },
          { id: "task-3", name: "Task Three" },
        ]}
      />,
    );

    await user.type(screen.getByLabelText("Name"), "Document API");
    await user.selectOptions(screen.getByLabelText("Search tasks…"), ["task-1"]);
    await user.type(screen.getByLabelText("Notes"), "  Keep this note  ");
    await user.click(screen.getByRole("button", { name: "Add Task" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Document API",
        dependencies: "task-1",
        notes: "Keep this note",
      }),
    );
  });

  it("shows linked time tracking entries and their total logged duration", () => {
    labelsCollection.insert({ id: "client", name: "Client", color: "#123456" });
    tasksCollection.insert({
      id: "logged-task",
      text: "Document API",
      label: "client",
      ganttTaskId: "task-1",
      startTime: "2026-03-01T09:00",
      stopTime: "2026-03-01T13:30",
    });

    render(
      <GanttTaskModal
        show
        onHide={vi.fn()}
        onSave={vi.fn()}
        existingTasks={[{ id: "task-1", name: "Task One" }]}
        task={{
          id: "task-1",
          name: "Existing",
          start: "2026-03-01",
          end: "2026-03-03",
          progress: 50,
        }}
      />,
    );

    expect(screen.getByText("Logged time")).toBeInTheDocument();
    expect(screen.getByText("4 h 30 min logged")).toBeInTheDocument();
    expect(screen.getByText("Document API")).toBeInTheDocument();
    expect(screen.getByText("Client · 2026-03-01")).toBeInTheDocument();
  });

  it("navigates to the entry in Time Tracking and closes the modal", async () => {
    const user = userEvent.setup();
    const onHide = vi.fn();
    const onNavigateToEntry = vi.fn();
    labelsCollection.insert({ id: "client-2", name: "Client", color: "#123456" });
    tasksCollection.insert({
      id: "logged-task-nav",
      text: "Write spec",
      label: "client-2",
      ganttTaskId: "task-nav",
      startTime: "2026-03-02T09:00",
      stopTime: "2026-03-02T10:00",
    });

    render(
      <GanttTaskModal
        show
        onHide={onHide}
        onSave={vi.fn()}
        existingTasks={[{ id: "task-nav", name: "Task Nav" }]}
        task={{
          id: "task-nav",
          name: "Task Nav",
          start: "2026-03-01",
          end: "2026-03-03",
          progress: 0,
        }}
        onNavigateToEntry={onNavigateToEntry}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Edit Write spec in Time Tracking" }),
    );

    expect(onNavigateToEntry).toHaveBeenCalledWith("logged-task-nav");
    expect(onHide).toHaveBeenCalled();
  });

  it("unlinks a logged entry from the task without deleting it", async () => {
    const user = userEvent.setup();
    labelsCollection.insert({ id: "client-3", name: "Client", color: "#123456" });
    tasksCollection.insert({
      id: "logged-task-unlink",
      text: "Review PR",
      label: "client-3",
      ganttTaskId: "task-unlink",
      startTime: "2026-03-04T09:00",
      stopTime: "2026-03-04T10:00",
    });

    render(
      <GanttTaskModal
        show
        onHide={vi.fn()}
        onSave={vi.fn()}
        existingTasks={[{ id: "task-unlink", name: "Task Unlink" }]}
        task={{
          id: "task-unlink",
          name: "Task Unlink",
          start: "2026-03-01",
          end: "2026-03-03",
          progress: 0,
        }}
      />,
    );

    expect(screen.getByText("Review PR")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Unlink Review PR from this task" }));

    expect(screen.getByText("No time has been logged for this task yet.")).toBeInTheDocument();
    const stored = (tasksCollection.toArray as Array<{ id: string; ganttTaskId?: string }>).find(
      (t) => t.id === "logged-task-unlink",
    );
    expect(stored?.ganttTaskId).toBeUndefined();
  });

  it("shows edit mode title and delete action", () => {
    render(
      <GanttTaskModal
        show
        onHide={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        existingTasks={[{ id: "task-1", name: "Task One" }]}
        task={{
          id: "task-1",
          name: "Existing",
          start: "2026-03-01",
          end: "2026-03-03",
          progress: 50,
        }}
      />,
    );

    expect(screen.getByText("Edit Task")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Task" })).toBeInTheDocument();
  });

  it("preserves orphaned dependency ID on save", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <GanttTaskModal
        show
        onHide={vi.fn()}
        onSave={onSave}
        existingTasks={[{ id: "task-1", name: "Task One" }]}
        task={{
          id: "editing-task",
          name: "Editing",
          start: "2026-03-01",
          end: "2026-03-03",
          progress: 0,
          dependencies: "orphaned-id",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        dependencies: "orphaned-id",
      }),
    );
  });

  it("handles non-string dependency payloads without crashing", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <GanttTaskModal
        show
        onHide={vi.fn()}
        onSave={onSave}
        existingTasks={[{ id: "task-1", name: "Task One" }]}
        task={{
          id: "editing-task",
          name: "Editing",
          start: "2026-03-01",
          end: "2026-03-03",
          progress: 0,
          dependencies: [" task-1 ", 123] as unknown as string,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        dependencies: "task-1",
      }),
    );
  });
});
