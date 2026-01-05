import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MonthCalendar } from "../../../src/components/timeoff/MonthCalendar";
import { dayjs } from "../../../src/utils/dateTimeUtils";
import type { HdayEvent } from "../../../src/lib/hday/types";

describe("MonthCalendar", () => {
  const mockOnMonthChange = vi.fn();
  const mockOnAddEvent = vi.fn();
  const mockOnViewEvent = vi.fn();

  const defaultProps = {
    events: [] as HdayEvent[],
    month: dayjs("2025-01-15"),
    onMonthChange: mockOnMonthChange,
    onAddEvent: mockOnAddEvent,
    onViewEvent: mockOnViewEvent,
  };

  beforeEach(() => {
    vi.clearAllMocks();
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
      expect(screen.getByRole("button", { name: "Jump to current month" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next month" })).toBeInTheDocument();
    });

    it("should have semantic calendar structure", () => {
      render(<MonthCalendar {...defaultProps} />);
      const calendar = screen.getByLabelText("Month calendar");
      expect(calendar).toBeInTheDocument();
      expect(calendar).toHaveClass("month-calendar-grid");
    });

    it("should have aria-live on month title for screen readers", () => {
      render(<MonthCalendar {...defaultProps} />);
      const title = screen.getByTestId("month-title");
      expect(title).toHaveAttribute("aria-live", "polite");
    });
  });

  describe("Month Navigation", () => {
    it("should call onMonthChange when clicking previous month", async () => {
      const user = userEvent.setup();
      render(<MonthCalendar {...defaultProps} />);
      
      await user.click(screen.getByRole("button", { name: "Previous month" }));
      
      expect(mockOnMonthChange).toHaveBeenCalledTimes(1);
      const calledMonth = mockOnMonthChange.mock.calls[0][0];
      expect(calledMonth.format("YYYY-MM")).toBe("2024-12");
    });

    it("should call onMonthChange when clicking next month", async () => {
      const user = userEvent.setup();
      render(<MonthCalendar {...defaultProps} />);
      
      await user.click(screen.getByRole("button", { name: "Next month" }));
      
      expect(mockOnMonthChange).toHaveBeenCalledTimes(1);
      const calledMonth = mockOnMonthChange.mock.calls[0][0];
      expect(calledMonth.format("YYYY-MM")).toBe("2025-02");
    });

    it("should call onMonthChange with current month when clicking Today", async () => {
      const user = userEvent.setup();
      render(<MonthCalendar {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: "Jump to current month" }));

      expect(mockOnMonthChange).toHaveBeenCalledTimes(1);
      const calledMonth = mockOnMonthChange.mock.calls[0][0];
      expect(calledMonth.format("YYYY-MM")).toBe(dayjs().format("YYYY-MM"));
    });
  });

  describe("Event Rendering", () => {
    it("should render range events on correct days", () => {
      const events: HdayEvent[] = [
        {
          type: "range",
          start: "2025/01/15",
          end: "2025/01/17",
          title: "Test vacation",
          flags: [],
        },
      ];

      render(<MonthCalendar {...defaultProps} events={events} />);
      
      // Event should appear on all three days (15, 16, 17)
      const eventButtons = screen.getAllByRole("button", { name: /View Test vacation/i });
      expect(eventButtons.length).toBe(3);
    });

    it("should render weekly recurring events", () => {
      const events: HdayEvent[] = [
        {
          type: "weekly",
          weekday: 1, // Monday
          title: "Weekly meeting",
          flags: [],
        },
      ];

      render(<MonthCalendar {...defaultProps} events={events} />);

      // Should appear on all Mondays in the visible calendar
      // Jan 2025 grid shows: Dec 30 (Mon), Jan 6, 13, 20, 27 (Mon) = 5 Mondays total
      const eventButtons = screen.getAllByRole("button", { name: /View Weekly meeting/i });
      expect(eventButtons.length).toBe(5);
    });

    it("should show event type label when no title provided", () => {
      const events: HdayEvent[] = [
        {
          type: "range",
          start: "2025/01/15",
          flags: ["holiday"],
        },
      ];

      render(<MonthCalendar {...defaultProps} events={events} />);

      expect(screen.getByRole("button", { name: /View Holiday/i })).toBeInTheDocument();
    });

    it("should handle long-range events efficiently (performance optimization)", () => {
      // Create an event spanning multiple years
      const events: HdayEvent[] = [
        {
          type: "range",
          start: "2020/01/01",
          end: "2030/12/31",
          title: "Long event",
          flags: [],
        },
      ];

      // Should render without hanging or errors
      render(<MonthCalendar {...defaultProps} events={events} />);

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
      const events: HdayEvent[] = [
        {
          type: "range",
          start: "2025/01/15",
          title: "Test vacation",
          flags: [],
        },
      ];

      render(<MonthCalendar {...defaultProps} events={events} />);

      const eventButton = screen.getAllByRole("button", { name: /View Test vacation/i })[0];
      await user.click(eventButton);

      expect(mockOnViewEvent).toHaveBeenCalledTimes(1);
      expect(mockOnViewEvent).toHaveBeenCalledWith(0); // First event, index 0
    });
  });

  describe("Keyboard Navigation", () => {
    it("should handle arrow key navigation between days", async () => {
      const user = userEvent.setup();
      render(<MonthCalendar {...defaultProps} />);
      
      // Find and focus a day button
      const dayButtons = screen.getAllByRole("button");
      const targetButton = dayButtons.find((btn) => 
        btn.getAttribute("aria-label")?.includes("Wednesday, January 15")
      );
      
      expect(targetButton).toBeDefined();
      targetButton!.focus();
      expect(targetButton).toHaveFocus();
      
      // Press ArrowRight
      await user.keyboard("{ArrowRight}");
      
      // Focus should move to next day
      const nextButton = dayButtons.find((btn) => 
        btn.getAttribute("aria-label")?.includes("Thursday, January 16")
      );
      expect(nextButton).toBeDefined();
      expect(nextButton).toHaveFocus();
    });

    it("should navigate to next month when pressing arrow beyond month boundary", async () => {
      const user = userEvent.setup();
      render(<MonthCalendar {...defaultProps} />);
      
      // Find last day of January (31st)
      const dayButtons = screen.getAllByRole("button");
      const lastDayButton = dayButtons.find((btn) => 
        btn.getAttribute("aria-label")?.includes("Friday, January 31, 2025")
      );
      
      expect(lastDayButton).toBeDefined();
      lastDayButton!.focus();
      
      // Press ArrowRight to move to next month
      await user.keyboard("{ArrowRight}");
      
      // Should call onMonthChange
      expect(mockOnMonthChange).toHaveBeenCalled();
    });

    it("should handle Home key to jump to first day of month", async () => {
      const user = userEvent.setup();
      render(<MonthCalendar {...defaultProps} />);

      // Navigate to January 15 using arrow keys
      // Initial focus is on January 1, so press ArrowRight 14 times to reach January 15
      for (let i = 0; i < 14; i++) {
        await user.keyboard("{ArrowRight}");
      }

      // Verify we're on January 15
      const dayButtons = screen.getAllByRole("button");
      const jan15Button = dayButtons.find((btn) =>
        btn.getAttribute("aria-label")?.includes("Wednesday, January 15, 2025")
      );
      expect(jan15Button).toBeDefined();
      expect(jan15Button).toHaveFocus();

      // Press Home
      await user.keyboard("{Home}");

      // Focus should move to first day of month (January 1)
      const firstDayButton = dayButtons.find((btn) =>
        btn.getAttribute("aria-label")?.includes("Wednesday, January 1, 2025")
      );
      expect(firstDayButton).toBeDefined();
      expect(firstDayButton).toHaveFocus();
    });

    it("should handle End key to jump to last day of month", async () => {
      const user = userEvent.setup();
      render(<MonthCalendar {...defaultProps} />);
      
      // Focus any day button
      const dayButtons = screen.getAllByRole("button");
      const someButton = dayButtons.find((btn) => 
        btn.getAttribute("aria-label")?.includes("January 15")
      );
      
      expect(someButton).toBeDefined();
      someButton!.focus();
      
      // Press End
      await user.keyboard("{End}");
      
      // Focus should move to last day of month
      const lastDayButton = dayButtons.find((btn) => 
        btn.getAttribute("aria-label")?.includes("Friday, January 31, 2025")
      );
      expect(lastDayButton).toBeDefined();
      expect(lastDayButton).toHaveFocus();
    });
  });

  describe("Holiday Indicators", () => {
    it("should display public holiday indicators", () => {
      const publicHolidays = new Map([
        ["2025/01/15", { 
          name: "Test Holiday",
          localName: "Test Holiday Local",
          date: "2025-01-15",
          countryCode: "BE",
          fixed: true,
          global: true,
          launchYear: 2000,
          type: "Public",
        }],
      ]);

      render(<MonthCalendar {...defaultProps} publicHolidays={publicHolidays} />);
      
      // Should show holiday emoji in the day cell
      const dayButtons = screen.getAllByRole("button");
      const holidayButton = dayButtons.find((btn) => 
        btn.getAttribute("aria-label")?.includes("Test Holiday")
      );
      expect(holidayButton).toBeDefined();
    });

    it("should display payday indicators", () => {
      const paydayMap = new Map([
        ["2025/01/15", { 
          name: "Payday",
          date: "2025-01-15",
        }],
      ]);

      render(<MonthCalendar {...defaultProps} paydayMap={paydayMap} />);
      
      const dayButtons = screen.getAllByRole("button");
      const paydayButton = dayButtons.find((btn) => 
        btn.getAttribute("aria-label")?.includes("Payday")
      );
      expect(paydayButton).toBeDefined();
    });
  });
});
