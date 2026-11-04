import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MonthCalendar } from "@/components/calendar/MonthCalendar";
import { createTimeOffEntry } from "@/lib/timeOff/codecs";
import { dayjs } from "@/utils/dateTimeUtils";
import type { TimeOffEntry } from "@/lib/timeOff/types";

describe("MonthCalendar", () => {
  const mockOnMonthChange = vi.fn();
  const mockOnAddEvent = vi.fn();
  const mockOnViewEvent = vi.fn();
  const mockOnEditEvent = vi.fn();
  let entryCounter = 0;
  const createDateEntry = (
    overrides: {
      date?: string;
      note?: string | null;
      entryType?:
        | "vacation"
        | "business"
        | "course"
        | "in"
        | "weekend"
        | "birthday"
        | "ill"
        | "other";
    } = {},
  ): TimeOffEntry =>
    createTimeOffEntry({
      id: `entry-${entryCounter++}`,
      entryKind: "date",
      date: overrides.date ?? "2025-01-15",
      note: overrides.note ?? null,
      entryFlag: "full_day",
      entryType: overrides.entryType ?? "vacation",
    });
  const createRangeEntry = (
    overrides: {
      start?: string;
      end?: string;
      note?: string | null;
      entryType?:
        | "vacation"
        | "business"
        | "course"
        | "in"
        | "weekend"
        | "birthday"
        | "ill"
        | "other";
    } = {},
  ): TimeOffEntry =>
    createTimeOffEntry({
      id: `entry-${entryCounter++}`,
      entryKind: "range",
      start: overrides.start ?? "2025-01-15",
      end: overrides.end ?? "2025-01-17",
      note: overrides.note ?? null,
      entryFlag: "full_day",
      entryType: overrides.entryType ?? "vacation",
    });
  const createWeeklyEntry = (
    overrides: {
      weekday?: number;
      note?: string | null;
      entryType?:
        | "vacation"
        | "business"
        | "course"
        | "in"
        | "weekend"
        | "birthday"
        | "ill"
        | "other";
    } = {},
  ): TimeOffEntry =>
    createTimeOffEntry({
      id: `entry-${entryCounter++}`,
      entryKind: "weekly",
      weekday: overrides.weekday ?? 1,
      note: overrides.note ?? null,
      entryFlag: "full_day",
      entryType: overrides.entryType ?? "vacation",
    });

  const defaultProps = {
    entries: [] as TimeOffEntry[],
    month: dayjs("2025-01-15"),
    onMonthChange: mockOnMonthChange,
    onAddEvent: mockOnAddEvent,
    onViewEvent: mockOnViewEvent,
    onEditEvent: mockOnEditEvent,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    entryCounter = 0;
  });

  describe("Rendering", () => {
    it("should render month and year title", () => {
      render(<MonthCalendar {...defaultProps} />);
      expect(screen.getByText("January 2025")).toBeInTheDocument();
    });

    it("should render all weekday headers", () => {
      render(<MonthCalendar {...defaultProps} />);
      expect(screen.getByText("Mon")).toBeInTheDocument();
      expect(screen.getByText("Tue")).toBeInTheDocument();
      expect(screen.getByText("Wed")).toBeInTheDocument();
      expect(screen.getByText("Thu")).toBeInTheDocument();
      expect(screen.getByText("Fri")).toBeInTheDocument();
      expect(screen.getByText("Sat")).toBeInTheDocument();
      expect(screen.getByText("Sun")).toBeInTheDocument();
    });

    it("should render navigation buttons", () => {
      render(<MonthCalendar {...defaultProps} />);
      expect(screen.getByRole("button", { name: "Previous month" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "This Month" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next month" })).toBeInTheDocument();
    });

    it("should have semantic calendar structure", () => {
      render(<MonthCalendar {...defaultProps} />);
      const calendar = screen.getByRole("grid", { name: "Calendar for January 2025" });
      expect(calendar).toBeInTheDocument();
      expect(calendar).toHaveClass("month-calendar-grid");
    });

    it("should have aria-live on month title for screen readers", () => {
      render(<MonthCalendar {...defaultProps} />);
      const title = screen.getByTestId("month-title");
      expect(title).toHaveAttribute("aria-live", "polite");
    });
  });

  describe("Keyboard grid navigation (#1699)", () => {
    // January 2025 starts on Wednesday, so the grid is Mon 30 Dec .. Sun 9 Feb (6 rows).
    const renderGrid = (props = {}) => {
      render(<MonthCalendar {...defaultProps} {...props} />);
      return screen.getAllByRole("gridcell");
    };
    const onlyTabStop = (cells: HTMLElement[]) => cells.filter((cell) => cell.tabIndex === 0);

    it("moves a week with ArrowDown and ArrowUp and a day with ArrowLeft and ArrowRight", async () => {
      const user = userEvent.setup();
      const cells = renderGrid();
      cells[10]!.focus();
      await user.keyboard("{ArrowDown}");
      expect(cells[17]).toHaveFocus();
      await user.keyboard("{ArrowUp}{ArrowRight}");
      expect(cells[11]).toHaveFocus();
      await user.keyboard("{ArrowLeft}");
      expect(cells[10]).toHaveFocus();
      expect(onlyTabStop(cells)).toEqual([cells[10]]);
    });

    it("starts from the clicked day, not from the remembered one", async () => {
      const user = userEvent.setup();
      const cells = renderGrid();
      await user.click(cells[20]!);
      await user.keyboard("{ArrowUp}");
      expect(cells[13]).toHaveFocus();
    });

    it("goes to the start and end of the week with Home and End, and the grid with Ctrl", async () => {
      const user = userEvent.setup();
      const cells = renderGrid();
      cells[10]!.focus();
      await user.keyboard("{Home}");
      expect(cells[7]).toHaveFocus();
      await user.keyboard("{End}");
      expect(cells[13]).toHaveFocus();
      await user.keyboard("{Control>}{End}{/Control}");
      expect(cells[cells.length - 1]).toHaveFocus();
      await user.keyboard("{Control>}{Home}{/Control}");
      expect(cells[0]).toHaveFocus();
    });

    it("stays on the edge and still consumes the key so the page does not scroll", async () => {
      const user = userEvent.setup();
      const outer = vi.fn();
      const cells = renderGrid();
      cells[2]!.focus();
      document.addEventListener("keydown", outer);
      await user.keyboard("{ArrowUp}");
      document.removeEventListener("keydown", outer);
      expect(cells[2]).toHaveFocus();
      expect(outer.mock.calls[0]![0].defaultPrevented).toBe(true);
      cells[cells.length - 2]!.focus();
      await user.keyboard("{ArrowDown}");
      expect(cells[cells.length - 2]).toHaveFocus();
    });

    it("changes month with PageDown and PageUp and keeps focus on the same day of the month", async () => {
      const user = userEvent.setup();
      const onMonthChange = vi.fn();
      const props = { onMonthChange };
      const january = dayjs("2025-01-15");
      const { rerender } = render(<MonthCalendar {...defaultProps} {...props} month={january} />);
      const cells = screen.getAllByRole("gridcell");
      cells[16]!.focus(); // Wed 15 Jan
      await user.keyboard("{PageDown}");
      expect(onMonthChange).toHaveBeenCalledTimes(1);
      expect(onMonthChange.mock.calls[0]![0].format("YYYY-MM")).toBe("2025-02");
      rerender(
        <MonthCalendar {...defaultProps} {...props} month={onMonthChange.mock.calls[0]![0]} />,
      );
      const focused = document.activeElement as HTMLElement;
      expect(focused).toHaveAttribute("role", "gridcell");
      expect(focused).toHaveTextContent(/February 15, 2025/);
      expect(screen.getAllByRole("gridcell").filter((c) => c.tabIndex === 0)).toEqual([focused]);
      await user.keyboard("{PageUp}");
      expect(onMonthChange.mock.calls[1]![0].format("YYYY-MM")).toBe("2025-01");
    });

    it("does not pull focus into the grid when the month changes with the mouse", async () => {
      const user = userEvent.setup();
      const onMonthChange = vi.fn();
      const { rerender } = render(
        <MonthCalendar {...defaultProps} onMonthChange={onMonthChange} />,
      );
      const next = screen.getByRole("button", { name: "Next month" });
      await user.click(next);
      rerender(
        <MonthCalendar
          {...defaultProps}
          onMonthChange={onMonthChange}
          month={dayjs("2025-02-15")}
        />,
      );
      expect(next).toHaveFocus();
    });

    it("lets Enter on an event open the event, not the day menu, and navigates from there", async () => {
      const user = userEvent.setup();
      const entry = createDateEntry({ note: "Test vacation" });
      const cells = renderGrid({ entries: [entry] });
      const event = screen.getByRole("button", { name: /View Test vacation/i });
      event.focus();
      await user.keyboard("{Enter}");
      expect(mockOnViewEvent).toHaveBeenCalledWith(entry.id);
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      const index = cells.findIndex((cell) => cell.contains(event));
      await user.keyboard("{ArrowDown}");
      expect(cells[index + 7]).toHaveFocus();
    });

    it("opens the day menu with Enter on the cell", async () => {
      const user = userEvent.setup();
      const cells = renderGrid();
      cells[10]!.focus();
      await user.keyboard("{Enter}");
      expect(screen.getByRole("menu")).toBeInTheDocument();
    });

    it("describes the keyboard model on the grid", () => {
      renderGrid();
      expect(screen.getByRole("grid")).toHaveAccessibleDescription(/arrow keys move between days/i);
    });
  });

  describe("Month Navigation", () => {
    it("should call onMonthChange when clicking previous month", async () => {
      const user = userEvent.setup();
      render(<MonthCalendar {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: "Previous month" }));

      expect(mockOnMonthChange).toHaveBeenCalledTimes(1);
      const calledMonth = mockOnMonthChange.mock.calls[0]![0];
      expect(calledMonth.format("YYYY-MM")).toBe("2024-12");
    });

    it("should call onMonthChange when clicking next month", async () => {
      const user = userEvent.setup();
      render(<MonthCalendar {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: "Next month" }));

      expect(mockOnMonthChange).toHaveBeenCalledTimes(1);
      const calledMonth = mockOnMonthChange.mock.calls[0]![0];
      expect(calledMonth.format("YYYY-MM")).toBe("2025-02");
    });

    it("should call onMonthChange with current month when clicking Today", async () => {
      const user = userEvent.setup();
      render(<MonthCalendar {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: "This Month" }));

      expect(mockOnMonthChange).toHaveBeenCalledTimes(1);
      const calledMonth = mockOnMonthChange.mock.calls[0]![0];
      expect(calledMonth.format("YYYY-MM")).toBe(dayjs().format("YYYY-MM"));
    });
  });

  describe("Event Rendering", () => {
    it("should render range events on correct days", () => {
      const entries = [createRangeEntry({ note: "Test vacation" })];

      render(<MonthCalendar {...defaultProps} entries={entries} />);

      // Event should appear on all three days (15, 16, 17)
      const eventButtons = screen.getAllByRole("button", { name: /View Test vacation/i });
      expect(eventButtons.length).toBe(3);
    });

    it("should render weekly recurring events", () => {
      const entries = [createWeeklyEntry({ weekday: 1, note: "Weekly meeting" })];

      render(<MonthCalendar {...defaultProps} entries={entries} />);

      // Should appear on all Mondays in the visible calendar
      // Jan 2025 grid shows: Dec 30 (Mon), Jan 6, 13, 20, 27 (Mon) = 5 Mondays total
      const eventButtons = screen.getAllByRole("button", { name: /View Weekly meeting/i });
      expect(eventButtons.length).toBe(5);
    });

    it("should show event type label when no title provided", () => {
      const entries = [createDateEntry({ note: null, entryType: "vacation" })];

      render(<MonthCalendar {...defaultProps} entries={entries} />);

      expect(screen.getByRole("button", { name: /View Holiday/i })).toBeInTheDocument();
    });

    it("should handle long-range events efficiently (performance optimization)", () => {
      // Create an event spanning multiple years
      const entries = [
        createRangeEntry({ start: "2020-01-01", end: "2030-12-31", note: "Long event" }),
      ];

      // Should render without hanging or errors
      render(<MonthCalendar {...defaultProps} entries={entries} />);

      // Event should only appear on days visible in January 2025
      const eventButtons = screen.getAllByRole("button", { name: /View Long event/i });
      // Should be limited to days in the visible calendar grid (including a few days from Dec/Feb)
      // January has 31 days, but grid includes some Dec/Feb days, typically 35-42 total cells
      expect(eventButtons.length).toBeGreaterThan(30);
      expect(eventButtons.length).toBeLessThanOrEqual(42);
    });
  });

  describe("Event Interaction", () => {
    it("should call onViewEvent when clicking event chip", async () => {
      const user = userEvent.setup();
      const entry = createDateEntry({ note: "Test vacation" });

      render(<MonthCalendar {...defaultProps} entries={[entry]} />);

      const eventButton = screen.getAllByRole("button", { name: /View Test vacation/i })[0];
      await user.click(eventButton!);

      expect(mockOnViewEvent).toHaveBeenCalledTimes(1);
      expect(mockOnViewEvent).toHaveBeenCalledWith(entry.id);
    });
  });

  describe("Holiday Indicators", () => {
    it("should display public holiday indicators", () => {
      const publicHolidays = new Map([
        [
          "2025-01-15",
          {
            name: "Test Holiday",
            localName: "Test Holiday Local",
          },
        ],
      ]);

      render(<MonthCalendar {...defaultProps} publicHolidays={publicHolidays} />);

      // Holiday indicators are decorative; holiday name is exposed via gridcell accessible description
      const holidayCell = screen.getByRole("gridcell", { description: /Test Holiday/i });
      expect(holidayCell).toBeInTheDocument();
    });

    it("should display payday indicators", () => {
      const paydayMap = new Map([
        [
          "2025-01-15",
          {
            name: "Payday",
            date: "2025-01-15",
          },
        ],
      ]);

      render(<MonthCalendar {...defaultProps} paydayMap={paydayMap} />);

      // Payday indicators are decorative; payday name is exposed via gridcell accessible description
      const paydayCell = screen.getByRole("gridcell", { description: /Payday/i });
      expect(paydayCell).toBeInTheDocument();
    });
  });
});
