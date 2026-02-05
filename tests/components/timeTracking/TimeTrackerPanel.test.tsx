import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import React from "react";
import { TimeTrackerPanel } from "../../../src/components/timeTracking/TimeTrackerPanel";
import type {
  StoredTimeTrackingTask,
  TimeTrackingTemplate,
} from "../../../src/components/timeTracking/types";

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
      await user.type(screen.getByLabelText(/^Start$/i), "17:00");
      await user.type(screen.getByLabelText(/^Stop$/i), "08:00");
      await user.click(screen.getByRole("button", { name: /Add Task/i }));

      const alerts = screen.getAllByRole("alert");
      const mainAlert = alerts[0]; // First alert is the main validation alert
      expect(mainAlert.textContent).toMatch(/Stop time must be after start time/i);
    });

    it("should detect time conflicts", async () => {
      const user = userEvent.setup();
      const today = new Date().toISOString().split("T")[0];
      const existingTasks = [
        { id: "1", date: today, text: "Existing", tag: "Support" as const, start: "08:00", stop: "12:00" },
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
      const today = new Date().toISOString().split("T")[0];
      const tasks = [
        { id: "1", date: today, text: "Task A", tag: "Support" as const, start: "08:00", stop: "12:00" },
        { id: "2", date: today, text: "Task B", tag: "Meeting" as const, start: "13:00", stop: "14:00" },
      ];

      render(<TimeTrackerPanel {...mockProps} tasks={tasks} />);

      expect(screen.getByText("Task A")).toBeInTheDocument();
      expect(screen.getByText("Task B")).toBeInTheDocument();
    });

    it("shows progress indicator", () => {
      const today = new Date().toISOString().split("T")[0];
      const tasks = [
        { id: "1", date: today, text: "Task", tag: "Support" as const, start: "08:00", stop: "12:00" },
      ];

      const { container } = render(<TimeTrackerPanel {...mockProps} tasks={tasks} />);
      expect(container.querySelector(".progress")).toBeInTheDocument();
    });
  });

  describe("Task Management", () => {
    it("provides remove action for each task", () => {
      const today = new Date().toISOString().split("T")[0];
      const tasks = [
        { id: "1", date: today, text: "Task", tag: "Support" as const, start: "08:00", stop: "12:00" },
      ];

      render(<TimeTrackerPanel {...mockProps} tasks={tasks} />);
      expect(screen.getAllByRole("button", { name: /Remove/i })).toHaveLength(1);
    });

    it("invokes callback on task removal", async () => {
      const user = userEvent.setup();
      const today = new Date().toISOString().split("T")[0];
      const tasks = [
        { id: "1", date: today, text: "Task", tag: "Support" as const, start: "08:00", stop: "12:00" },
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
        { id: 1, text: "Template A", tag: "Support" as const, start: "08:00", stop: "12:00" },
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
