import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { TimeTrackingDailyView } from "../../../src/components/timeTracking/TimeTrackingDailyView";
import type {
  StoredTimeTrackingTask,
  TimeTrackingTemplate,
} from "../../../src/components/timeTracking/types";
import { dayjs } from "../../../src/utils/dateTimeUtils";

const TEST_LABELS = [
  { name: "Development", color: "#198754" },
  { name: "Support", color: "#c82333" },
  { name: "Meeting", color: "#6f42c1" },
];

const TEST_TEMPLATES: TimeTrackingTemplate[] = [
  {
    id: "tpl-1",
    text: "Morning Support",
    label: "Support",
    start: "08:00",
    stop: "12:00",
  },
];

describe("TimeTrackingDailyView", () => {
  const mockProps = {
    tasks: [] as StoredTimeTrackingTask[],
    labels: TEST_LABELS,
    templates: TEST_TEMPLATES,
    selectedDate: dayjs().format("YYYY-MM-DD"),
    onSelectedDateChange: vi.fn(),
    onAddTask: vi.fn(),
    onUpdateTaskTimes: vi.fn(),
    onRemoveTask: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("Quick Timer", () => {
    it("starts a timer when a task name is provided", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-01T10:15:30"));
      vi.stubGlobal("crypto", { randomUUID: () => "task-123" } as unknown as Crypto);
      const onAddTask = vi.fn().mockReturnValue(true);

      render(<TimeTrackingDailyView {...mockProps} onAddTask={onAddTask} />);

      fireEvent.change(screen.getByLabelText(/^Task$/i), { target: { value: "Focus work" } });
      fireEvent.click(screen.getByRole("button", { name: /Start Now/i }));

      expect(onAddTask).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "task-123",
          text: "Focus work",
          label: "Development",
          startTime: "2025-01-01T10:15",
        }),
      );
    });

    it("disables start-now until task details are entered", async () => {
      render(<TimeTrackingDailyView {...mockProps} />);

      const startNowButton = screen.getByRole("button", { name: /Start Now/i });
      expect(startNowButton).toBeDisabled();

      fireEvent.change(screen.getByLabelText(/^Task$/i), { target: { value: "Focus work" } });
      expect(screen.getByRole("button", { name: /Start Now/i })).toBeEnabled();
    });

    it("renders the running task UI with elapsed time", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-01T10:00:05"));
      const runningTask: StoredTimeTrackingTask = {
        id: "running-1",
        text: "On call",
        label: "Support",
        startTime: "2025-01-01T10:00",
      };

      render(
        <TimeTrackingDailyView {...mockProps} tasks={[runningTask]} selectedDate="2025-01-01" />,
      );

      expect(screen.getByText("Running", { selector: "span" })).toBeInTheDocument();
      // Task title appears in both Quick Timer UI and the daily task list.
      expect(screen.getAllByText("On call")).toHaveLength(2);
      expect(screen.getByText(/Started 10:00/i)).toBeInTheDocument();
      expect(screen.getByText(/Elapsed 00:00:05/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Stop Timer/i })).toBeInTheDocument();
    });

    it("stops a same-day running task", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-01T10:30:00"));
      const onUpdateTaskTimes = vi.fn();
      const runningTask: StoredTimeTrackingTask = {
        id: "running-2",
        text: "Write notes",
        label: "Meeting",
        startTime: "2025-01-01T10:00",
      };

      render(
        <TimeTrackingDailyView
          {...mockProps}
          tasks={[runningTask]}
          onUpdateTaskTimes={onUpdateTaskTimes}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /Stop Timer/i }));

      expect(onUpdateTaskTimes).toHaveBeenCalledWith({
        id: "running-2",
        newStartTime: "2025-01-01T10:00",
        newStopTime: "2025-01-01T10:30",
      });
    });

    it("blocks stopping a cross-day running task and shows an error", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-02T00:05:00"));
      const onUpdateTaskTimes = vi.fn();
      const runningTask: StoredTimeTrackingTask = {
        id: "running-3",
        text: "Overnight support",
        label: "Support",
        startTime: "2025-01-01T23:55",
      };

      render(
        <TimeTrackingDailyView
          {...mockProps}
          tasks={[runningTask]}
          onUpdateTaskTimes={onUpdateTaskTimes}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /Stop Timer/i }));

      expect(screen.getAllByRole("alert")[0]).toHaveTextContent(
        /This task started on 2025-01-01\. Please update the stop time manually\./i,
      );
      expect(onUpdateTaskTimes).not.toHaveBeenCalled();
    });
  });

  describe("Task Form Rendering", () => {
    it("should render all form input controls", () => {
      render(<TimeTrackingDailyView {...mockProps} />);

      expect(screen.getByLabelText(/^Task$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Label$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Start$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Stop$/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Add Task/i })).toBeInTheDocument();
    });

    it("should mark required fields appropriately", () => {
      render(<TimeTrackingDailyView {...mockProps} />);

      expect(screen.getByLabelText(/^Task$/i)).toHaveAttribute("aria-required", "true");
      expect(screen.getByLabelText(/^Start$/i)).toHaveAttribute("aria-required", "true");
      expect(screen.getByLabelText(/^Stop$/i)).toHaveAttribute("aria-required", "true");
    });

    it("applies a selected template to the task form", async () => {
      const user = userEvent.setup();
      render(<TimeTrackingDailyView {...mockProps} />);

      await user.selectOptions(screen.getByLabelText(/Template selector/i), "tpl-1");
      await user.click(screen.getByRole("button", { name: /Use Template/i }));

      expect(screen.getByLabelText(/^Task$/i)).toHaveValue("Morning Support");
      expect(screen.getByLabelText(/^Label$/i)).toHaveValue("Support");
      expect(screen.getByLabelText(/^Start$/i)).toHaveValue("08:00");
      expect(screen.getByLabelText(/^Stop$/i)).toHaveValue("12:00");
    });
  });

  describe("Input Validation", () => {
    it("should keep add-task disabled until required fields are completed", async () => {
      render(<TimeTrackingDailyView {...mockProps} />);

      const addTaskButton = screen.getByRole("button", { name: /Add Task/i });
      expect(addTaskButton).toBeDisabled();
    });

    it("should validate time range order", async () => {
      const user = userEvent.setup();
      render(<TimeTrackingDailyView {...mockProps} />);

      await user.type(screen.getByLabelText(/^Task$/i), "Test");
      await user.type(screen.getByLabelText(/^Start$/i), "08:00");
      await user.type(screen.getByLabelText(/^Stop$/i), "08:00");
      expect(screen.getByRole("button", { name: /Add Task/i })).toBeDisabled();
    });

    it("should detect time conflicts", async () => {
      const user = userEvent.setup();
      const today = dayjs().format("YYYY-MM-DD");
      const existingTasks: StoredTimeTrackingTask[] = [
        {
          id: "1",
          text: "Existing",
          label: "Support",
          startTime: `${today}T08:00`,
          stopTime: `${today}T12:00`,
        },
      ];

      render(<TimeTrackingDailyView {...mockProps} tasks={existingTasks} />);

      await user.type(screen.getByLabelText(/^Task$/i), "New task");
      await user.type(screen.getByLabelText(/^Start$/i), "09:00");
      await user.type(screen.getByLabelText(/^Stop$/i), "10:00");
      await user.click(screen.getByRole("button", { name: /Add Task/i }));

      const alerts = screen.getAllByRole("alert");
      const mainAlert = alerts[0]; // First alert is the main validation alert
      expect(mainAlert.textContent).toMatch(/Time range overlaps/i);
    });
  });

  describe("Task Display", () => {
    it("shows empty state message", () => {
      render(<TimeTrackingDailyView {...mockProps} />);
      expect(screen.getByText(/No time entries yet/i)).toBeInTheDocument();
    });

    it("displays task list when tasks exist", () => {
      const today = dayjs().format("YYYY-MM-DD");
      const tasks: StoredTimeTrackingTask[] = [
        {
          id: "1",
          text: "Task A",
          label: "Support",
          startTime: `${today}T08:00`,
          stopTime: `${today}T12:00`,
        },
        {
          id: "2",
          text: "Task B",
          label: "Meeting",
          startTime: `${today}T13:00`,
          stopTime: `${today}T14:00`,
        },
      ];

      render(<TimeTrackingDailyView {...mockProps} tasks={tasks} />);

      expect(screen.getByText("Task A")).toBeInTheDocument();
      expect(screen.getByText("Task B")).toBeInTheDocument();
    });

    it("shows progress indicator", () => {
      const today = dayjs().format("YYYY-MM-DD");
      const tasks: StoredTimeTrackingTask[] = [
        {
          id: "1",
          text: "Task",
          label: "Support",
          startTime: `${today}T08:00`,
          stopTime: `${today}T12:00`,
        },
      ];

      const { container } = render(<TimeTrackingDailyView {...mockProps} tasks={tasks} />);
      expect(container.querySelector(".progress")).toBeInTheDocument();
    });
  });

  describe("Task Management", () => {
    it("provides remove action for each task", () => {
      const today = dayjs().format("YYYY-MM-DD");
      const tasks: StoredTimeTrackingTask[] = [
        {
          id: "1",
          text: "Task",
          label: "Support",
          startTime: `${today}T08:00`,
          stopTime: `${today}T12:00`,
        },
      ];

      render(<TimeTrackingDailyView {...mockProps} tasks={tasks} />);
      expect(screen.getAllByRole("button", { name: /Remove/i })).toHaveLength(1);
    });

    it("invokes callback on task removal", async () => {
      const user = userEvent.setup();
      const today = dayjs().format("YYYY-MM-DD");
      const tasks: StoredTimeTrackingTask[] = [
        {
          id: "1",
          text: "Task",
          label: "Support",
          startTime: `${today}T08:00`,
          stopTime: `${today}T12:00`,
        },
      ];

      render(<TimeTrackingDailyView {...mockProps} tasks={tasks} />);
      await user.click(screen.getByRole("button", { name: /Remove/i }));

      expect(mockProps.onRemoveTask).toHaveBeenCalledWith("1");
    });

    it("updates task details via edit modal", async () => {
      const user = userEvent.setup();
      const onUpdateTaskTimes = vi.fn();
      const today = dayjs().format("YYYY-MM-DD");
      const tasks: StoredTimeTrackingTask[] = [
        {
          id: "1",
          text: "Task",
          label: "Support",
          startTime: `${today}T08:00`,
          stopTime: `${today}T12:00`,
        },
      ];

      render(
        <TimeTrackingDailyView
          {...mockProps}
          tasks={tasks}
          onUpdateTaskTimes={onUpdateTaskTimes}
        />,
      );

      await user.click(screen.getByRole("button", { name: /Edit/i }));

      const dialog = screen.getByRole("dialog");
      const taskInput = within(dialog).getByLabelText(/^Task$/i);
      await user.clear(taskInput);
      await user.type(taskInput, "Updated Task");
      await user.selectOptions(within(dialog).getByLabelText(/^Label$/i), "Meeting");
      await user.clear(within(dialog).getByLabelText(/^Start$/i));
      await user.type(within(dialog).getByLabelText(/^Start$/i), "09:00");
      await user.clear(within(dialog).getByLabelText(/^Stop$/i));
      await user.type(within(dialog).getByLabelText(/^Stop$/i), "11:00");
      await user.click(within(dialog).getByRole("button", { name: /Save Changes/i }));

      expect(onUpdateTaskTimes).toHaveBeenCalledWith({
        id: "1",
        newText: "Updated Task",
        newLabel: "Meeting",
        newStartTime: `${today}T09:00`,
        newStopTime: `${today}T11:00`,
      });
    });
  });

  describe("Accessibility Compliance", () => {
    it("maintains accessible button labels", () => {
      render(<TimeTrackingDailyView {...mockProps} />);

      expect(screen.getByRole("button", { name: /Add Task/i })).toBeInTheDocument();
    });

    it("provides accessible form controls", () => {
      render(<TimeTrackingDailyView {...mockProps} />);

      expect(screen.getByLabelText(/^Task$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Label$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Start$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Stop$/i)).toBeInTheDocument();
    });
  });
});
