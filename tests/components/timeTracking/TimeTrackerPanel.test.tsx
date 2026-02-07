import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import React from "react";
import { TimeTrackerPanel } from "../../../src/components/timeTracking/TimeTrackerPanel";
import type {
  StoredTimeTrackingTask,
  TimeTrackingTemplate,
} from "../../../src/components/timeTracking/types";
import { dayjs } from "../../../src/utils/dateTimeUtils";

describe("TimeTrackerPanel", () => {
  const mockProps = {
    tasks: [] as StoredTimeTrackingTask[],
    templates: [] as TimeTrackingTemplate[],
    onAddTask: vi.fn(),
    onUpdateTaskTimes: vi.fn(),
    onRemoveTask: vi.fn(),
    onAddTemplate: vi.fn(),
    onUpdateTemplate: vi.fn(),
    onDeleteTemplate: vi.fn(),
    onExportData: vi.fn(),
    onImportData: vi.fn(),
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
      vi.stubGlobal("crypto", { randomUUID: () => "task-123" } as Crypto);
      const onAddTask = vi.fn().mockReturnValue(true);

      render(<TimeTrackerPanel {...mockProps} onAddTask={onAddTask} />);

      fireEvent.change(screen.getByLabelText(/^Task$/i), { target: { value: "Focus work" } });
      fireEvent.click(screen.getByRole("button", { name: /Start Timer/i }));

      expect(onAddTask).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "task-123",
          text: "Focus work",
          tag: "Development",
          startTime: "2025-01-01T10:15",
        }),
      );
    });

    it("requires a task name before starting", async () => {
      render(<TimeTrackerPanel {...mockProps} />);

      fireEvent.click(screen.getByRole("button", { name: /Start Timer/i }));

      expect(screen.getAllByRole("alert")[0]).toHaveTextContent(
        /Please enter a task name to start/i,
      );
    });

    it("renders the running task UI with elapsed time", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-01T10:00:05"));
      const runningTask: StoredTimeTrackingTask = {
        id: "running-1",
        text: "On call",
        tag: "Support",
        startTime: "2025-01-01T10:00",
      };

      render(<TimeTrackerPanel {...mockProps} tasks={[runningTask]} />);

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
        tag: "Meeting",
        startTime: "2025-01-01T10:00",
      };

      render(
        <TimeTrackerPanel
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
        tag: "Support",
        startTime: "2025-01-01T23:55",
      };

      render(
        <TimeTrackerPanel
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
      render(<TimeTrackerPanel {...mockProps} />);

      expect(screen.getByLabelText(/Select Date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Task$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Tag$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Start$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Stop$/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Add Task/i })).toBeInTheDocument();
    });

    it("should mark required fields appropriately", () => {
      render(<TimeTrackerPanel {...mockProps} />);

      expect(screen.getByLabelText(/^Task$/i)).toHaveAttribute("aria-required", "true");
      expect(screen.getByLabelText(/^Start$/i)).toHaveAttribute("aria-required", "true");
      expect(screen.getByLabelText(/^Stop$/i)).toHaveAttribute("aria-required", "true");
    });

    it("should provide date selection input", () => {
      render(<TimeTrackerPanel {...mockProps} />);

      const dateInput = screen.getByLabelText(/Select Date/i);
      expect(dateInput).toHaveAttribute("type", "date");
    });
  });

  describe("Input Validation", () => {
    it("should validate all fields are filled", async () => {
      const user = userEvent.setup();
      render(<TimeTrackerPanel {...mockProps} />);

      await user.click(screen.getByRole("button", { name: /Add Task/i }));

      const alerts = screen.getAllByRole("alert");
      const mainAlert = alerts[0]; // First alert is the main validation alert
      expect(mainAlert.textContent).toMatch(/Please fill in all fields/i);
      expect(mockProps.onAddTask).not.toHaveBeenCalled();
    });

    it("should validate time range order", async () => {
      const user = userEvent.setup();
      render(<TimeTrackerPanel {...mockProps} />);

      await user.type(screen.getByLabelText(/^Task$/i), "Test");
      await user.type(screen.getByLabelText(/^Start$/i), "08:00");
      await user.type(screen.getByLabelText(/^Stop$/i), "08:00");
      await user.click(screen.getByRole("button", { name: /Add Task/i }));

      const alerts = screen.getAllByRole("alert");
      const mainAlert = alerts[0]; // First alert is the main validation alert
      expect(mainAlert.textContent).toMatch(/Stop time must be after start time/i);
    });

    it("should detect time conflicts", async () => {
      const user = userEvent.setup();
      const today = dayjs().format("YYYY-MM-DD");
      const existingTasks: StoredTimeTrackingTask[] = [
        {
          id: "1",
          text: "Existing",
          tag: "Support",
          startTime: `${today}T08:00`,
          stopTime: `${today}T12:00`,
        },
      ];

      render(<TimeTrackerPanel {...mockProps} tasks={existingTasks} />);

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
      render(<TimeTrackerPanel {...mockProps} />);
      expect(screen.getByText(/No time entries yet/i)).toBeInTheDocument();
    });

    it("displays task list when tasks exist", () => {
      const today = dayjs().format("YYYY-MM-DD");
      const tasks: StoredTimeTrackingTask[] = [
        {
          id: "1",
          text: "Task A",
          tag: "Support",
          startTime: `${today}T08:00`,
          stopTime: `${today}T12:00`,
        },
        {
          id: "2",
          text: "Task B",
          tag: "Meeting",
          startTime: `${today}T13:00`,
          stopTime: `${today}T14:00`,
        },
      ];

      render(<TimeTrackerPanel {...mockProps} tasks={tasks} />);

      expect(screen.getByText("Task A")).toBeInTheDocument();
      expect(screen.getByText("Task B")).toBeInTheDocument();
    });

    it("shows progress indicator", () => {
      const today = dayjs().format("YYYY-MM-DD");
      const tasks: StoredTimeTrackingTask[] = [
        {
          id: "1",
          text: "Task",
          tag: "Support",
          startTime: `${today}T08:00`,
          stopTime: `${today}T12:00`,
        },
      ];

      const { container } = render(<TimeTrackerPanel {...mockProps} tasks={tasks} />);
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
          tag: "Support",
          startTime: `${today}T08:00`,
          stopTime: `${today}T12:00`,
        },
      ];

      render(<TimeTrackerPanel {...mockProps} tasks={tasks} />);
      expect(screen.getAllByRole("button", { name: /Remove/i })).toHaveLength(1);
    });

    it("invokes callback on task removal", async () => {
      const user = userEvent.setup();
      const today = dayjs().format("YYYY-MM-DD");
      const tasks: StoredTimeTrackingTask[] = [
        {
          id: "1",
          text: "Task",
          tag: "Support",
          startTime: `${today}T08:00`,
          stopTime: `${today}T12:00`,
        },
      ];

      render(<TimeTrackerPanel {...mockProps} tasks={tasks} />);
      await user.click(screen.getByRole("button", { name: /Remove/i }));

      expect(mockProps.onRemoveTask).toHaveBeenCalledWith("1");
    });
  });

  describe("Template Features", () => {
    it("provides template toggle button", () => {
      render(<TimeTrackerPanel {...mockProps} />);
      expect(screen.getByRole("button", { name: /Show templates/i })).toBeInTheDocument();
    });

    it("displays templates when expanded", async () => {
      const user = userEvent.setup();
      const templates = [
        { id: "t1", text: "Template A", tag: "Support" as const, start: "08:00", stop: "12:00" },
      ];

      render(<TimeTrackerPanel {...mockProps} templates={templates} />);
      await user.click(screen.getByRole("button", { name: /Show templates/i }));

      expect(screen.getByText(/Template A/i)).toBeInTheDocument();
    });
  });

  describe("Data Management", () => {
    it("provides export functionality", () => {
      render(<TimeTrackerPanel {...mockProps} />);
      expect(screen.getByRole("button", { name: /Export Data/i })).toBeInTheDocument();
    });

    it("provides import capability", () => {
      render(<TimeTrackerPanel {...mockProps} />);
      expect(screen.getByText(/Import Data/i)).toBeInTheDocument();
    });

    it("triggers export on button click", async () => {
      const user = userEvent.setup();
      render(<TimeTrackerPanel {...mockProps} />);

      await user.click(screen.getByRole("button", { name: /Export Data/i }));
      expect(mockProps.onExportData).toHaveBeenCalled();
    });
  });

  describe("Accessibility Compliance", () => {
    it("maintains accessible button labels", () => {
      render(<TimeTrackerPanel {...mockProps} />);

      expect(screen.getByRole("button", { name: /Add Task/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Export Data/i })).toBeInTheDocument();
    });

    it("provides accessible form controls", () => {
      render(<TimeTrackerPanel {...mockProps} />);

      expect(screen.getByLabelText(/^Task$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Tag$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Start$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Stop$/i)).toBeInTheDocument();
    });
  });
});
