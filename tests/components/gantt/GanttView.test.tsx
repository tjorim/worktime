import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GanttView } from "../../../src/components/gantt/GanttView";

const mockAddTask = vi.fn();
const mockUpdateTask = vi.fn();
const mockRemoveTask = vi.fn();

vi.mock("../../../src/hooks/useGanttTasks", () => ({
  useGanttTasks: () => ({
    tasks: [
      {
        id: "task-1",
        name: "Plan release",
        start: "2026-03-01",
        end: "2026-03-05",
        progress: 40,
      },
    ],
    addTask: mockAddTask,
    updateTask: mockUpdateTask,
    removeTask: mockRemoveTask,
  }),
}));

vi.mock("../../../src/components/gantt/GanttChart", () => ({
  GanttChart: ({
    onTaskClick,
    onDateChange,
    onProgressChange,
  }: {
    onTaskClick: (taskId: string) => void;
    onDateChange: (taskId: string, start: string, end: string) => void;
    onProgressChange: (taskId: string, progress: number) => void;
  }) => (
    <div>
      <button onClick={() => onTaskClick("task-1")}>Open task</button>
      <button onClick={() => onDateChange("task-1", "2026-03-02", "2026-03-06")}>Move task</button>
      <button onClick={() => onProgressChange("task-1", 75)}>Set progress</button>
    </div>
  ),
}));

describe("GanttView", () => {
  beforeEach(() => {
    mockAddTask.mockReset();
    mockUpdateTask.mockReset();
    mockRemoveTask.mockReset();
  });

  it("updates task dates and progress from chart callbacks", async () => {
    const user = userEvent.setup();
    render(<GanttView />);

    await user.click(screen.getByRole("button", { name: "Move task" }));
    await user.click(screen.getByRole("button", { name: "Set progress" }));

    expect(mockUpdateTask).toHaveBeenCalledWith("task-1", {
      start: "2026-03-02",
      end: "2026-03-06",
    });
    expect(mockUpdateTask).toHaveBeenCalledWith("task-1", { progress: 75 });
  });

  it("deletes a task through the edit modal", async () => {
    const user = userEvent.setup();
    render(<GanttView />);

    await user.click(screen.getByRole("button", { name: "Open task" }));
    await user.click(screen.getByRole("button", { name: "Delete Task" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(mockRemoveTask).toHaveBeenCalledWith("task-1");
  });
});
