import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import React from "react";
import { WeeklyOverviewPanel } from "../../../src/components/timeTracking/WeeklyOverviewPanel";
import type { StoredTimeTrackingTask } from "../../../src/components/timeTracking/types";
import type { TimeTrackingTag } from "../../../src/components/timeTracking/constants";

describe("WeeklyOverviewPanel Component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-06T00:00:00Z"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  const createTaskForDate = (
    date: string,
    tag: TimeTrackingTag,
    startTime: string,
    endTime: string,
  ): StoredTimeTrackingTask => ({
    id: `${date}-${tag}-${Math.random()}`,
    date,
    text: `${tag} work`,
    tag,
    start: startTime,
    stop: endTime,
  });

  describe("Week Selection Controls", () => {
    it("displays year and week number input controls", () => {
      render(<WeeklyOverviewPanel tasks={[]} />);

      const yearInput = screen.getByLabelText(/Year/i);
      const weekInput = screen.getByLabelText(/Week/i);

      expect(yearInput).toHaveAttribute("type", "number");
      expect(weekInput).toHaveAttribute("type", "number");
    });

    it("includes quick navigation to current week", () => {
      render(<WeeklyOverviewPanel tasks={[]} />);

      const thisWeekBtn = screen.getByRole("button", { name: /This Week/i });
      expect(thisWeekBtn).toBeInTheDocument();
    });

    it("enforces minimum and maximum year boundaries", () => {
      render(<WeeklyOverviewPanel tasks={[]} />);

      const yearInput = screen.getByLabelText(/Year/i);
      expect(yearInput).toHaveAttribute("min", "2000");
      expect(yearInput).toHaveAttribute("max", "2100");
    });

    it("constrains week number to valid ISO range", () => {
      render(<WeeklyOverviewPanel tasks={[]} />);

      const weekInput = screen.getByLabelText(/Week/i);
      expect(weekInput).toHaveAttribute("min", "1");
      expect(weekInput).toHaveAttribute("max", "53");
    });
  });

  describe("Empty State Handling", () => {
    it("shows informative message when week has no data", () => {
      render(<WeeklyOverviewPanel tasks={[]} />);

      expect(screen.getByText(/No data for this week/i)).toBeInTheDocument();
    });

    it("hides summary table when no tasks exist", () => {
      const { container } = render(<WeeklyOverviewPanel tasks={[]} />);

      const dataTable = container.querySelector("table");
      expect(dataTable).not.toBeInTheDocument();
    });
  });

  describe("Data Presentation", () => {
    const mondayDate = "2025-01-06"; // Known Monday for testing
    const tuesdayDate = "2025-01-07";

    it("renders table structure when tasks are present", () => {
      const weekTasks = [createTaskForDate(mondayDate, "Support", "09:00", "12:00")];

      const { container } = render(<WeeklyOverviewPanel tasks={weekTasks} />);

      const dataTable = container.querySelector("table");
      expect(dataTable).toBeInTheDocument();
    });

    it("displays weekday labels in table rows", () => {
      const weekTasks = [createTaskForDate(mondayDate, "Support", "09:00", "12:00")];

      render(<WeeklyOverviewPanel tasks={weekTasks} />);

      expect(screen.getByText("Monday")).toBeInTheDocument();
      expect(screen.getByText("Tuesday")).toBeInTheDocument();
      expect(screen.getByText("Wednesday")).toBeInTheDocument();
    });

    it("aggregates hours by task category", () => {
      const weekTasks = [
        createTaskForDate(mondayDate, "Support", "09:00", "12:00"), // 3h
        createTaskForDate(mondayDate, "Meeting", "13:00", "15:00"), // 2h
      ];

      render(<WeeklyOverviewPanel tasks={weekTasks} />);

      const summarySection = screen.getByText(/Weekly Summary/i).parentElement;
      expect(summarySection).toHaveTextContent("Support: 3.00 hours");
      expect(summarySection).toHaveTextContent("Meeting: 2.00 hours");
    });

    it("calculates cumulative week totals correctly", () => {
      const weekTasks = [
        createTaskForDate(mondayDate, "Support", "08:00", "12:00"), // 4h
        createTaskForDate(tuesdayDate, "Support", "08:00", "11:00"), // 3h
      ];

      render(<WeeklyOverviewPanel tasks={weekTasks} />);

      expect(screen.getByText(/Total for the week:.*7\.00.*\/ 40\.0 hours/i)).toBeInTheDocument();
    });

    it("excludes lunch category from work hour totals", () => {
      const weekTasks = [
        createTaskForDate(mondayDate, "Support", "09:00", "12:00"), // 3h
        createTaskForDate(mondayDate, "Lunch", "12:00", "12:30"), // 0.5h
      ];

      render(<WeeklyOverviewPanel tasks={weekTasks} />);

      // Total should be 3.00 (excluding lunch)
      expect(screen.getByText(/Total for the week:.*3\.00.*\/ 40\.0 hours/i)).toBeInTheDocument();
    });

    it("reports lunch hours separately when present", () => {
      const weekTasks = [
        createTaskForDate(mondayDate, "Support", "09:00", "12:00"),
        createTaskForDate(mondayDate, "Lunch", "12:00", "12:45"), // 0.75h
      ];

      render(<WeeklyOverviewPanel tasks={weekTasks} />);

      expect(screen.getByText(/Lunch:.*0\.75.*h/i)).toBeInTheDocument();
    });
  });

  describe("Table Structure and Accessibility", () => {
    const mondayDate = "2025-01-06";

    it("uses semantic table headers with scope attributes", () => {
      const weekTasks = [createTaskForDate(mondayDate, "Support", "09:00", "12:00")];

      const { container } = render(<WeeklyOverviewPanel tasks={weekTasks} />);

      const headers = container.querySelectorAll("th[scope='col']");
      expect(headers.length).toBeGreaterThan(0);
    });

    it("includes total hours column in table header", () => {
      const weekTasks = [createTaskForDate(mondayDate, "Support", "09:00", "12:00")];

      render(<WeeklyOverviewPanel tasks={weekTasks} />);

      expect(screen.getByRole("columnheader", { name: /Total Hours/i })).toBeInTheDocument();
    });

    it("displays daily totals with emphasis styling", () => {
      const weekTasks = [createTaskForDate(mondayDate, "Support", "09:00", "13:00")]; // 4h

      const { container } = render(<WeeklyOverviewPanel tasks={weekTasks} />);

      const dailyTotalCells = container.querySelectorAll("td.fw-semibold");
      expect(dailyTotalCells.length).toBeGreaterThan(0);
    });

    it("formats hour values to two decimal places", () => {
      const weekTasks = [createTaskForDate(mondayDate, "Support", "09:00", "10:15")]; // 1.25h

      const { container } = render(<WeeklyOverviewPanel tasks={weekTasks} />);

      expect(container.textContent).toContain("1.25");
    });
  });

  describe("User Interactions", () => {
    it("updates display when year selector changes", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<WeeklyOverviewPanel tasks={[]} />);

      const yearInput = screen.getByLabelText(/Year/i);
      await user.clear(yearInput);
      await user.type(yearInput, "2024");

      expect(yearInput).toHaveValue(2024);
    });

    it("updates display when week selector changes", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<WeeklyOverviewPanel tasks={[]} />);

      const weekInput = screen.getByLabelText(/Week/i);
      await user.clear(weekInput);
      await user.type(weekInput, "25");

      expect(weekInput).toHaveValue(25);
    });

    it("resets to current week when This Week button is clicked", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<WeeklyOverviewPanel tasks={[]} />);

      const yearInput = screen.getByLabelText(/Year/i);
      await user.clear(yearInput);
      await user.type(yearInput, "2020");

      const thisWeekBtn = screen.getByRole("button", { name: /This Week/i });
      await user.click(thisWeekBtn);

      // After clicking, year should be current year (not 2020)
      const currentYear = new Date().getFullYear();
      expect(screen.getByLabelText(/Year/i)).toHaveValue(currentYear);
    });
  });

  describe("Week Filtering Logic", () => {
    const mondayDate = "2025-01-06"; // Week 2 of 2025
    const nextWeekMonday = "2025-01-13"; // Week 3 of 2025

    it("shows only tasks within selected week boundaries", () => {
      // Use dates from week 3 and week 4 (not current week 2)
      const week3Task = createTaskForDate("2025-01-13", "Support", "09:00", "12:00"); // Week 3
      const week4Task = createTaskForDate("2025-01-20", "Meeting", "14:00", "16:00"); // Week 4
      const mixedTasks = [week3Task, week4Task];

      // Component defaults to current week (week 2 of 2025 due to fake timers)
      // Since we only have tasks for weeks 3 and 4, current week should show empty state
      render(<WeeklyOverviewPanel tasks={mixedTasks} />);

      // Should show empty state for current week (week 2)
      const noDataMsg = screen.queryByText(/No data for this week/i);
      expect(noDataMsg).toBeInTheDocument();
    });
  });

  describe("Layout and Styling", () => {
    it("applies responsive table wrapper", () => {
      const weekTasks = [createTaskForDate("2025-01-06", "Support", "09:00", "12:00")];

      const { container } = render(<WeeklyOverviewPanel tasks={weekTasks} />);

      const responsiveWrapper = container.querySelector(".table-responsive");
      expect(responsiveWrapper).toBeInTheDocument();
      expect(responsiveWrapper?.querySelector("table")).toBeInTheDocument();
    });

    it("uses bordered table style for clarity", () => {
      const weekTasks = [createTaskForDate("2025-01-06", "Support", "09:00", "12:00")];

      const { container } = render(<WeeklyOverviewPanel tasks={weekTasks} />);

      const table = container.querySelector("table");
      expect(table).toHaveClass("table-bordered");
    });

    it("organizes controls with flex layout and spacing", () => {
      const { container } = render(<WeeklyOverviewPanel tasks={[]} />);

      const controlsContainer = container.querySelector(".d-flex");
      expect(controlsContainer).toHaveClass("flex-wrap", "gap-3");
    });
  });
});
