import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import React from "react";
import { TimeTrackingWeeklyView } from "../../../src/components/timeTracking/TimeTrackingWeeklyView";
import type { StoredTimeTrackingTask } from "../../../src/components/timeTracking/types";

describe("TimeTrackingWeeklyView Component", () => {
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
    label: string,
    startTime: string,
    endTime: string,
  ): StoredTimeTrackingTask => ({
    id: `${date}-${label}-${Math.random()}`,
    text: `${label} work`,
    label,
    startTime: `${date}T${startTime}`,
    stopTime: `${date}T${endTime}`,
  });

  const renderPanel = (tasks: StoredTimeTrackingTask[], selectedDate = "2025-01-06") =>
    render(<TimeTrackingWeeklyView tasks={tasks} selectedDate={selectedDate} />);

  describe("Empty State Handling", () => {
    it("shows informative message when week has no data", () => {
      renderPanel([]);

      expect(screen.getByText(/No data for this week/i)).toBeInTheDocument();
    });

    it("hides summary table when no tasks exist", () => {
      const { container } = renderPanel([]);

      const dataTable = container.querySelector("table");
      expect(dataTable).not.toBeInTheDocument();
    });
  });

  describe("Data Presentation", () => {
    const mondayDate = "2025-01-06";
    const tuesdayDate = "2025-01-07";

    it("renders table structure when tasks are present", () => {
      const weekTasks = [createTaskForDate(mondayDate, "Support", "09:00", "12:00")];

      const { container } = renderPanel(weekTasks);

      const dataTable = container.querySelector("table");
      expect(dataTable).toBeInTheDocument();
    });

    it("displays weekday labels in table rows", () => {
      const weekTasks = [createTaskForDate(mondayDate, "Support", "09:00", "12:00")];

      renderPanel(weekTasks);

      expect(screen.getByText("Monday")).toBeInTheDocument();
      expect(screen.getByText("Tuesday")).toBeInTheDocument();
      expect(screen.getByText("Wednesday")).toBeInTheDocument();
    });

    it("aggregates hours by task category", () => {
      const weekTasks = [
        createTaskForDate(mondayDate, "Support", "09:00", "12:00"),
        createTaskForDate(mondayDate, "Meeting", "13:00", "15:00"),
      ];

      renderPanel(weekTasks);

      const summarySection = screen.getByText(/Weekly Summary/i).parentElement;
      expect(summarySection).toHaveTextContent("Support: 3.00 hours");
      expect(summarySection).toHaveTextContent("Meeting: 2.00 hours");
    });

    it("calculates cumulative week totals correctly", () => {
      const weekTasks = [
        createTaskForDate(mondayDate, "Support", "08:00", "12:00"),
        createTaskForDate(tuesdayDate, "Support", "08:00", "11:00"),
      ];

      renderPanel(weekTasks);

      expect(screen.getByText(/Total for the week:.*7\.00.*hours/i)).toBeInTheDocument();
    });

    it("shows target when weeklyTargetHours is provided", () => {
      const weekTasks = [createTaskForDate(mondayDate, "Support", "08:00", "12:00")];

      render(
        <TimeTrackingWeeklyView
          tasks={weekTasks}
          selectedDate="2025-01-06"
          weeklyTargetHours={40}
        />,
      );

      expect(screen.getByText(/Total for the week:.*4\.00.*\/ 40\.0 hours/i)).toBeInTheDocument();
    });

    it("excludes lunch category from work hour totals", () => {
      const weekTasks = [
        createTaskForDate(mondayDate, "Support", "09:00", "12:00"),
        createTaskForDate(mondayDate, "Lunch", "12:00", "12:30"),
      ];

      renderPanel(weekTasks);

      expect(screen.getByText(/Total for the week:.*3\.00.*hours/i)).toBeInTheDocument();
    });

    it("reports lunch hours separately when present", () => {
      const weekTasks = [
        createTaskForDate(mondayDate, "Support", "09:00", "12:00"),
        createTaskForDate(mondayDate, "Lunch", "12:00", "12:45"),
      ];

      renderPanel(weekTasks);

      expect(screen.getByText(/Lunch:.*0\.75.*h$/i)).toBeInTheDocument();
    });
  });

  describe("Table Structure and Accessibility", () => {
    const mondayDate = "2025-01-06";

    it("uses semantic table headers with scope attributes", () => {
      const weekTasks = [createTaskForDate(mondayDate, "Support", "09:00", "12:00")];

      const { container } = renderPanel(weekTasks);

      const headers = container.querySelectorAll("th[scope='col']");
      expect(headers.length).toBeGreaterThan(0);
    });

    it("includes total hours column in table header", () => {
      const weekTasks = [createTaskForDate(mondayDate, "Support", "09:00", "12:00")];

      renderPanel(weekTasks);

      expect(screen.getByRole("columnheader", { name: /Total Hours/i })).toBeInTheDocument();
    });

    it("displays daily totals with emphasis styling", () => {
      const weekTasks = [createTaskForDate(mondayDate, "Support", "09:00", "13:00")];

      const { container } = renderPanel(weekTasks);

      const dailyTotalCells = container.querySelectorAll("td.fw-semibold");
      expect(dailyTotalCells.length).toBeGreaterThan(0);
    });

    it("formats hour values to two decimal places", () => {
      const weekTasks = [createTaskForDate(mondayDate, "Support", "09:00", "10:15")];

      const { container } = renderPanel(weekTasks);

      expect(container.textContent).toContain("1.25");
    });
  });

  describe("Week Filtering Logic", () => {
    it("shows only tasks within selected week boundaries", () => {
      const week3Task = createTaskForDate("2025-01-13", "Support", "09:00", "12:00");
      const week4Task = createTaskForDate("2025-01-20", "Meeting", "14:00", "16:00");
      const mixedTasks = [week3Task, week4Task];

      renderPanel(mixedTasks, "2025-01-06");

      const noDataMsg = screen.queryByText(/No data for this week/i);
      expect(noDataMsg).toBeInTheDocument();
    });
  });

  describe("ISO Week Year Boundary", () => {
    it("shows correct ISO week year when week 1 crosses into the previous calendar year", () => {
      // Dec 29, 2025 (Monday) is ISO week 1 of 2026
      vi.setSystemTime(new Date("2025-12-29T12:00:00Z"));
      const tasks = [createTaskForDate("2025-12-29", "Support", "09:00", "12:00")];

      renderPanel(tasks, "2025-12-29");

      expect(screen.getByText(/Week 1 \(2026\)/)).toBeInTheDocument();
    });

    it("groups tasks correctly when ISO week spans two calendar years", () => {
      vi.setSystemTime(new Date("2025-12-29T12:00:00Z"));
      const tasks = [
        createTaskForDate("2025-12-29", "Support", "09:00", "12:00"),
        createTaskForDate("2025-12-31", "Meeting", "14:00", "16:00"),
        createTaskForDate("2026-01-02", "Support", "09:00", "11:00"),
      ];

      renderPanel(tasks, "2025-12-29");

      const summarySection = screen.getByText(/Weekly Summary/i).parentElement;
      expect(summarySection).toHaveTextContent("Support: 5.00 hours");
      expect(summarySection).toHaveTextContent("Meeting: 2.00 hours");
    });
  });

  describe("Layout and Styling", () => {
    it("applies responsive table wrapper", () => {
      const weekTasks = [createTaskForDate("2025-01-06", "Support", "09:00", "12:00")];

      const { container } = renderPanel(weekTasks);

      const responsiveWrapper = container.querySelector(".table-responsive");
      expect(responsiveWrapper).toBeInTheDocument();
      expect(responsiveWrapper?.querySelector("table")).toBeInTheDocument();
    });

    it("uses bordered table style for clarity", () => {
      const weekTasks = [createTaskForDate("2025-01-06", "Support", "09:00", "12:00")];

      const { container } = renderPanel(weekTasks);

      const table = container.querySelector("table");
      expect(table).toHaveClass("table-bordered");
    });
  });
});
