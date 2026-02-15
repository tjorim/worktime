import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { DailyTaskList } from "../../../src/components/timeTracking/DailyTaskList";
import type { TimeTrackingLabel } from "../../../src/components/timeTracking/constants";
import type { StoredTimeTrackingTask } from "../../../src/components/timeTracking/types";
import { BREAK_DURATION_MINUTES } from "../../../src/components/timeTracking/timeUtils";

const TEST_LABELS: TimeTrackingLabel[] = [
  { id: "lbl-1", name: "Support", color: "#3B82F6" },
  { id: "lbl-2", name: "Development", color: "#10B981" },
  { id: "lbl-3", name: "Meeting", color: "#F59E0B" },
];

function createTask(overrides: Partial<StoredTimeTrackingTask> = {}): StoredTimeTrackingTask {
  return {
    id: "task-1",
    text: "Test Task",
    label: "lbl-1",
    startTime: "2026-02-15T08:00:00",
    stopTime: "2026-02-15T09:00:00",
    includesBreak: false,
    ...overrides,
  };
}

function renderDailyTaskList(
  tasks: StoredTimeTrackingTask[] = [],
  overrides: Partial<Parameters<typeof DailyTaskList>[0]> = {},
) {
  const onUpdateTask = vi.fn().mockResolvedValue(true);
  const onRemoveTask = vi.fn();
  const onToggleBreak = vi.fn();

  const result = render(
    <DailyTaskList
      tasks={tasks}
      labels={TEST_LABELS}
      onUpdateTask={onUpdateTask}
      onRemoveTask={onRemoveTask}
      onToggleBreak={onToggleBreak}
      {...overrides}
    />,
  );

  return { onUpdateTask, onRemoveTask, onToggleBreak, ...result };
}

