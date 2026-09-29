import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GanttTableView } from "@/features/gantt/GanttTableView";
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

  it("formats start and end dates through locale-aware formatting instead of raw strings", () => {
    render(<GanttTableView tasks={tasks} onTaskClick={vi.fn()} onDeleteTask={vi.fn()} />);

    const rows = within(screen.getByRole("table", { name: "Gantt tasks" })).getAllByRole("row");
    expect(rows[1]).not.toHaveTextContent("2026-06-01");
    expect(rows[1]).toHaveTextContent("Jun 1, 2026");
    expect(rows[2]).not.toHaveTextContent("2026-06-05");
    expect(rows[2]).toHaveTextContent("Jun 5, 2026");
  });

  it("shows a visible label for tasks with 0% progress", () => {
    const emptyProgressTask = {
      ...tasks[1]!,
      id: "task-empty",
      progress: 0,
    } satisfies GanttTask;
    render(
      <GanttTableView tasks={[emptyProgressTask]} onTaskClick={vi.fn()} onDeleteTask={vi.fn()} />,
    );

    expect(screen.getByRole("table", { name: "Gantt tasks" })).toHaveTextContent("0%");
  });

  it("renders malformed dependency data safely", () => {
    const malformedTask = { ...tasks[0], dependencies: ["task-earlier"] } as unknown as GanttTask;

    render(<GanttTableView tasks={[malformedTask]} onTaskClick={vi.fn()} onDeleteTask={vi.fn()} />);

    expect(screen.getByRole("table", { name: "Gantt tasks" })).toHaveTextContent("—");
  });

  it("sorts by name and reverses the selected sort", async () => {
    const user = userEvent.setup();
    render(<GanttTableView tasks={tasks} onTaskClick={vi.fn()} onDeleteTask={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /^Name/ }));
    let rows = within(screen.getByRole("table", { name: "Gantt tasks" })).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Build release");
    expect(rows[2]).toHaveTextContent("Write release notes");

    await user.click(screen.getByRole("button", { name: /^Name/ }));
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

  it("shows total logged time per task next to progress", () => {
    tasksCollection.insert({
      id: "entry-1",
      text: "Built release",
      label: "Support",
      startTime: "2026-06-01T09:00",
      stopTime: "2026-06-01T10:30",
      ganttTaskId: "task-earlier",
    });

    render(<GanttTableView tasks={tasks} onTaskClick={vi.fn()} onDeleteTask={vi.fn()} />);

    const rows = within(screen.getByRole("table", { name: "Gantt tasks" })).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("1 h 30 min");
    expect(rows[2]).toHaveTextContent("—");
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

  describe("search, sorting and pagination", () => {
    const bodyRows = () =>
      within(screen.getByRole("table", { name: "Gantt tasks" }))
        .getAllByRole("row")
        .slice(1);

    it("filters tasks by name, notes and resolved dependency names", async () => {
      const user = userEvent.setup();
      render(<GanttTableView tasks={tasks} onTaskClick={vi.fn()} onDeleteTask={vi.fn()} />);
      const search = screen.getByRole("searchbox", { name: "Search Gantt tasks" });

      await user.type(search, "summarize");
      expect(bodyRows()).toHaveLength(1);
      expect(bodyRows()[0]).toHaveTextContent("Write release notes");

      // "task-later" depends on "task-earlier", shown by name as "Build release".
      await user.clear(search);
      await user.type(search, "build");
      expect(bodyRows()).toHaveLength(2);
    });

    it("searches dates, progress and label too, not just text columns", async () => {
      const user = userEvent.setup();
      render(<GanttTableView tasks={tasks} onTaskClick={vi.fn()} onDeleteTask={vi.fn()} />);
      const search = screen.getByRole("searchbox");

      await user.type(search, "Jun 5");
      expect(bodyRows()).toHaveLength(1);
      expect(bodyRows()[0]).toHaveTextContent("Write release notes");

      await user.clear(search);
      await user.type(search, "2026-06-01");
      expect(bodyRows()).toHaveLength(1);
      expect(bodyRows()[0]).toHaveTextContent("Build release");

      await user.clear(search);
      await user.type(search, "75%");
      expect(bodyRows()).toHaveLength(1);
      expect(bodyRows()[0]).toHaveTextContent("Build release");
    });

    it("shows a no-results row when nothing matches", async () => {
      const user = userEvent.setup();
      render(<GanttTableView tasks={tasks} onTaskClick={vi.fn()} onDeleteTask={vi.fn()} />);

      await user.type(screen.getByRole("searchbox"), "zzz");
      expect(screen.getByText("No tasks match your search.")).toBeInTheDocument();
    });

    it("hides the search box when there are no tasks", () => {
      render(<GanttTableView tasks={[]} onTaskClick={vi.fn()} onDeleteTask={vi.fn()} />);
      expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
      expect(screen.getByText("No tasks yet. Add a task to start planning.")).toBeInTheDocument();
    });

    it("sorts by progress, with aria-sort reflecting the active column", async () => {
      const user = userEvent.setup();
      render(<GanttTableView tasks={tasks} onTaskClick={vi.fn()} onDeleteTask={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: /^Progress/ }));
      expect(screen.getByRole("columnheader", { name: /Progress/ })).toHaveAttribute(
        "aria-sort",
        expect.stringMatching(/ascending|descending/),
      );
      expect(screen.getByRole("columnheader", { name: /Start/ })).toHaveAttribute(
        "aria-sort",
        "none",
      );
    });

    it("paginates long task lists", async () => {
      const user = userEvent.setup();
      const many: GanttTask[] = Array.from({ length: 25 }, (_, index) => ({
        id: `t-${index}`,
        name: `Task ${String(index + 1).padStart(2, "0")}`,
        start: `2026-07-${String(index + 1).padStart(2, "0")}`,
        end: `2026-07-${String(index + 1).padStart(2, "0")}`,
        progress: 0,
      }));
      render(<GanttTableView tasks={many} onTaskClick={vi.fn()} onDeleteTask={vi.fn()} />);

      expect(bodyRows()).toHaveLength(20);
      expect(screen.getByText("Showing 1–20 of 25")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Next" }));
      expect(bodyRows()).toHaveLength(5);
      expect(bodyRows()[0]).toHaveTextContent("Task 21");
    });
  });

  describe("navigating between related tasks", () => {
    const bodyRows = () =>
      within(screen.getByRole("table", { name: "Gantt tasks" }))
        .getAllByRole("row")
        .slice(1);
    let scrollIntoView: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView =
        scrollIntoView as unknown as typeof Element.prototype.scrollIntoView;
    });

    it("shows dependencies and reverse 'required by' links as buttons", () => {
      render(<GanttTableView tasks={tasks} onTaskClick={vi.fn()} onDeleteTask={vi.fn()} />);

      // Build release (row 1) is required by Write release notes, and has no dependencies.
      const [build, write] = bodyRows();
      expect(
        within(build!).getByRole("button", { name: "Go to Write release notes" }),
      ).toBeInTheDocument();
      expect(
        within(write!).getByRole("button", { name: "Go to Build release" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: "Required by" })).toBeInTheDocument();
    });

    it("jumps to and highlights the linked task", async () => {
      const user = userEvent.setup();
      render(<GanttTableView tasks={tasks} onTaskClick={vi.fn()} onDeleteTask={vi.fn()} />);

      const [, write] = bodyRows();
      await user.click(within(write!).getByRole("button", { name: "Go to Build release" }));

      expect(scrollIntoView).toHaveBeenCalled();
      expect(bodyRows()[0]).toHaveClass("table-warning");
      expect(bodyRows()[1]).not.toHaveClass("table-warning");
    });

    it("clears a search that hides the target, so the jump lands", async () => {
      const user = userEvent.setup();
      render(<GanttTableView tasks={tasks} onTaskClick={vi.fn()} onDeleteTask={vi.fn()} />);

      // "summarize" only matches the notes of "Write release notes".
      await user.type(screen.getByRole("searchbox"), "summarize");
      expect(bodyRows()).toHaveLength(1);

      await user.click(screen.getByRole("button", { name: "Go to Build release" }));
      expect(screen.getByRole("searchbox")).toHaveValue("");
      expect(bodyRows()).toHaveLength(2);
      expect(scrollIntoView).toHaveBeenCalled();
    });

    it("moves to the page that holds the target", async () => {
      const user = userEvent.setup();
      const many: GanttTask[] = Array.from({ length: 25 }, (_, index) => ({
        id: `t-${index}`,
        name: `Task ${String(index + 1).padStart(2, "0")}`,
        start: `2026-07-${String(index + 1).padStart(2, "0")}`,
        end: `2026-07-${String(index + 1).padStart(2, "0")}`,
        progress: 0,
        // The last task depends on the first, which sits on the other page.
        ...(index === 24 ? { dependencies: "t-0" } : {}),
      }));
      render(<GanttTableView tasks={many} onTaskClick={vi.fn()} onDeleteTask={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: "Next" }));
      await user.click(screen.getByRole("button", { name: "Go to Task 01" }));

      expect(screen.getByText("Showing 1–20 of 25")).toBeInTheDocument();
      expect(document.getElementById("gantt-task-row-t-0")).toHaveClass("table-warning");
      expect(scrollIntoView).toHaveBeenCalled();
    });

    it("shows unknown dependencies as plain text, not a link", () => {
      const orphan: GanttTask = { ...tasks[1]!, id: "orphan", dependencies: "deleted-task" };
      render(<GanttTableView tasks={[orphan]} onTaskClick={vi.fn()} onDeleteTask={vi.fn()} />);

      expect(screen.getByText("deleted-task")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Go to/ })).not.toBeInTheDocument();
    });
  });

  it("uses classes, not inline styles, for the search box and progress cell", () => {
    render(<GanttTableView tasks={tasks} onTaskClick={vi.fn()} onDeleteTask={vi.fn()} />);
    const search = screen.getByRole("searchbox");
    expect(search).toHaveClass("table-search-input");
    expect(search).not.toHaveAttribute("style");
    const progressCells = document.querySelectorAll("td.gantt-progress-cell");
    expect(progressCells).toHaveLength(tasks.length);
    progressCells.forEach((cell) => expect(cell).not.toHaveAttribute("style"));
  });
});
