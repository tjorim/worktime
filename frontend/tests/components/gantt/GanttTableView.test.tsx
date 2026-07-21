import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GanttTableView } from "@/components/gantt/GanttTableView";
import { tasksCollection } from "@/db/collections";
import type { GanttTask } from "@/types/gantt";

function clearTasksCollection() {
  for (const item of [...tasksCollection.toArray]) {
    if (tasksCollection.has(item.id)) {
      tasksCollection.delete(item.id);
    }
  }
}

const tasks: GanttTask[] = [
  {
    id: "task-later",
    name: "Write release notes",
    start: "2026-06-05",
    end: "2026-06-06",
    progress: 25,
    dependencies: "task-earlier",
    notes: "Summarize the changes",
  },
  {
    id: "task-earlier",
    name: "Build release",
    start: "2026-06-01",
    end: "2026-06-03",
    progress: 75,
  },
];

describe("GanttTableView", () => {
  beforeEach(() => {
    clearTasksCollection();
  });

  afterEach(() => {
    clearTasksCollection();
  });

  it("shows task details and sorts by start date by default", () => {
    render(<GanttTableView tasks={tasks} onTaskClick={vi.fn()} onDeleteTask={vi.fn()} />);

    const rows = within(screen.getByRole("table", { name: "Gantt tasks" })).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Build release");
    expect(rows[2]).toHaveTextContent("Write release notes");
    expect(rows[2]).toHaveTextContent("Build release");
    expect(rows[2]).toHaveTextContent("Summarize the changes");
    expect(rows[2]).toHaveTextContent("25%");
  });

  it("renders malformed dependency data safely", () => {
    const malformedTask = { ...tasks[0], dependencies: ["task-earlier"] } as unknown as GanttTask;

    render(<GanttTableView tasks={[malformedTask]} onTaskClick={vi.fn()} onDeleteTask={vi.fn()} />);

    expect(screen.getByRole("table", { name: "Gantt tasks" })).toHaveTextContent("—");
  });

  it("sorts by name and reverses the selected sort", async () => {
    const user = userEvent.setup();
    render(<GanttTableView tasks={tasks} onTaskClick={vi.fn()} onDeleteTask={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Sort by Name" }));
    let rows = within(screen.getByRole("table", { name: "Gantt tasks" })).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Build release");
    expect(rows[2]).toHaveTextContent("Write release notes");

    await user.click(screen.getByRole("button", { name: "Sort by Name" }));
    rows = within(screen.getByRole("table", { name: "Gantt tasks" })).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Write release notes");
    expect(rows[2]).toHaveTextContent("Build release");
  });

  it("opens a task for editing from the name button and edit action", async () => {
    const user = userEvent.setup();
    const onTaskClick = vi.fn();
    render(<GanttTableView tasks={tasks} onTaskClick={onTaskClick} onDeleteTask={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Edit Build release" }));
    expect(onTaskClick).toHaveBeenCalledWith("task-earlier");

    await user.click(screen.getByRole("button", { name: "Write release notes" }));
    expect(onTaskClick).toHaveBeenCalledWith("task-later");
  });

  it("confirms deletion from the row action", async () => {
    const user = userEvent.setup();
    const onDeleteTask = vi.fn();
    render(<GanttTableView tasks={tasks} onTaskClick={vi.fn()} onDeleteTask={onDeleteTask} />);

    await user.click(screen.getByRole("button", { name: "Delete Build release" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      'Are you sure you want to delete "Build release"?',
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDeleteTask).toHaveBeenCalledWith("task-earlier");
  });

  it("warns about linked time-tracking entries when deleting a task", async () => {
    tasksCollection.insert({
      id: "entry-1",
      text: "Built release",
      label: "Support",
      startTime: "2026-06-01T09:00",
      stopTime: "2026-06-01T10:00",
      ganttTaskId: "task-earlier",
    });
    tasksCollection.insert({
      id: "entry-2",
      text: "Tested release",
      label: "Support",
      startTime: "2026-06-02T09:00",
      stopTime: "2026-06-02T10:00",
      ganttTaskId: "task-earlier",
    });

    const user = userEvent.setup();
    render(<GanttTableView tasks={tasks} onTaskClick={vi.fn()} onDeleteTask={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Delete Build release" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "This will also unlink 2 time-tracking entries.",
    );
  });

  it("does not warn about unlinked entries when the task has no logged time", async () => {
    tasksCollection.insert({
      id: "entry-1",
      text: "Unrelated entry",
      label: "Support",
      startTime: "2026-06-01T09:00",
      stopTime: "2026-06-01T10:00",
      ganttTaskId: "some-other-task",
    });

    const user = userEvent.setup();
    render(<GanttTableView tasks={tasks} onTaskClick={vi.fn()} onDeleteTask={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Delete Build release" }));
    expect(screen.getByRole("dialog")).not.toHaveTextContent("time-tracking entr");
  });
});
