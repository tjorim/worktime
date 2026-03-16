import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { TimeTrackingWeeklyView } from "../../../src/components/timeTracking/TimeTrackingWeeklyView";
import { SettingsProvider } from "../../../src/contexts/SettingsContext";
import type { StoredTimeTrackingTask } from "../../../src/components/timeTracking/types";

describe("TimeTrackingWeeklyView Component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-06T00:00:00Z"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  const createTaskForDate = (
    date: string,
    label: string,
    startTime: string,
    endTime: string,
    includesBreak = false,
  ): StoredTimeTrackingTask => ({
    id: `${date}-${label}-${Math.random()}`,
    text: `${label} work`,
    label,
    startTime: `${date}T${startTime}`,
    stopTime: `${date}T${endTime}`,
    includesBreak: includesBreak ? true : undefined,
  });

  const TEST_LABELS = [
    { id: "Development", name: "Development", color: "#198754" },
    { id: "Support", name: "Support", color: "#c82333" },
    { id: "Meeting", name: "Meeting", color: "#6f42c1" },
  ];

  const defaultProps = {
    tasks: [],
    labels: TEST_LABELS,
    selectedDate: "2025-01-06",
    onSelectedDateChange: vi.fn(),
  };

  const renderPanel = (
    extraProps: Partial<React.ComponentProps<typeof TimeTrackingWeeklyView>> = {},
  ) =>
    render(
      <SettingsProvider>
        <TimeTrackingWeeklyView {...defaultProps} {...extraProps} />
      </SettingsProvider>,
    );

  describe("Empty State Handling", () => {
    it("shows informative message when week has no data", () => {
      renderPanel();

      expect(screen.getByText(/No Time Tracking Data Yet/i)).toBeInTheDocument();
      expect(screen.getByText(/Start tracking your time in the Daily Log/i)).toBeInTheDocument();
    });

    it("shows call-to-action button in empty state when callback provided", () => {
      renderPanel({ onSwitchToDaily: vi.fn() });

      const ctaButton = screen.getByRole("button", { name: /Go to Daily Log/i });
      expect(ctaButton).toBeInTheDocument();
    });

    it("hides CTA button when no callback provided", () => {
      renderPanel();

      const ctaButton = screen.queryByRole("button", { name: /Go to Daily Log/i });
      expect(ctaButton).not.toBeInTheDocument();
    });

    it("hides summary table when no tasks exist", () => {
      const { container } = renderPanel({ tasks: [] });

      const dataTable = container.querySelector("table");
      expect(dataTable).not.toBeInTheDocument();
    });
  });

  describe("Data Presentation", () => {
    const mondayDate = "2025-01-06";
    const tuesdayDate = "2025-01-07";

    it("renders table structure when tasks are present", () => {
      const weekTasks = [createTaskForDate(mondayDate, "Support", "09:00", "12:00")];

      const { container } = renderPanel({ tasks: weekTasks });

      const dataTable = container.querySelector("table");
      expect(dataTable).toBeInTheDocument();
    });

    it("displays weekday labels in table rows", () => {
      const weekTasks = [createTaskForDate(mondayDate, "Support", "09:00", "12:00")];

      renderPanel({ tasks: weekTasks });

      expect(screen.getByText("Monday")).toBeInTheDocument();
      expect(screen.getByText("Tuesday")).toBeInTheDocument();
      expect(screen.getByText("Wednesday")).toBeInTheDocument();
    });

    it("aggregates hours by task category", () => {
      const weekTasks = [
        createTaskForDate(mondayDate, "Support", "09:00", "12:00"),
        createTaskForDate(mondayDate, "Meeting", "13:00", "15:00"),
      ];

      renderPanel({ tasks: weekTasks });

      const summarySection = screen.getByText(/Weekly Summary/i).parentElement;
      expect(summarySection).toHaveTextContent("Support: 3.00 hours");
      expect(summarySection).toHaveTextContent("Meeting: 2.00 hours");
    });

    it("calculates cumulative week totals correctly", () => {
      const weekTasks = [
        createTaskForDate(mondayDate, "Support", "08:00", "12:00"),
        createTaskForDate(tuesdayDate, "Support", "08:00", "11:00"),
      ];

      renderPanel({ tasks: weekTasks });

      // Check the weekly summary section shows correct total
      const totalElements = screen.getAllByText(/7\.00 hours/i);
      expect(totalElements.length).toBeGreaterThan(0);
    });

    it("refreshes weekly totals for running tasks", () => {
      vi.setSystemTime(new Date("2025-01-06T15:00:00Z"));

      const runningTask: StoredTimeTrackingTask = {
        id: "running-task",
        text: "Support work",
        label: "Support",
        // Derive startTime from fake Date.now() so the 6-hour gap is
        // timezone-independent (avoids UTC vs. local mismatch).
        startTime: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
        stopTime: null,
      };

      const { container } = renderPanel({ tasks: [runningTask] });

      expect(container.textContent).toContain("6.00 hours");

      act(() => {
        vi.advanceTimersByTime(2 * 60 * 60 * 1000);
      });

      expect(container.textContent).toContain("8.00 hours");
    });

    it("applies 30-minute break deduction in weekly totals", () => {
      const weekTasks = [createTaskForDate(mondayDate, "Support", "09:00", "17:00", true)];

      renderPanel({ tasks: weekTasks });

      const summarySection = screen.getByText(/Weekly Summary/i).parentElement;
      expect(summarySection).toHaveTextContent("Support: 7.50 hours");
      const deductedTotals = screen.getAllByText(/7\.50 hours/i);
      expect(deductedTotals).toHaveLength(2);
    });

    it("shows weekly progress when weeklyTargetHours is provided", () => {
      const weekTasks = [createTaskForDate(mondayDate, "Support", "08:00", "12:00")];

      renderPanel({ tasks: weekTasks, weeklyTargetHours: 40 });

      expect(screen.getByText(/Weekly Progress/i)).toBeInTheDocument();
      expect(screen.getByText(/4\.0h \/ 40\.0h/i)).toBeInTheDocument();
      expect(screen.getByText(/36\.0h remaining/i)).toBeInTheDocument();
    });

    it("handles zero weekly target without NaN percentages", () => {
      const weekTasks = [createTaskForDate(mondayDate, "Support", "08:00", "12:00")];

      const { container } = renderPanel({
        tasks: weekTasks,
        weeklyTargetHours: 0,
        weeklyWorkingDays: 5,
      });

      expect(container.textContent).not.toContain("NaN");
      expect(screen.getByLabelText(/Monday: 4\.0 hours, 0% of daily target/i)).toBeInTheDocument();
    });

    it("uses singular hour in weekly chart aria text for exactly one hour", () => {
      const weekTasks = [createTaskForDate(mondayDate, "Support", "08:00", "09:00")];

      renderPanel({ tasks: weekTasks, weeklyTargetHours: 40 });

      expect(screen.getByLabelText(/Monday: 1\.0 hour, 13% of daily target/i)).toBeInTheDocument();
    });

    it("includes all labels in work hour totals", () => {
      const weekTasks = [
        createTaskForDate(mondayDate, "Support", "09:00", "12:00"),
        createTaskForDate(mondayDate, "Break", "12:00", "12:30"),
      ];

      renderPanel({ tasks: weekTasks });

      // Check the weekly summary section shows correct total
      expect(screen.getByText(/3\.50 hours/i)).toBeInTheDocument();
    });

    it("displays key metrics cards", () => {
      const weekTasks = [
        createTaskForDate(mondayDate, "Support", "09:00", "12:00"),
        createTaskForDate(tuesdayDate, "Development", "09:00", "11:00"),
      ];

      renderPanel({ tasks: weekTasks });

      // Use getAllByText for items that appear multiple times
      const totalHoursElements = screen.getAllByText(/Total Hours/i);
      expect(totalHoursElements.length).toBeGreaterThan(0);
      expect(screen.getByText(/Avg\. Daily Hours/i)).toBeInTheDocument();
      expect(screen.getByText(/Days Tracked/i)).toBeInTheDocument();
      expect(screen.getByText(/Top Category/i)).toBeInTheDocument();
    });

    it("shows daily breakdown chart", () => {
      const weekTasks = [createTaskForDate(mondayDate, "Support", "09:00", "12:00")];

      renderPanel({ tasks: weekTasks });

      expect(screen.getByText(/Daily Breakdown/i)).toBeInTheDocument();
    });

    it("shows category breakdown with percentages", () => {
      const weekTasks = [
        createTaskForDate(mondayDate, "Support", "09:00", "12:00"),
        createTaskForDate(mondayDate, "Development", "13:00", "17:00"),
      ];

      renderPanel({ tasks: weekTasks });

      expect(screen.getByText(/Category Breakdown/i)).toBeInTheDocument();
    });
  });

  describe("Table Structure and Accessibility", () => {
    const mondayDate = "2025-01-06";

    it("uses semantic table headers with scope attributes", () => {
      const weekTasks = [createTaskForDate(mondayDate, "Support", "09:00", "12:00")];

      const { container } = renderPanel({ tasks: weekTasks });

      const headers = container.querySelectorAll("th[scope='col']");
      expect(headers.length).toBeGreaterThan(0);
    });

    it("includes total hours column in table header", () => {
      const weekTasks = [createTaskForDate(mondayDate, "Support", "09:00", "12:00")];

      renderPanel({ tasks: weekTasks });

      expect(screen.getByRole("columnheader", { name: /Total Hours/i })).toBeInTheDocument();
    });

    it("displays daily totals with emphasis styling", () => {
      const weekTasks = [createTaskForDate(mondayDate, "Support", "09:00", "13:00")];

      const { container } = renderPanel({ tasks: weekTasks });

      const dailyTotalCells = container.querySelectorAll("td.fw-semibold");
      expect(dailyTotalCells.length).toBeGreaterThan(0);
    });

    it("formats hour values to two decimal places", () => {
      const weekTasks = [createTaskForDate(mondayDate, "Support", "09:00", "10:15")];

      const { container } = renderPanel({ tasks: weekTasks });

      expect(container.textContent).toContain("1.25");
    });
  });

  describe("Week Filtering Logic", () => {
    it("shows only tasks within selected week boundaries", () => {
      const week3Task = createTaskForDate("2025-01-13", "Support", "09:00", "12:00");
      const week4Task = createTaskForDate("2025-01-20", "Meeting", "14:00", "16:00");
      const mixedTasks = [week3Task, week4Task];

      renderPanel({ tasks: mixedTasks, selectedDate: "2025-01-06" });

      const noDataMsg = screen.queryByText(/No Time Tracking Data Yet/i);
      expect(noDataMsg).toBeInTheDocument();
    });
  });

  describe("ISO Week Year Boundary", () => {
    it("shows correct ISO week year when week 1 crosses into the previous calendar year", () => {
      // Dec 29, 2025 (Monday) is ISO week 1 of 2026
      vi.setSystemTime(new Date("2025-12-29T12:00:00Z"));
      const tasks = [createTaskForDate("2025-12-29", "Support", "09:00", "12:00")];

      renderPanel({ tasks, selectedDate: "2025-12-29" });

      expect(screen.getByText(/Week 1 \(2026\)/)).toBeInTheDocument();
    });

    it("groups tasks correctly when ISO week spans two calendar years", () => {
      vi.setSystemTime(new Date("2025-12-29T12:00:00Z"));
      const tasks = [
        createTaskForDate("2025-12-29", "Support", "09:00", "12:00"),
        createTaskForDate("2025-12-31", "Meeting", "14:00", "16:00"),
        createTaskForDate("2026-01-02", "Support", "09:00", "11:00"),
      ];

      renderPanel({ tasks, selectedDate: "2025-12-29" });

      const summarySection = screen.getByText(/Weekly Summary/i).parentElement;
      expect(summarySection).toHaveTextContent("Support: 5.00 hours");
      expect(summarySection).toHaveTextContent("Meeting: 2.00 hours");
    });
  });

  describe("Layout and Styling", () => {
    it("applies responsive table wrapper", () => {
      const weekTasks = [createTaskForDate("2025-01-06", "Support", "09:00", "12:00")];

      const { container } = renderPanel({ tasks: weekTasks });

      const responsiveWrapper = container.querySelector(".table-responsive");
      expect(responsiveWrapper).toBeInTheDocument();
      expect(responsiveWrapper?.querySelector("table")).toBeInTheDocument();
    });

    it("uses bordered table style for clarity", () => {
      const weekTasks = [createTaskForDate("2025-01-06", "Support", "09:00", "12:00")];

      const { container } = renderPanel({ tasks: weekTasks });

      const table = container.querySelector("table");
      expect(table).toHaveClass("table-bordered");
    });
  });
});
