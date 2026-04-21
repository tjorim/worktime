import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { DailyTaskList } from "@/components/timeTracking/DailyTaskList";
import type { StoredTimeTrackingTask } from "@/components/timeTracking/types";
import type { TimeTrackingLabel } from "@/components/timeTracking/constants";
import { dayjs } from "@/utils/dateTimeUtils";

const TEST_LABELS: TimeTrackingLabel[] = [
  { id: "Support", name: "Support", color: "#c82333" },
  { id: "Development", name: "Development", color: "#198754" },
];

function makeTask(overrides: Partial<StoredTimeTrackingTask> = {}): StoredTimeTrackingTask {
  return {
    id: "task-1",
    text: "Morning work",
    label: "Support",
    startTime: "2026-02-07T08:00",
    stopTime: "2026-02-07T16:00",
    ...overrides,
  };
}

describe("DailyTaskList", () => {
  let onUpdateTask: ReturnType<typeof vi.fn<() => boolean>>;
  let onRemoveTask: ReturnType<typeof vi.fn<(id: string) => void>>;
  let onToggleBreak: ReturnType<typeof vi.fn<(taskId: string, includesBreak: boolean) => void>>;

  beforeEach(() => {
    onUpdateTask = vi.fn().mockReturnValue(true);
    onRemoveTask = vi.fn();
    onToggleBreak = vi.fn();
  });

  const renderList = (
    tasks: StoredTimeTrackingTask[],
    labels = TEST_LABELS,
    opts: { liveTime?: ReturnType<typeof dayjs>; isToday?: boolean } = {},
  ) =>
    render(
      <DailyTaskList
        tasks={tasks}
        labels={labels}
        onUpdateTask={onUpdateTask}
        onRemoveTask={onRemoveTask}
        onToggleBreak={onToggleBreak}
        liveTime={opts.liveTime}
        isToday={opts.isToday}
      />,
    );

  describe("break deduction badge", () => {
    it("renders -30min badge when task has includesBreak", () => {
      renderList([makeTask({ includesBreak: true })]);

      expect(screen.getByText("-30min")).toBeInTheDocument();
      expect(screen.getByLabelText("30 minute break deducted")).toBeInTheDocument();
    });

    it("does not render -30min badge when task has no break", () => {
      renderList([makeTask()]);

      expect(screen.queryByText("-30min")).not.toBeInTheDocument();
    });
  });

  describe("context menu break item", () => {
    it("shows 'Includes 30min break' for eligible task", () => {
      renderList([makeTask()]);

      // Use a safer query for the task item
      const taskItem = screen.getByText("Morning work");
      expect(taskItem).toBeInTheDocument();
      fireEvent.contextMenu(taskItem);

      expect(screen.getByText("Includes 30min break")).toBeInTheDocument();
    });

    it("shows 'Remove break deduction' when task already has break", () => {
      renderList([makeTask({ includesBreak: true })]);

      // Use a safer query for the task item
      const taskItem = screen.getByText("Morning work");
      expect(taskItem).toBeInTheDocument();
      fireEvent.contextMenu(taskItem);

      expect(screen.getByText("Remove break deduction")).toBeInTheDocument();
    });

    it("shows disabled item for tasks shorter than 30 minutes", () => {
      const shortTask = makeTask({
        startTime: "2026-02-07T08:00",
        stopTime: "2026-02-07T08:20",
      });
      const { container } = renderList([shortTask]);

      const taskItem = container.querySelector(".list-group-item")!;
      fireEvent.contextMenu(taskItem);

      const menuItem = screen.getByText("Too short for 30min break");
      const buttonAncestor = menuItem.closest("button");
      expect(buttonAncestor).not.toBeNull(); // Fail clearly if missing
      expect(buttonAncestor).toBeDisabled();
    });

    it("allows break toggle on running tasks (no stopTime)", () => {
      const runningTask = makeTask({ stopTime: undefined });
      const { container } = renderList([runningTask]);

      const taskItem = container.querySelector(".list-group-item")!;
      fireEvent.contextMenu(taskItem);

      expect(screen.getByText("Includes 30min break")).toBeInTheDocument();
      // Should not be disabled
      expect(screen.getByText("Includes 30min break").closest("button")).not.toBeDisabled();
    });

    it("toggles break on via context menu", async () => {
      const user = userEvent.setup();
      const { container } = renderList([makeTask()]);

      const taskItem = container.querySelector(".list-group-item")!;
      fireEvent.contextMenu(taskItem);
      await user.click(screen.getByText("Includes 30min break"));

      expect(onToggleBreak).toHaveBeenCalledWith("task-1", true);
    });

    it("toggles break off via context menu", async () => {
      const user = userEvent.setup();
      const { container } = renderList([makeTask({ includesBreak: true })]);

      const taskItem = container.querySelector(".list-group-item")!;
      fireEvent.contextMenu(taskItem);
      await user.click(screen.getByText("Remove break deduction"));

      expect(onToggleBreak).toHaveBeenCalledWith("task-1", false);
    });
  });

  describe("move break confirmation dialog", () => {
    it("shows confirmation when assigning break to a task when another already has it", async () => {
      const user = userEvent.setup();
      const taskA = makeTask({ id: "task-a", text: "Task A", includesBreak: true });
      const taskB = makeTask({
        id: "task-b",
        text: "Task B",
        startTime: "2026-02-07T13:00",
        stopTime: "2026-02-07T17:00",
      });
      const { container } = renderList([taskA, taskB]);

      // Right-click on task B
      const taskItems = container.querySelectorAll(".list-group-item");
      fireEvent.contextMenu(taskItems[1]!);
      await user.click(screen.getByText("Includes 30min break"));

      // Confirmation dialog should appear
      expect(screen.getByText(/The break deduction is currently on "Task A"/)).toBeInTheDocument();
      expect(screen.getByText("Move Break")).toBeInTheDocument();
    });

    it("moves break when confirmed", async () => {
      const user = userEvent.setup();
      const taskA = makeTask({ id: "task-a", text: "Task A", includesBreak: true });
      const taskB = makeTask({
        id: "task-b",
        text: "Task B",
        startTime: "2026-02-07T13:00",
        stopTime: "2026-02-07T17:00",
      });
      const { container } = renderList([taskA, taskB]);

      const taskItems = container.querySelectorAll(".list-group-item");
      fireEvent.contextMenu(taskItems[1]!);
      await user.click(screen.getByText("Includes 30min break"));
      await user.click(screen.getByText("Move Break"));

      // Should remove break from task A and add to task B, in order
      expect(onToggleBreak).toHaveBeenNthCalledWith(1, "task-a", false);
      expect(onToggleBreak).toHaveBeenNthCalledWith(2, "task-b", true);
    });

    it("cancels move when dialog is dismissed", async () => {
      const user = userEvent.setup();
      const taskA = makeTask({ id: "task-a", text: "Task A", includesBreak: true });
      const taskB = makeTask({
        id: "task-b",
        text: "Task B",
        startTime: "2026-02-07T13:00",
        stopTime: "2026-02-07T17:00",
      });
      const { container } = renderList([taskA, taskB]);

      const taskItems = container.querySelectorAll(".list-group-item");
      fireEvent.contextMenu(taskItems[1]!);
      await user.click(screen.getByText("Includes 30min break"));
      await user.click(screen.getByText("Cancel"));

      expect(onToggleBreak).not.toHaveBeenCalled();
    });
  });

  describe("Gap indicator", () => {
    const DATE = "2026-02-07";
    const task1 = makeTask({ id: "t1", startTime: `${DATE}T09:00`, stopTime: `${DATE}T11:00` });
    const task2 = makeTask({
      id: "t2",
      text: "Afternoon work",
      startTime: `${DATE}T13:00`,
      stopTime: `${DATE}T17:00`,
    });

    it("shows gap indicator between tasks with a gap >= 5 minutes", () => {
      renderList([task1, task2]);
      expect(screen.getByTestId("gap-indicator")).toBeInTheDocument();
      expect(screen.getByText("120min gap")).toBeInTheDocument();
    });

    it("does not show gap indicator when tasks are adjacent (no gap)", () => {
      const adjacent = makeTask({
        id: "t2",
        text: "Afternoon work",
        startTime: `${DATE}T11:00`,
        stopTime: `${DATE}T17:00`,
      });
      renderList([task1, adjacent]);
      expect(screen.queryByTestId("gap-indicator")).not.toBeInTheDocument();
    });

    it("shows gap indicator when gap is exactly 5 minutes", () => {
      const exactlyFive = makeTask({
        id: "t2",
        text: "Afternoon work",
        startTime: `${DATE}T11:05`,
        stopTime: `${DATE}T17:00`,
      });
      renderList([task1, exactlyFive]);
      expect(screen.getByTestId("gap-indicator")).toBeInTheDocument();
      expect(screen.getByText("5min gap")).toBeInTheDocument();
    });

    it("does not show gap indicator when gap is below 5 minutes", () => {
      const nearlyAdjacent = makeTask({
        id: "t2",
        text: "Afternoon work",
        startTime: `${DATE}T11:03`,
        stopTime: `${DATE}T17:00`,
      });
      renderList([task1, nearlyAdjacent]);
      expect(screen.queryByTestId("gap-indicator")).not.toBeInTheDocument();
    });

    it("shows gap-to-now indicator after last stopped task on today's view", () => {
      const liveTime = dayjs(`${DATE}T18:00`);
      renderList([task1, task2], TEST_LABELS, { liveTime, isToday: true });
      // Two gap indicators: one between tasks (120min) and one to now (60min)
      const indicators = screen.getAllByTestId("gap-indicator");
      expect(indicators).toHaveLength(2);
      expect(screen.getByText("60min gap")).toBeInTheDocument();
    });

    it("does not show gap-to-now when isToday is false", () => {
      const liveTime = dayjs(`${DATE}T18:00`);
      renderList([task1, task2], TEST_LABELS, { liveTime, isToday: false });
      // Only inter-task gap, no gap-to-now
      const indicators = screen.getAllByTestId("gap-indicator");
      expect(indicators).toHaveLength(1);
    });

    it("does not show gap-to-now when last task is still running", () => {
      const runningTask = makeTask({
        id: "t2",
        text: "Running work",
        startTime: `${DATE}T13:00`,
        stopTime: undefined,
      });
      const liveTime = dayjs(`${DATE}T18:00`);
      renderList([task1, runningTask], TEST_LABELS, { liveTime, isToday: true });
      // Only inter-task gap, no gap-to-now (running task has no stopTime)
      const indicators = screen.getAllByTestId("gap-indicator");
      expect(indicators).toHaveLength(1);
    });
  });

  describe("Now indicator", () => {
    const DATE = "2026-02-07";
    const task1 = makeTask({ id: "t1", startTime: `${DATE}T09:00`, stopTime: `${DATE}T11:00` });
    const task2 = makeTask({
      id: "t2",
      text: "Afternoon work",
      startTime: `${DATE}T13:00`,
      stopTime: `${DATE}T17:00`,
    });

    it("does not render when isToday is false", () => {
      const liveTime = dayjs(`${DATE}T10:00`);
      renderList([task1], TEST_LABELS, { liveTime, isToday: false });
      expect(screen.queryByTestId("now-indicator")).not.toBeInTheDocument();
    });

    it("does not render when liveTime is not provided", () => {
      renderList([task1], TEST_LABELS, { isToday: true });
      expect(screen.queryByTestId("now-indicator")).not.toBeInTheDocument();
    });

    it("shows separator before the first task when now is earlier", () => {
      const liveTime = dayjs(`${DATE}T07:30`);
      const { container } = renderList([task1, task2], TEST_LABELS, { liveTime, isToday: true });
      const indicator = container.querySelector("[data-testid='now-indicator']");
      expect(indicator).not.toBeNull();
      // Indicator should be before any list-group-item
      const listGroup = container.querySelector(".list-group")!;
      expect(listGroup.firstChild).toBe(indicator);
    });

    it("shows separator between tasks when now is in the gap", () => {
      const liveTime = dayjs(`${DATE}T12:00`);
      const { container } = renderList([task1, task2], TEST_LABELS, { liveTime, isToday: true });
      const indicator = container.querySelector("[data-testid='now-indicator']");
      expect(indicator).not.toBeNull();
      // The indicator should not be the first child (task1 comes first)
      const listGroup = container.querySelector(".list-group")!;
      expect(listGroup.firstChild).not.toBe(indicator);
    });

    it("shows separator after all tasks when now is later", () => {
      const liveTime = dayjs(`${DATE}T18:00`);
      const { container } = renderList([task1, task2], TEST_LABELS, { liveTime, isToday: true });
      const indicator = container.querySelector("[data-testid='now-indicator']");
      expect(indicator).not.toBeNull();
      // Indicator should be the last child of the list group
      const listGroup = container.querySelector(".list-group")!;
      expect(listGroup.lastChild).toBe(indicator);
    });

    it("shows Now badge on task that contains current time", () => {
      const liveTime = dayjs(`${DATE}T10:00`);
      renderList([task1, task2], TEST_LABELS, { liveTime, isToday: true });
      expect(screen.getByLabelText("Currently active task")).toBeInTheDocument();
      expect(screen.queryByTestId("now-indicator")).not.toBeInTheDocument();
    });

    it("displays the current time in HH:mm format in the separator", () => {
      const liveTime = dayjs(`${DATE}T12:00`);
      renderList([task1, task2], TEST_LABELS, { liveTime, isToday: true });
      expect(screen.getByText("12:00")).toBeInTheDocument();
    });
  });
});