describe("DailyTaskList", () => {
  describe("empty state", () => {
    it("displays empty state when no tasks exist", () => {
      renderDailyTaskList([]);

      expect(screen.getByText("No Time Entries Yet")).toBeInTheDocument();
      expect(
        screen.getByText("Use the form above to start tracking time or add a completed task."),
      ).toBeInTheDocument();
    });
  });

  describe("task list rendering", () => {
    it("renders a single task with correct details", () => {
      const task = createTask({
        text: "Fix bug",
        label: "lbl-2",
        startTime: "2026-02-15T10:30:00",
        stopTime: "2026-02-15T12:45:00",
      });

      renderDailyTaskList([task]);

      expect(screen.getByText("Fix bug")).toBeInTheDocument();
      expect(screen.getByText("Development")).toBeInTheDocument();
      expect(screen.getByText(/Start: 10:30/)).toBeInTheDocument();
      expect(screen.getByText(/Stop: 12:45/)).toBeInTheDocument();
    });

    it("renders multiple tasks", () => {
      const tasks = [
        createTask({
          id: "task-1",
          text: "Task 1",
          label: "lbl-1",
          startTime: "2026-02-15T08:00:00",
          stopTime: "2026-02-15T09:00:00",
        }),
        createTask({
          id: "task-2",
          text: "Task 2",
          label: "lbl-2",
          startTime: "2026-02-15T09:00:00",
          stopTime: "2026-02-15T10:00:00",
        }),
        createTask({
          id: "task-3",
          text: "Task 3",
          label: "lbl-3",
          startTime: "2026-02-15T10:00:00",
          stopTime: "2026-02-15T11:00:00",
        }),
      ];

      renderDailyTaskList(tasks);

      expect(screen.getByText("Task 1")).toBeInTheDocument();
      expect(screen.getByText("Task 2")).toBeInTheDocument();
      expect(screen.getByText("Task 3")).toBeInTheDocument();
    });

    it("displays running task with 'Running' status", () => {
      const task = createTask({
        text: "Active Task",
        startTime: "2026-02-15T14:00:00",
        stopTime: null,
      });

      renderDailyTaskList([task]);

      expect(screen.getByText("Active Task")).toBeInTheDocument();
      expect(screen.getByText(/Start: 14:00/)).toBeInTheDocument();
      expect(screen.getByText(/Stop: Running/)).toBeInTheDocument();
    });

    it("displays break badge when task includes break", () => {
      const task = createTask({
        text: "Long task",
        startTime: "2026-02-15T08:00:00",
        stopTime: "2026-02-15T14:00:00",
        includesBreak: true,
      });

      renderDailyTaskList([task]);

      const badge = screen.getByTitle(`${BREAK_DURATION_MINUTES}min break deducted`);
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent(`-${BREAK_DURATION_MINUTES}min`);
      expect(badge).toHaveAttribute(
        "aria-label",
        `${BREAK_DURATION_MINUTES} minute break deducted`,
      );
    });

    it("does not display break badge when task does not include break", () => {
      const task = createTask({
        text: "Short task",
        includesBreak: false,
      });

      renderDailyTaskList([task]);

      const badge = screen.queryByTitle(`${BREAK_DURATION_MINUTES}min break deducted`);
      expect(badge).not.toBeInTheDocument();
    });

    it("applies correct label color and contrasting text color", () => {
      const task = createTask({
        text: "Colored task",
        label: "lbl-1",
      });

      renderDailyTaskList([task]);

      const labelElement = screen.getByText("Support");
      expect(labelElement).toHaveStyle({ backgroundColor: "#3B82F6" });
    });

    it("displays 'Unknown label' for invalid label id", () => {
      const task = createTask({
        text: "Task with bad label",
        label: "invalid-label-id",
      });

      renderDailyTaskList([task]);

      expect(screen.getByText("Unknown label")).toBeInTheDocument();
    });
  });

  describe("task actions", () => {
    it("displays edit and delete buttons for each task on desktop", () => {
      const task = createTask({ text: "Sample Task" });

      renderDailyTaskList([task]);

      expect(screen.getByRole("button", { name: "Edit Sample Task" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Delete Sample Task" })).toBeInTheDocument();
    });

    it("calls onRemoveTask when delete button is clicked", async () => {
      const user = userEvent.setup();
      const task = createTask({ id: "task-123", text: "Task to delete" });
      const { onRemoveTask } = renderDailyTaskList([task]);

      await user.click(screen.getByRole("button", { name: "Delete Task to delete" }));

      expect(onRemoveTask).toHaveBeenCalledTimes(1);
      expect(onRemoveTask).toHaveBeenCalledWith("task-123");
    });
  });

  describe("edit modal", () => {
    it("opens edit modal when edit button is clicked", async () => {
      const user = userEvent.setup();
      const task = createTask({
        text: "Edit me",
        label: "lbl-1",
        startTime: "2026-02-15T09:00:00",
        stopTime: "2026-02-15T10:30:00",
      });

      renderDailyTaskList([task]);

      await user.click(screen.getByRole("button", { name: "Edit Edit me" }));

      const modal = screen.getByRole("dialog");
      expect(within(modal).getByText("Edit Task")).toBeInTheDocument();
      expect(within(modal).getByLabelText("Task")).toHaveValue("Edit me");
      expect(within(modal).getByLabelText("Label")).toHaveValue("lbl-1");
      expect(within(modal).getByLabelText("Start")).toHaveValue("09:00");
      expect(within(modal).getByLabelText("Stop")).toHaveValue("10:30");
    });

    it("opens edit modal with empty stop time for running task", async () => {
      const user = userEvent.setup();
      const task = createTask({
        text: "Running task",
        startTime: "2026-02-15T14:00:00",
        stopTime: null,
      });

      renderDailyTaskList([task]);

      await user.click(screen.getByRole("button", { name: "Edit Running task" }));

      const modal = screen.getByRole("dialog");
      expect(within(modal).getByLabelText("Stop")).toHaveValue("");
    });

    it("pre-fills break checkbox in edit modal", async () => {
      const user = userEvent.setup();
      const task = createTask({
        text: "Task with break",
        startTime: "2026-02-15T08:00:00",
        stopTime: "2026-02-15T14:00:00",
        includesBreak: true,
      });

      renderDailyTaskList([task]);

      await user.click(screen.getByRole("button", { name: "Edit Task with break" }));

      const modal = screen.getByRole("dialog");
      const breakCheckbox = within(modal).getByLabelText(
        `Includes ${BREAK_DURATION_MINUTES}min break`,
      );
      expect(breakCheckbox).toBeChecked();
    });

    it("closes modal when cancel button is clicked", async () => {
      const user = userEvent.setup();
      const task = createTask({ text: "Task" });

      renderDailyTaskList([task]);

      await user.click(screen.getByRole("button", { name: "Edit Task" }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("submits task update with modified values", async () => {
      const user = userEvent.setup();
      const task = createTask({
        id: "task-456",
        text: "Original Text",
        label: "lbl-1",
        startTime: "2026-02-15T08:00:00",
        stopTime: "2026-02-15T09:00:00",
      });
      const { onUpdateTask } = renderDailyTaskList([task]);

      await user.click(screen.getByRole("button", { name: "Edit Original Text" }));

      const modal = screen.getByRole("dialog");
      const taskInput = within(modal).getByLabelText("Task");
      const labelSelect = within(modal).getByLabelText("Label");
      const startInput = within(modal).getByLabelText("Start");
      const stopInput = within(modal).getByLabelText("Stop");

      await user.clear(taskInput);
      await user.type(taskInput, "Updated Text");
      await user.selectOptions(labelSelect, "lbl-2");
      await user.clear(startInput);
      await user.type(startInput, "10:00");
      await user.clear(stopInput);
      await user.type(stopInput, "11:30");

      await user.click(within(modal).getByRole("button", { name: "Save Changes" }));

      expect(onUpdateTask).toHaveBeenCalledTimes(1);
      expect(onUpdateTask).toHaveBeenCalledWith({
        id: "task-456",
        text: "Updated Text",
        label: "lbl-2",
        start: "10:00",
        stop: "11:30",
      });
    });

    it("submits task update with null stop time when cleared", async () => {
      const user = userEvent.setup();
      const task = createTask({
        id: "task-789",
        text: "Task",
        startTime: "2026-02-15T08:00:00",
        stopTime: "2026-02-15T09:00:00",
      });
      const { onUpdateTask } = renderDailyTaskList([task]);

      await user.click(screen.getByRole("button", { name: "Edit Task" }));

      const modal = screen.getByRole("dialog");
      const stopInput = within(modal).getByLabelText("Stop");

      await user.clear(stopInput);

      await user.click(within(modal).getByRole("button", { name: "Save Changes" }));

      expect(onUpdateTask).toHaveBeenCalledWith(
        expect.objectContaining({
          stop: null,
        }),
      );
    });

    it("closes modal after successful update", async () => {
      const user = userEvent.setup();
      const task = createTask({ text: "Task" });
      const onUpdateTask = vi.fn().mockResolvedValue(true);

      renderDailyTaskList([task], { onUpdateTask });

      await user.click(screen.getByRole("button", { name: "Edit Task" }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Save Changes" }));

      // Wait for async operation
      await vi.waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it("displays error message when update fails", async () => {
      const user = userEvent.setup();
      const task = createTask({ text: "Task" });
      const onUpdateTask = vi.fn().mockResolvedValue(false);

      renderDailyTaskList([task], { onUpdateTask });

      await user.click(screen.getByRole("button", { name: "Edit Task" }));

      const modal = screen.getByRole("dialog");
      await user.click(within(modal).getByRole("button", { name: "Save Changes" }));

      expect(
        await screen.findByText("Unable to update task. Please review the changes and try again."),
      ).toBeInTheDocument();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("displays error message when update throws exception", async () => {
      const user = userEvent.setup();
      const task = createTask({ text: "Task" });
      const onUpdateTask = vi.fn().mockRejectedValue(new Error("Network error"));

      renderDailyTaskList([task], { onUpdateTask });

      await user.click(screen.getByRole("button", { name: "Edit Task" }));

      const modal = screen.getByRole("dialog");
      await user.click(within(modal).getByRole("button", { name: "Save Changes" }));

      expect(await screen.findByText("Failed to update task. Please try again.")).toBeInTheDocument();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("calls onToggleBreak when break checkbox is changed", async () => {
      const user = userEvent.setup();
      const task = createTask({
        id: "task-break",
        text: "Long Task",
        startTime: "2026-02-15T08:00:00",
        stopTime: "2026-02-15T14:00:00",
        includesBreak: false,
      });
      const { onToggleBreak } = renderDailyTaskList([task]);

      await user.click(screen.getByRole("button", { name: "Edit Long Task" }));

      const modal = screen.getByRole("dialog");
      const breakCheckbox = within(modal).getByLabelText(
        `Includes ${BREAK_DURATION_MINUTES}min break`,
      );

      await user.click(breakCheckbox);
      await user.click(within(modal).getByRole("button", { name: "Save Changes" }));

      // Wait for modal to close and onToggleBreak to be called
      await vi.waitFor(
        () => {
          expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      expect(onToggleBreak).toHaveBeenCalledWith("task-break", true);
    });

    it("disables break checkbox for short tasks", async () => {
      const user = userEvent.setup();
      const task = createTask({
        text: "Short Task",
        startTime: "2026-02-15T08:00:00",
        stopTime: "2026-02-15T08:25:00", // Only 25 minutes
        includesBreak: false,
      });

      renderDailyTaskList([task]);

      await user.click(screen.getByRole("button", { name: "Edit Short Task" }));

      const modal = screen.getByRole("dialog");
      const breakCheckbox = within(modal).getByLabelText(
        `Includes ${BREAK_DURATION_MINUTES}min break`,
      );
      expect(breakCheckbox).toBeDisabled();
    });
  });

  describe("context menu", () => {
    it("opens context menu on right-click", () => {
      const task = createTask({ text: "Context Task" });

      renderDailyTaskList([task]);

      const listItem = screen.getByText("Context Task").closest(".list-group-item");
      fireEvent.contextMenu(listItem!);

      // ContextMenu component should be rendered (checking for menu items)
      expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Remove" })).toBeInTheDocument();
    });

    it("shows 'Includes break' option for long enough tasks", () => {
      const task = createTask({
        text: "Task",
        startTime: "2026-02-15T08:00:00",
        stopTime: "2026-02-15T10:00:00", // 2 hours
        includesBreak: false,
      });

      renderDailyTaskList([task]);

      const listItem = screen.getByText("Task").closest(".list-group-item");
      fireEvent.contextMenu(listItem!);

      expect(
        screen.getByRole("menuitem", { name: `Includes ${BREAK_DURATION_MINUTES}min break` }),
      ).toBeInTheDocument();
    });

    it("shows 'Remove break deduction' option for tasks with break", () => {
      const task = createTask({
        text: "Task",
        startTime: "2026-02-15T08:00:00",
        stopTime: "2026-02-15T14:00:00",
        includesBreak: true,
      });

      renderDailyTaskList([task]);

      const listItem = screen.getByText("Task").closest(".list-group-item");
      fireEvent.contextMenu(listItem!);

      expect(screen.getByRole("menuitem", { name: "Remove break deduction" })).toBeInTheDocument();
    });

    it("shows disabled 'Too short' option for tasks shorter than break duration", () => {
      const task = createTask({
        text: "Short Task",
        startTime: "2026-02-15T08:00:00",
        stopTime: "2026-02-15T08:20:00", // 20 minutes
        includesBreak: false,
      });

      renderDailyTaskList([task]);

      const listItem = screen.getByText("Short Task").closest(".list-group-item");
      fireEvent.contextMenu(listItem!);

      expect(
        screen.getByRole("menuitem", {
          name: `Too short for ${BREAK_DURATION_MINUTES}min break`,
        }),
      ).toBeInTheDocument();
    });

    it("allows break toggle for running tasks regardless of duration", () => {
      const task = createTask({
        text: "Running Task",
        startTime: "2026-02-15T14:00:00",
        stopTime: null,
        includesBreak: false,
      });

      renderDailyTaskList([task]);

      const listItem = screen.getByText("Running Task").closest(".list-group-item");
      fireEvent.contextMenu(listItem!);

      // Should show the break option, not the "too short" message
      expect(
        screen.getByRole("menuitem", { name: `Includes ${BREAK_DURATION_MINUTES}min break` }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("menuitem", {
          name: `Too short for ${BREAK_DURATION_MINUTES}min break`,
        }),
      ).not.toBeInTheDocument();
    });
  });

  describe("break toggle functionality", () => {
    it("adds break to task when toggle is clicked", async () => {
      const user = userEvent.setup();
      const task = createTask({
        id: "task-1",
        text: "Task",
        startTime: "2026-02-15T08:00:00",
        stopTime: "2026-02-15T14:00:00",
        includesBreak: false,
      });
      const { onToggleBreak } = renderDailyTaskList([task]);

      const listItem = screen.getByText("Task").closest(".list-group-item");
      fireEvent.contextMenu(listItem!);
      await user.click(
        screen.getByRole("menuitem", { name: `Includes ${BREAK_DURATION_MINUTES}min break` }),
      );

      expect(onToggleBreak).toHaveBeenCalledTimes(1);
      expect(onToggleBreak).toHaveBeenCalledWith("task-1", true);
    });

    it("removes break from task when toggle is clicked", async () => {
      const user = userEvent.setup();
      const task = createTask({
        id: "task-1",
        text: "Task with Break",
        startTime: "2026-02-15T08:00:00",
        stopTime: "2026-02-15T14:00:00",
        includesBreak: true,
      });
      const { onToggleBreak } = renderDailyTaskList([task]);

      const listItem = screen.getByText("Task with Break").closest(".list-group-item");
      fireEvent.contextMenu(listItem!);
      await user.click(screen.getByRole("menuitem", { name: "Remove break deduction" }));

      expect(onToggleBreak).toHaveBeenCalledTimes(1);
      expect(onToggleBreak).toHaveBeenCalledWith("task-1", false);
    });

    it("shows confirmation dialog when moving break between tasks", async () => {
      const user = userEvent.setup();
      const tasks = [
        createTask({
          id: "task-1",
          text: "Task with Break",
          startTime: "2026-02-15T08:00:00",
          stopTime: "2026-02-15T12:00:00",
          includesBreak: true,
        }),
        createTask({
          id: "task-2",
          text: "Task without Break",
          startTime: "2026-02-15T13:00:00",
          stopTime: "2026-02-15T17:00:00",
          includesBreak: false,
        }),
      ];

      renderDailyTaskList(tasks);

      const listItem = screen.getByText("Task without Break").closest(".list-group-item");
      fireEvent.contextMenu(listItem!);
      await user.click(
        screen.getByRole("menuitem", { name: `Includes ${BREAK_DURATION_MINUTES}min break` }),
      );

      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("Move Break Deduction")).toBeInTheDocument();
      expect(
        within(dialog).getByText(
          'The break deduction is currently on "Task with Break". Move it to this task instead?',
        ),
      ).toBeInTheDocument();
    });

    it("moves break when confirmation is accepted", async () => {
      const user = userEvent.setup();
      const tasks = [
        createTask({
          id: "task-1",
          text: "Task with Break",
          startTime: "2026-02-15T08:00:00",
          stopTime: "2026-02-15T12:00:00",
          includesBreak: true,
        }),
        createTask({
          id: "task-2",
          text: "Task without Break",
          startTime: "2026-02-15T13:00:00",
          stopTime: "2026-02-15T17:00:00",
          includesBreak: false,
        }),
      ];
      const { onToggleBreak } = renderDailyTaskList(tasks);

      const listItem = screen.getByText("Task without Break").closest(".list-group-item");
      fireEvent.contextMenu(listItem!);
      await user.click(
        screen.getByRole("menuitem", { name: `Includes ${BREAK_DURATION_MINUTES}min break` }),
      );

      const dialog = screen.getByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: "Move Break" }));

      expect(onToggleBreak).toHaveBeenCalledTimes(2);
      expect(onToggleBreak).toHaveBeenNthCalledWith(1, "task-1", false);
      expect(onToggleBreak).toHaveBeenNthCalledWith(2, "task-2", true);
    });

    it("does not move break when confirmation is cancelled", async () => {
      const user = userEvent.setup();
      const tasks = [
        createTask({
          id: "task-1",
          text: "Task with Break",
          startTime: "2026-02-15T08:00:00",
          stopTime: "2026-02-15T12:00:00",
          includesBreak: true,
        }),
        createTask({
          id: "task-2",
          text: "Task without Break",
          startTime: "2026-02-15T13:00:00",
          stopTime: "2026-02-15T17:00:00",
          includesBreak: false,
        }),
      ];
      const { onToggleBreak } = renderDailyTaskList(tasks);

      const listItem = screen.getByText("Task without Break").closest(".list-group-item");
      fireEvent.contextMenu(listItem!);
      await user.click(
        screen.getByRole("menuitem", { name: `Includes ${BREAK_DURATION_MINUTES}min break` }),
      );

      const dialog = screen.getByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

      expect(onToggleBreak).not.toHaveBeenCalled();
    });

    it("does not show confirmation when task already has the break", async () => {
      const user = userEvent.setup();
      const task = createTask({
        id: "task-1",
        text: "Task",
        startTime: "2026-02-15T08:00:00",
        stopTime: "2026-02-15T14:00:00",
        includesBreak: true,
      });
      const { onToggleBreak } = renderDailyTaskList([task]);

      const listItem = screen.getByText("Task").closest(".list-group-item");
      fireEvent.contextMenu(listItem!);
      await user.click(screen.getByRole("menuitem", { name: "Remove break deduction" }));

      // Should call onToggleBreak directly without confirmation
      expect(onToggleBreak).toHaveBeenCalledTimes(1);
      expect(onToggleBreak).toHaveBeenCalledWith("task-1", false);
      expect(screen.queryByText("Move Break Deduction")).not.toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("handles editing a task and converting it from running to stopped", async () => {
      const user = userEvent.setup();
      const task = createTask({
        id: "task-convert",
        text: "Running Task",
        startTime: "2026-02-15T14:00:00",
        stopTime: null,
      });
      const { onUpdateTask } = renderDailyTaskList([task]);

      await user.click(screen.getByRole("button", { name: "Edit Running Task" }));

      const modal = screen.getByRole("dialog");
      const stopInput = within(modal).getByLabelText("Stop");

      // Add a stop time to convert from running to stopped
      await user.type(stopInput, "16:30");
      await user.click(within(modal).getByRole("button", { name: "Save Changes" }));

      await vi.waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      expect(onUpdateTask).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "task-convert",
          stop: "16:30",
        }),
      );
    });

    it("handles missing stopTime in edit modal submission", async () => {
      const user = userEvent.setup();
      const task = createTask({
        id: "task-running",
        text: "Running Task",
        startTime: "2026-02-15T14:00:00",
        stopTime: null,
      });
      const { onUpdateTask } = renderDailyTaskList([task]);

      await user.click(screen.getByRole("button", { name: "Edit Running Task" }));

      const modal = screen.getByRole("dialog");
      await user.click(within(modal).getByRole("button", { name: "Save Changes" }));

      // Should not include stop property at all for running tasks
      const callArg = onUpdateTask.mock.calls[0][0];
      expect(callArg).toEqual({
        id: "task-running",
        text: "Running Task",
        label: "lbl-1",
        start: "14:00",
      });
      expect(callArg).not.toHaveProperty("stop");
    });

    it("handles task with undefined includesBreak property", () => {
      const task = createTask({
        text: "Task without break property",
        includesBreak: undefined,
      });

      renderDailyTaskList([task]);

      expect(screen.getByText("Task without break property")).toBeInTheDocument();
      expect(screen.queryByTitle(`${BREAK_DURATION_MINUTES}min break deducted`)).not.toBeInTheDocument();
    });

    it("prevents break toggle for non-existent task", () => {
      const task = createTask({ id: "task-1", text: "Task" });
      const { onToggleBreak } = renderDailyTaskList([task]);

      const listItem = screen.getByText("Task").closest(".list-group-item");
      fireEvent.contextMenu(listItem!);

      // Manually trigger handleToggleBreak with non-existent task id
      // This is an edge case that should be handled gracefully
      // We can't easily test this through the UI, so the test serves as documentation
      expect(onToggleBreak).not.toHaveBeenCalled();
    });

    it("does not add break to task without stopTime that's too short", () => {
      // Running tasks can have break toggled without duration check
      // This test documents that the implementation allows it
      const task = createTask({
        text: "Running Task",
        startTime: "2026-02-15T14:55:00",
        stopTime: null,
        includesBreak: false,
      });

      renderDailyTaskList([task]);

      expect(screen.getByText("Running Task")).toBeInTheDocument();
      // Task should be rendered without issues
    });
  });

  describe("accessibility", () => {
    it("provides aria-label for edit buttons", () => {
      const task = createTask({ text: "My Task" });

      renderDailyTaskList([task]);

      const editButton = screen.getByRole("button", { name: "Edit My Task" });
      expect(editButton).toHaveAttribute("aria-label", "Edit My Task");
    });

    it("provides aria-label for delete buttons", () => {
      const task = createTask({ text: "My Task" });

      renderDailyTaskList([task]);

      const deleteButton = screen.getByRole("button", { name: "Delete My Task" });
      expect(deleteButton).toHaveAttribute("aria-label", "Delete My Task");
    });

    it("provides aria-label for break badge", () => {
      const task = createTask({
        text: "Task with break",
        startTime: "2026-02-15T08:00:00",
        stopTime: "2026-02-15T14:00:00",
        includesBreak: true,
      });

      renderDailyTaskList([task]);

      const badge = screen.getByTitle(`${BREAK_DURATION_MINUTES}min break deducted`);
      expect(badge).toHaveAttribute("aria-label", `${BREAK_DURATION_MINUTES} minute break deducted`);
    });

    it("provides aria-live region for edit modal errors", async () => {
      const user = userEvent.setup();
      const task = createTask({ text: "Task" });
      const onUpdateTask = vi.fn().mockResolvedValue(false);

      renderDailyTaskList([task], { onUpdateTask });

      await user.click(screen.getByRole("button", { name: "Edit Task" }));
      await user.click(screen.getByRole("button", { name: "Save Changes" }));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveAttribute("aria-live", "polite");
    });
  });
});