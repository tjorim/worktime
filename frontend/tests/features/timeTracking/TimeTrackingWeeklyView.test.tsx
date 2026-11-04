import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { TimeTrackingWeeklyView } from "@/features/timeTracking/TimeTrackingWeeklyView";
import { SettingsProvider } from "@/contexts/SettingsContext";
import type { StoredTimeTrackingTask } from "@/lib/timeTracking/types";

describe("TimeTrackingWeeklyView Component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-10T23:00:00Z"));
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

  /** The detail blocks start collapsed; most tests look inside them, so open them all. */
  const expandDetails = () => {
    for (const trigger of document.querySelectorAll<HTMLElement>(
      '[data-slot="accordion-trigger"][aria-expanded="false"]',
    )) {
      fireEvent.click(trigger);
    }
  };

  const renderCollapsedPanel = (
    extraProps: Partial<React.ComponentProps<typeof TimeTrackingWeeklyView>> = {},
  ) =>
    render(
      <SettingsProvider>
        <TimeTrackingWeeklyView {...defaultProps} {...extraProps} />
      </SettingsProvider>,
    );

  /** The footer row of the detailed table, keyed by its column header. */
  const footerTotals = () => {
    const headers = Array.from(document.querySelectorAll("thead th"), (cell) => cell.textContent);
    const cells = Array.from(document.querySelectorAll("tfoot tr > *"), (cell) => cell.textContent);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
  };

  const renderPanel = (
    extraProps: Partial<React.ComponentProps<typeof TimeTrackingWeeklyView>> = {},
  ) => {
    const result = renderCollapsedPanel(extraProps);
    expandDetails();
    return result;
  };

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

    it("shows the category and recent-weeks charts when the week has data", () => {
      const weekTasks = [createTaskForDate(mondayDate, "Support", "09:00", "12:00")];

      renderPanel({ tasks: weekTasks });

      expect(screen.getByRole("heading", { name: "Hours by Category" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Recent Weeks" })).toBeInTheDocument();
      expect(
        screen.getByRole("img", { name: /^Total hours worked in each of the last 8 weeks/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("img", { name: /^Hours worked each day over the last 8 weeks/ }),
      ).toBeInTheDocument();
    });

    it("does not show the charts when the week is empty", () => {
      renderPanel({ tasks: [] });

      expect(screen.queryByRole("heading", { name: "Hours by Category" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Recent Weeks" })).not.toBeInTheDocument();
    });

    it("aggregates hours by task category", () => {
      const weekTasks = [
        createTaskForDate(mondayDate, "Support", "09:00", "12:00"),
        createTaskForDate(mondayDate, "Meeting", "13:00", "15:00"),
      ];

      renderPanel({ tasks: weekTasks });

      expect(footerTotals()).toMatchObject({
        Support: "3.00",
        Meeting: "2.00",
        "Total Hours": "5.00",
      });
    });

    it("calculates cumulative week totals correctly", () => {
      const weekTasks = [
        createTaskForDate(mondayDate, "Support", "08:00", "12:00"),
        createTaskForDate(tuesdayDate, "Support", "08:00", "11:00"),
      ];

      renderPanel({ tasks: weekTasks });

      expect(footerTotals()["Total Hours"]).toBe("7.00");
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

      renderPanel({ tasks: [runningTask] });

      expect(footerTotals()["Total Hours"]).toBe("6.00");

      act(() => {
        vi.advanceTimersByTime(2 * 60 * 60 * 1000);
      });

      expect(footerTotals()["Total Hours"]).toBe("8.00");
    });

    it("applies 30-minute break deduction in weekly totals", () => {
      const weekTasks = [createTaskForDate(mondayDate, "Support", "09:00", "17:00", true)];

      renderPanel({ tasks: weekTasks });

      expect(footerTotals()).toMatchObject({ Support: "7.50", "Total Hours": "7.50" });
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
      expect(screen.getByText(/No target this week:/)).toBeInTheDocument();
      expect(screen.queryByText(/4\.0h \/ 0\.0h/)).not.toBeInTheDocument();
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

      expect(footerTotals()["Total Hours"]).toBe("3.50");
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

      const dailyTotalCells = container.querySelectorAll("td[class~='font-semibold']");
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
      vi.setSystemTime(new Date("2026-01-04T23:00:00Z"));
      const tasks = [createTaskForDate("2025-12-29", "Support", "09:00", "12:00")];

      renderPanel({ tasks, selectedDate: "2025-12-29" });

      expect(screen.getByText(/Week 1 \(2026\)/)).toBeInTheDocument();
    });

    it("groups tasks correctly when ISO week spans two calendar years", () => {
      vi.setSystemTime(new Date("2026-01-04T23:00:00Z"));
      const tasks = [
        createTaskForDate("2025-12-29", "Support", "09:00", "12:00"),
        createTaskForDate("2025-12-31", "Meeting", "14:00", "16:00"),
        createTaskForDate("2026-01-02", "Support", "09:00", "11:00"),
      ];

      renderPanel({ tasks, selectedDate: "2025-12-29" });

      expect(footerTotals()).toMatchObject({ Support: "5.00", Meeting: "2.00" });
    });
  });

  describe("folded detail", () => {
    const mondayTask = () => [createTaskForDate("2025-01-06", "Support", "09:00", "12:00")];

    it("keeps the detail collapsed so each total is shown once by default", () => {
      renderCollapsedPanel({ tasks: mondayTask(), weeklyTargetHours: 40 });

      expect(screen.getByRole("heading", { name: "Category Breakdown" })).toBeInTheDocument();
      expect(screen.getByText("Hours at a Glance")).toBeInTheDocument();
      for (const name of [
        "Recent Weeks",
        "Daily Breakdown",
        "Detailed Breakdown",
        "Hours by Category",
      ]) {
        expect(screen.getByRole("button", { name })).toHaveAttribute("aria-expanded", "false");
      }
      expect(document.querySelector("table")).not.toBeInTheDocument();
      expect(document.querySelector(".progress-ring")).not.toBeInTheDocument();
      expect(screen.queryByText("Weekly Summary")).not.toBeInTheDocument();
    });

    it("reveals the day-by-day table with its totals on demand", () => {
      renderCollapsedPanel({ tasks: mondayTask() });

      fireEvent.click(screen.getByRole("button", { name: "Detailed Breakdown" }));

      expect(document.querySelector("table")).toBeInTheDocument();
      expect(footerTotals()).toMatchObject({ Support: "3.00", "Total Hours": "3.00" });
    });

    it("states the week total once when a target shows it in the progress bar", () => {
      renderCollapsedPanel({ tasks: mondayTask(), weeklyTargetHours: 40 });

      expect(screen.getByText(/3\.0h \/ 40\.0h/)).toBeInTheDocument();
      expect(screen.queryByText("Total Hours")).not.toBeInTheDocument();
    });

    it("keeps the total tile when there is no target to show it against", () => {
      renderCollapsedPanel({ tasks: mondayTask() });

      expect(screen.getByText("Total Hours")).toBeInTheDocument();
    });
  });

  describe("Layout and Styling", () => {
    it("applies responsive table wrapper", () => {
      const weekTasks = [createTaskForDate("2025-01-06", "Support", "09:00", "12:00")];

      const { container } = renderPanel({ tasks: weekTasks });

      const responsiveWrapper = container.querySelector("[data-slot=table-container]");
      expect(responsiveWrapper).toBeInTheDocument();
      expect(responsiveWrapper?.querySelector("table")).toBeInTheDocument();
    });

    it("renders the owned table with row separators", () => {
      const weekTasks = [createTaskForDate("2025-01-06", "Support", "09:00", "12:00")];

      const { container } = renderPanel({ tasks: weekTasks });

      const table = container.querySelector("table");
      expect(table).toHaveAttribute("data-slot", "table");
      expect(table?.querySelector("tbody tr")).toHaveClass("border-b");
    });
  });

  describe("runtime styling", () => {
    it("draws each day ring from a clamped percentage variable", () => {
      const weekTasks = [createTaskForDate("2025-01-06", "Support", "09:00", "17:00")];

      renderPanel({ tasks: weekTasks, weeklyTargetHours: 40, weeklyWorkingDays: 5 });

      const rings = Array.from(document.querySelectorAll<HTMLElement>(".progress-ring"));
      const monday = rings[0]!;
      expect(monday.style.getPropertyValue("--ring-pct")).toBe("100%");
      expect(monday).toHaveAttribute("data-complete", "true");
      expect(rings[1]!.style.getPropertyValue("--ring-pct")).toBe("0%");
      expect(rings[1]).toHaveAttribute("data-complete", "false");
    });

    it("only offers the copy cursor on cells that hold a value", () => {
      const weekTasks = [createTaskForDate("2025-01-06", "Support", "09:00", "12:00")];

      const { container } = renderPanel({ tasks: weekTasks });

      const cells = Array.from(container.querySelectorAll("tbody tr:first-child td"));
      const filled = cells.filter((cell) => cell.textContent !== "-");
      const empty = cells.filter((cell) => cell.textContent === "-");
      expect(filled.length).toBeGreaterThan(0);
      filled.forEach((cell) => expect(cell).toHaveClass("cursor-copy"));
      empty.forEach((cell) => expect(cell).not.toHaveClass("cursor-copy"));
    });

    it("tints each category with its label colour", () => {
      const weekTasks = [createTaskForDate("2025-01-06", "Support", "09:00", "12:00")];

      const { container } = renderPanel({ tasks: weekTasks });

      const tinted = container.querySelector<HTMLElement>("[style*='--label-bg']");
      expect(tinted?.style.getPropertyValue("--label-bg")).toBe("#c82333");
    });
  });
});
