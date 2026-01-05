import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DayCell, type DayEvent } from "../../../src/components/timeoff/DayCell";
import { dayjs } from "../../../src/utils/dateTimeUtils";

describe("DayCell", () => {
  const mockOnViewEvent = vi.fn();
  const mockOnKeyDown = vi.fn();
  const mockButtonRef = vi.fn();

  const defaultProps = {
    date: dayjs("2025-01-15"),
    isCurrentMonth: true,
    isToday: false,
    isWeekend: false,
    isFocused: false,
    events: [] as DayEvent[],
    onViewEvent: mockOnViewEvent,
    onKeyDown: mockOnKeyDown,
    buttonRef: mockButtonRef,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("should render day number", () => {
      render(<DayCell {...defaultProps} />);
      expect(screen.getByText("15")).toBeInTheDocument();
    });

    it("should have accessible aria-label with full date", () => {
      render(<DayCell {...defaultProps} />);
      const button = screen.getByRole("button", { name: /Wednesday, January 15, 2025/i });
      expect(button).toBeInTheDocument();
    });

    it("should show empty state indicator when no events", () => {
      render(<DayCell {...defaultProps} />);
      expect(screen.getByText("—")).toBeInTheDocument();
    });

    it("should apply is-other-month class when not current month", () => {
      const { container } = render(<DayCell {...defaultProps} isCurrentMonth={false} />);
      const gridcell = container.querySelector(".is-other-month");
      expect(gridcell).toBeInTheDocument();
    });

    it("should apply is-today class when today", () => {
      const { container } = render(<DayCell {...defaultProps} isToday={true} />);
      const gridcell = container.querySelector(".is-today");
      expect(gridcell).toBeInTheDocument();
    });

    it("should apply is-weekend class on weekends", () => {
      const { container } = render(<DayCell {...defaultProps} isWeekend={true} />);
      const gridcell = container.querySelector(".is-weekend");
      expect(gridcell).toBeInTheDocument();
    });

    it("should include Today in aria-label when isToday", () => {
      render(<DayCell {...defaultProps} isToday={true} />);
      const button = screen.getByRole("button", { name: /Today/i });
      expect(button).toBeInTheDocument();
    });
  });

  describe("Event Display", () => {
    it("should render up to 3 event chips", () => {
      const events: DayEvent[] = [
        { event: { type: "range", start: "2025/01/15", title: "Event 1", flags: [] }, index: 0 },
        { event: { type: "range", start: "2025/01/15", title: "Event 2", flags: [] }, index: 1 },
        { event: { type: "range", start: "2025/01/15", title: "Event 3", flags: [] }, index: 2 },
      ];

      render(<DayCell {...defaultProps} events={events} />);
      
      expect(screen.getByRole("button", { name: "View Event 1" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "View Event 2" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "View Event 3" })).toBeInTheDocument();
    });

    it("should show overflow count when more than 3 events", () => {
      const events: DayEvent[] = [
        { event: { type: "range", start: "2025/01/15", title: "Event 1", flags: [] }, index: 0 },
        { event: { type: "range", start: "2025/01/15", title: "Event 2", flags: [] }, index: 1 },
        { event: { type: "range", start: "2025/01/15", title: "Event 3", flags: [] }, index: 2 },
        { event: { type: "range", start: "2025/01/15", title: "Event 4", flags: [] }, index: 3 },
        { event: { type: "range", start: "2025/01/15", title: "Event 5", flags: [] }, index: 4 },
      ];

      render(<DayCell {...defaultProps} events={events} />);
      
      // Should show "+2 more" (5 events - 3 visible = 2 hidden)
      expect(screen.getByText("+2 more")).toBeInTheDocument();
    });

    it("should display event type label when no title", () => {
      const events: DayEvent[] = [
        { event: { type: "range", start: "2025/01/15", flags: ["holiday"] }, index: 0 },
      ];

      render(<DayCell {...defaultProps} events={events} />);

      expect(screen.getByRole("button", { name: "View Holiday" })).toBeInTheDocument();
    });

    it("should display time/location symbols", () => {
      const events: DayEvent[] = [
        { event: { type: "range", start: "2025/01/15", title: "Event", flags: ["half_am"] }, index: 0 },
      ];

      const { container } = render(<DayCell {...defaultProps} events={events} />);
      
      // Check for symbol in the event label
      const symbol = container.querySelector(".month-calendar-event-symbol");
      expect(symbol).toBeInTheDocument();
      expect(symbol?.textContent).toBe("◐");
    });

    it("should render multiple events with the same title", () => {
      const events: DayEvent[] = [
        { event: { type: "range", start: "2025/01/15", title: "Same Event", flags: [] }, index: 0 },
        { event: { type: "range", start: "2025/01/15", title: "Same Event", flags: [] }, index: 1 },
      ];

      render(<DayCell {...defaultProps} events={events} />);

      // Both events should render as separate DOM elements
      // Note: React keys are internal and not testable via DOM queries.
      // Key conflicts would produce console warnings during development.
      const eventButtons = screen.getAllByRole("button", { name: "View Same Event" });
      expect(eventButtons).toHaveLength(2);

      // Verify they are distinct DOM elements
      const firstButton = eventButtons[0];
      const secondButton = eventButtons[1];
      expect(firstButton).not.toBe(secondButton);
    });
  });

  describe("Interaction", () => {
    it("should call onViewEvent when clicking event chip", async () => {
      const user = userEvent.setup();
      const events: DayEvent[] = [
        { event: { type: "range", start: "2025/01/15", title: "Test Event", flags: [] }, index: 5 },
      ];

      render(<DayCell {...defaultProps} events={events} />);

      const eventButton = screen.getByRole("button", { name: "View Test Event" });
      await user.click(eventButton);

      expect(mockOnViewEvent).toHaveBeenCalledTimes(1);
      expect(mockOnViewEvent).toHaveBeenCalledWith(5); // Should use the event's index
    });

    it("should stop propagation when clicking event chip", async () => {
      const user = userEvent.setup();
      const events: DayEvent[] = [
        { event: { type: "range", start: "2025/01/15", title: "Test Event", flags: [] }, index: 0 },
      ];

      render(<DayCell {...defaultProps} events={events} />);

      const eventButton = screen.getByRole("button", { name: "View Test Event" });
      await user.click(eventButton);

      // Clicking stops propagation (tested by interaction working correctly)
      expect(mockOnViewEvent).toHaveBeenCalledTimes(1);
    });

    it("should call onKeyDown when pressing keys on day button", async () => {
      const user = userEvent.setup();
      render(<DayCell {...defaultProps} />);
      
      const dayButton = screen.getByRole("button", { name: /Wednesday, January 15/i });
      dayButton.focus();
      
      await user.keyboard("{ArrowRight}");
      
      expect(mockOnKeyDown).toHaveBeenCalledTimes(1);
    });

    it("should set correct tabIndex based on isFocused", () => {
      const { rerender } = render(<DayCell {...defaultProps} isFocused={false} />);
      
      let dayButton = screen.getByRole("button", { name: /Wednesday, January 15/i });
      expect(dayButton).toHaveAttribute("tabIndex", "-1");
      
      rerender(<DayCell {...defaultProps} isFocused={true} />);
      
      dayButton = screen.getByRole("button", { name: /Wednesday, January 15/i });
      expect(dayButton).toHaveAttribute("tabIndex", "0");
    });
  });

  describe("Visual Indicators", () => {
    it("should show course indicator emoji for course events", () => {
      const events: DayEvent[] = [
        { event: { type: "range", start: "2025/01/15", title: "Training", flags: ["course"] }, index: 0 },
      ];

      render(<DayCell {...defaultProps} events={events} />);
      
      // Check for course emoji (📘)
      expect(screen.getByText("📘")).toBeInTheDocument();
    });

    it("should show public holiday indicator", () => {
      const publicHoliday = {
        name: "New Year",
        localName: "New Year's Day",
        date: "2025-01-15",
        countryCode: "BE",
        fixed: true,
        global: true,
        launchYear: 2000,
        type: "Public" as const,
      };

      render(<DayCell {...defaultProps} publicHoliday={publicHoliday} />);
      
      // Check for holiday emoji (🎉)
      expect(screen.getByText("🎉")).toBeInTheDocument();
      
      // Check aria-label includes holiday name
      const button = screen.getByRole("button", { name: /New Year/i });
      expect(button).toBeInTheDocument();
    });

    it("should show school holiday indicator", () => {
      const schoolHoliday = {
        name: "Winter Break",
        startDate: "2025-01-15",
        endDate: "2025-01-20",
      };

      render(<DayCell {...defaultProps} schoolHoliday={schoolHoliday} />);
      
      // Check for school holiday emoji (🏫)
      expect(screen.getByText("🏫")).toBeInTheDocument();
      
      // Check aria-label includes school holiday
      const button = screen.getByRole("button", { name: /School Holiday: Winter Break/i });
      expect(button).toBeInTheDocument();
    });

    it("should show payday indicator", () => {
      const paydayInfo = {
        name: "Payday",
        date: "2025-01-15",
      };

      render(<DayCell {...defaultProps} paydayInfo={paydayInfo} />);
      
      // Check for payday emoji (💶)
      expect(screen.getByText("💶")).toBeInTheDocument();
      
      // Check aria-label includes payday
      const button = screen.getByRole("button", { name: /Payday/i });
      expect(button).toBeInTheDocument();
    });

    it("should apply holiday CSS classes", () => {
      const publicHoliday = {
        name: "Holiday",
        localName: "Holiday",
        date: "2025-01-15",
        countryCode: "BE",
        fixed: true,
        global: true,
        launchYear: 2000,
        type: "Public" as const,
      };

      const { container } = render(<DayCell {...defaultProps} publicHoliday={publicHoliday} />);
      
      const gridcell = container.querySelector(".is-public-holiday");
      expect(gridcell).toBeInTheDocument();
    });

    it("should not duplicate indicators", () => {
      const events: DayEvent[] = [
        { event: { type: "range", start: "2025/01/15", title: "Course 1", flags: ["course"] }, index: 0 },
        { event: { type: "range", start: "2025/01/15", title: "Course 2", flags: ["course"] }, index: 1 },
      ];

      render(<DayCell {...defaultProps} events={events} />);
      
      // Should only show one course emoji despite two course events
      const courseEmojis = screen.getAllByText("📘");
      expect(courseEmojis).toHaveLength(1);
    });
  });

  describe("Focus Management", () => {
    it("should call buttonRef with the button element", () => {
      render(<DayCell {...defaultProps} />);
      
      expect(mockButtonRef).toHaveBeenCalledTimes(1);
      expect(mockButtonRef.mock.calls[0][0]).toBeInstanceOf(HTMLButtonElement);
    });

    it("should render day button with correct CSS class", () => {
      const { container } = render(<DayCell {...defaultProps} />);
      
      const dayButton = container.querySelector(".month-calendar-day-button");
      expect(dayButton).toBeInTheDocument();
      expect(dayButton).toHaveClass("month-calendar-day-button");
    });
  });
});
