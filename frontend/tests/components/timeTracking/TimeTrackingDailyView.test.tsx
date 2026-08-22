import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { TimeTrackingDailyView } from "@/components/timeTracking/TimeTrackingDailyView";
import { ToastProvider } from "@/contexts/ToastContext";
import { SettingsProvider, defaultSettings } from "@/contexts/SettingsContext";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "@/components/timeTracking/types";
import { dayjs } from "@/utils/dateTimeUtils";
import { ganttTasksCollection } from "@/db/collections";
import { USER_STATE_STORAGE_KEY } from "@/constants/storageKeys";

const TEST_LABELS = [
  { id: "Development", name: "Development", color: "#198754" },
  { id: "Support", name: "Support", color: "#c82333" },
  { id: "Meeting", name: "Meeting", color: "#6f42c1" },
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
  let mockProps: {
    tasks: StoredTimeTrackingTask[];
    labels: typeof TEST_LABELS;
    templates: TimeTrackingTemplate[];
    selectedDate: string;
    onSelectedDateChange: (date: string) => void;
    onAddTask: (payload: StoredTimeTrackingTask) => Promise<boolean>;
    onUpdateLabels: (labels: typeof TEST_LABELS) => void;
    onUpdateTaskTimes: (payload: {
      id: string;
      newStartTime: string;
      newStopTime: string | null | undefined;
      newText?: string;
      newLabel?: string;
    }) => void;
    onRemoveTask: (id: string) => void;
    onToggleBreak: (taskId: string, includesBreak: boolean) => void;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockProps = {
      tasks: [] as StoredTimeTrackingTask[],
      labels: TEST_LABELS,
      templates: TEST_TEMPLATES,
      selectedDate: dayjs().format("YYYY-MM-DD"),
      onSelectedDateChange: vi.fn(),
      onAddTask: vi.fn().mockResolvedValue(true),
      onUpdateLabels: vi.fn(),
      onUpdateTaskTimes: vi.fn(),
      onRemoveTask: vi.fn(),
      onToggleBreak: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const renderView = (overrides: Partial<typeof mockProps> = {}) => {
    return render(
      <SettingsProvider>
        <ToastProvider>
          <TimeTrackingDailyView {...mockProps} {...overrides} />
        </ToastProvider>
      </SettingsProvider>,
    );
  };

  describe("Quick Timer", () => {
    it("puts the idle state and single helper sentence on the form without a wrapper card", () => {
      renderView();

      expect(screen.queryByText("Quick Timer")).not.toBeInTheDocument();
      expect(
        screen.getByText("Start a task now and stop it when you're done."),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Start Now · Idle/i })).toBeInTheDocument();
      expect(screen.queryByText("Idle", { selector: ".badge" })).not.toBeInTheDocument();
    });

    it("starts a timer when a task name is provided", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-01T10:15:30"));
      vi.stubGlobal("crypto", { randomUUID: () => "task-123" } as unknown as Crypto);
      const onAddTask = vi.fn().mockResolvedValue(true);

      renderView({ onAddTask });

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

    it("starts a timer with a default task name when task is blank", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-01T10:15:30"));
      vi.stubGlobal("crypto", { randomUUID: () => "task-123" } as unknown as Crypto);
      const onAddTask = vi.fn().mockResolvedValue(true);

      renderView({ onAddTask });

      const startNowButton = screen.getByRole("button", { name: /Start Now/i });
      expect(startNowButton).toBeEnabled();
      fireEvent.click(startNowButton);

      expect(onAddTask).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "task-123",
          text: "Untitled task",
          label: "Development",
          startTime: "2025-01-01T10:15",
        }),
      );
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

      renderView({ tasks: [runningTask], selectedDate: "2025-01-01" });

      expect(screen.getAllByText("On call")).toHaveLength(2);
      expect(screen.getAllByText("Support", { selector: ".time-tracking-label" })).toHaveLength(2);
      expect(screen.queryByText(/Started 2025-01-01 10:00/)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Stop Timer · 00:00:05/i })).toBeInTheDocument();
      expect(screen.getByText("Running", { selector: ".badge" })).toBeInTheDocument();
    });

    it("identifies a running task started on another date", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-02T10:00:00"));
      const runningTask: StoredTimeTrackingTask = {
        id: "running-elsewhere",
        text: "Night handover",
        label: "Support",
        startTime: "2025-01-01T23:30",
      };

      renderView({ tasks: [runningTask], selectedDate: "2025-01-02" });

      expect(screen.getByText("Night handover")).toBeInTheDocument();
      expect(screen.getByText("Support", { selector: ".time-tracking-label" })).toBeInTheDocument();
      expect(screen.getByText("Started 2025-01-01 23:30")).toBeInTheDocument();
      expect(screen.queryByText("Night handover", { selector: ".list-group-item *" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Stop Timer · 10:30:00/i })).toBeInTheDocument();
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

      renderView({ tasks: [runningTask], onUpdateTaskTimes });

      fireEvent.click(screen.getByRole("button", { name: /Stop Timer/i }));

      expect(onUpdateTaskTimes).toHaveBeenCalledWith({
        id: "running-2",
        newStartTime: "2025-01-01T10:00",
        newStopTime: "2025-01-01T10:30",
      });
    });

    it("opens edit modal for a cross-day running task with info message", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-02T00:05:00"));
      const onUpdateTaskTimes = vi.fn();
      const runningTask: StoredTimeTrackingTask = {
        id: "running-3",
        text: "Overnight support",
        label: "Support",
        startTime: "2025-01-01T23:55",
      };

      mockProps.selectedDate = "2025-01-02";
      renderView({ tasks: [runningTask], onUpdateTaskTimes });

      fireEvent.click(screen.getByRole("button", { name: /Stop Timer/i }));

      expect(screen.getByText(/Edit Task/i)).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent(
        /This task started on 2025-01-01 and spans midnight/i,
      );
      expect(onUpdateTaskTimes).not.toHaveBeenCalled();
    });

    it("keeps a cross-day running task on its original start date when saving from edit modal", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-02T00:05:00"));
      const onUpdateTaskTimes = vi.fn();
      const runningTask: StoredTimeTrackingTask = {
        id: "running-4",
        text: "Overnight maintenance",
        label: "Support",
        startTime: "2025-01-01T23:55",
      };

      renderView({
        tasks: [runningTask],
        selectedDate: "2025-01-02",
        onUpdateTaskTimes,
      });

      fireEvent.click(screen.getByRole("button", { name: /Stop Timer/i }));
      const dialog = screen.getByRole("dialog");
      fireEvent.change(within(dialog).getByLabelText(/^Stop$/i), { target: { value: "23:59" } });
      fireEvent.click(within(dialog).getByRole("button", { name: /Save Changes/i }));

      expect(onUpdateTaskTimes).toHaveBeenCalledWith({
        id: "running-4",
        newText: "Overnight maintenance",
        newLabel: "Support",
        newStartTime: "2025-01-01T23:55",
        newStopTime: "2025-01-01T23:59",
      });
    });

    it("keeps a Friday running task on Friday when stopped from Monday", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-06T08:00:00"));
      const onUpdateTaskTimes = vi.fn();
      const runningTask: StoredTimeTrackingTask = {
        id: "running-weekend",
        text: "Friday production watch",
        label: "Support",
        startTime: "2025-01-03T16:30",
      };

      renderView({
        tasks: [runningTask],
        selectedDate: "2025-01-06",
        onUpdateTaskTimes,
      });

      fireEvent.click(screen.getByRole("button", { name: /Stop Timer/i }));
      const dialog = screen.getByRole("dialog");
      fireEvent.change(within(dialog).getByLabelText(/^Stop$/i), { target: { value: "17:00" } });
      fireEvent.click(within(dialog).getByRole("button", { name: /Save Changes/i }));

      expect(onUpdateTaskTimes).toHaveBeenCalledWith({
        id: "running-weekend",
        newText: "Friday production watch",
        newLabel: "Support",
        newStartTime: "2025-01-03T16:30",
        newStopTime: "2025-01-03T17:00",
      });
    });

    it("checks overlap against the task's original day during cross-day edit", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-06T08:00:00"));
      const onUpdateTaskTimes = vi.fn();
      const tasks: StoredTimeTrackingTask[] = [
        {
          id: "friday-existing",
          text: "Friday handover",
          label: "Meeting",
          startTime: "2025-01-03T16:00",
          stopTime: "2025-01-03T17:00",
        },
        {
          id: "running-weekend-overlap",
          text: "Friday production watch",
          label: "Support",
          startTime: "2025-01-03T15:30",
        },
      ];

      renderView({
        tasks,
        selectedDate: "2025-01-06",
        onUpdateTaskTimes,
      });

      fireEvent.click(screen.getByRole("button", { name: /Stop Timer/i }));
      const dialog = screen.getByRole("dialog");
      fireEvent.change(within(dialog).getByLabelText(/^Stop$/i), { target: { value: "16:30" } });
      fireEvent.click(within(dialog).getByRole("button", { name: /Save Changes/i }));

      expect(onUpdateTaskTimes).not.toHaveBeenCalled();
      const alerts = screen.getAllByRole("alert");
      expect(
        alerts.some((alert) =>
          /Time range overlaps an existing task/i.test(alert.textContent ?? ""),
        ),
      ).toBe(true);
    });
  });

  describe("Task Form Rendering", () => {
    it("should render all form input controls", () => {
      renderView();

      expect(screen.getByLabelText(/^Task$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Label$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Start$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Stop$/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Add Task/i })).toBeInTheDocument();
    });

    it("should mark required fields appropriately", () => {
      renderView();

      expect(screen.getByLabelText(/^Task$/i)).toHaveAttribute("aria-required", "true");
      expect(screen.getByLabelText(/^Start$/i)).toHaveAttribute("aria-required", "true");
      expect(screen.getByLabelText(/^Stop$/i)).toHaveAttribute("aria-required", "true");
    });

    it("applies a selected template to the task form", async () => {
      const user = userEvent.setup();
      renderView();

      await user.selectOptions(screen.getByLabelText(/^Template$/i), "tpl-1");
      await user.click(screen.getByRole("button", { name: /Use Template/i }));

      expect(screen.getByLabelText(/^Task$/i)).toHaveValue("Morning Support");
      expect(screen.getByLabelText(/^Label$/i)).toHaveValue("Support");
      expect(screen.getByLabelText(/^Start$/i)).toHaveValue("08:00");
      expect(screen.getByLabelText(/^Stop$/i)).toHaveValue("12:00");
    });
  });

  describe("Label Creation", () => {
    it("shows help text and a create-label action when no labels exist", () => {
      renderView({ labels: [] });

      expect(
        screen.getByText(/Add at least one label before you can log tasks/i),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Create a label/i })).toBeInTheDocument();
    });

    it("creates a label from the inline modal and selects it", async () => {
      const user = userEvent.setup();
      const onUpdateLabels = vi.fn();
      renderView({ labels: [], onUpdateLabels });

      await user.click(screen.getByRole("button", { name: /Create a label/i }));
      const dialog = screen.getByRole("dialog");
      await user.type(within(dialog).getByLabelText(/Label name/i), "Support");
      await user.click(within(dialog).getByRole("button", { name: /Save Label/i }));

      expect(onUpdateLabels).toHaveBeenCalledWith([expect.objectContaining({ name: "Support" })]);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("Input Validation", () => {
    it("should keep add-task disabled until required fields are completed", async () => {
      renderView();

      const addTaskButton = screen.getByRole("button", { name: /Add Task/i });
      expect(addTaskButton).toBeDisabled();
    });

    it("should validate time range order", async () => {
      const user = userEvent.setup();
      renderView();

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

      renderView({ tasks: existingTasks });

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
      renderView();
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

      renderView({ tasks });

      // Tasks now appear in both timeline and task list
      expect(screen.getAllByText("Task A").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Task B").length).toBeGreaterThan(0);
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

      const { container } = renderView({ tasks });
      // TimelineProgressBar uses React Bootstrap .progress class
      expect(container.querySelector(".progress")).toBeInTheDocument();
    });
  });

  describe("Task Management", () => {
    it("provides remove action via context menu", () => {
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

      const { container } = renderView({ tasks });
      const taskItem = container.querySelector(".list-group-item")!;
      fireEvent.contextMenu(taskItem);
      expect(screen.getByText("Remove")).toBeInTheDocument();
    });

    it("invokes callback on task removal via context menu", async () => {
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

      const { container } = renderView({ tasks });
      const taskItem = container.querySelector(".list-group-item")!;
      fireEvent.contextMenu(taskItem);
      await user.click(screen.getByText("Remove"));

      expect(mockProps.onRemoveTask).toHaveBeenCalledWith("1");
    });

    it("updates task details via edit modal from context menu", async () => {
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

      const { container } = renderView({ tasks, onUpdateTaskTimes });

      const taskItem = container.querySelector(".list-group-item")!;
      fireEvent.contextMenu(taskItem);
      await user.click(screen.getByText("Edit"));

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

  describe("Gantt picker visibility", () => {
    const enableGantt = () => {
      window.localStorage.setItem(
        USER_STATE_STORAGE_KEY,
        JSON.stringify({ settings: { ...defaultSettings, enableGantt: true } }),
      );
    };

    it("hides the Gantt task picker when the feature is disabled", () => {
      renderView();

      expect(screen.queryByLabelText(/^Gantt task$/i)).not.toBeInTheDocument();
    });

    it("hides the Gantt task picker when enabled but no Gantt tasks exist", () => {
      enableGantt();
      renderView();

      expect(screen.queryByLabelText(/^Gantt task$/i)).not.toBeInTheDocument();
    });

    it("shows the Gantt task picker when enabled and Gantt tasks exist", () => {
      enableGantt();
      ganttTasksCollection.utils.writeUpsert([
        {
          id: "gantt-1",
          name: "Plan release",
          start: "2026-03-01",
          end: "2026-03-05",
          progress: 0,
        },
      ]);

      renderView();

      expect(screen.getByLabelText(/^Gantt task$/i)).toBeInTheDocument();
    });
  });

  describe("Accessibility Compliance", () => {
    it("maintains accessible button labels", () => {
      renderView();

      expect(screen.getByRole("button", { name: /Add Task/i })).toBeInTheDocument();
    });

    it("provides accessible form controls", () => {
      renderView();

      expect(screen.getByLabelText(/^Task$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Label$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Start$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Stop$/i)).toBeInTheDocument();
    });
  });
});
