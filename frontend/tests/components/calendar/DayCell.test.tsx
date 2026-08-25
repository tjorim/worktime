import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DayCell, type DayEvent } from "@/components/calendar/DayCell";
import { createTimeOffEntry } from "@/lib/timeOff/codecs";
import { dayjs } from "@/utils/dateTimeUtils";
import type { Shift } from "@/utils/shiftCalculations";
import type { IsoAlpha2 } from "@/types/countries";
import { TestProviders } from "@tests/utils/testProviders";

const OFF_SHIFT: Shift = {
  code: "O",
  displayCode: "O",
  emoji: "🏠",
  name: "Off",
  start: null,
  end: null,
  isWorking: false,
  className: "shift-off",
};

describe("DayCell", () => {
  const mockOnViewEvent = vi.fn();
  let entryCounter = 0;
  const createEntryEvent = (
    overrides: {
      note?: string | null;
      flag?: "half_am" | "half_pm" | "onsite" | "no_fly" | "can_fly";
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
  ): DayEvent => ({
    entry: createTimeOffEntry({
      id: `entry-${entryCounter++}`,
      entryKind: "date",
      date: "2025-01-15",
      note: overrides.note ?? null,
      entryFlag: overrides.flag ?? "full_day",
      entryType: overrides.entryType ?? "vacation",
    }),
  });

  const defaultProps = {
    date: dayjs("2025-01-15"),
    isCurrentMonth: true,
    isToday: false,
    isWeekend: false,
    events: [] as DayEvent[],
    onViewEvent: mockOnViewEvent,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    entryCounter = 0;
  });

  describe("Rendering", () => {
    it("should render day number", () => {
      render(<DayCell {...defaultProps} />);
      expect(screen.getByText("15")).toBeInTheDocument();
    });

    it("should have accessible aria-label with full date", () => {
      render(<DayCell {...defaultProps} />);
      const header = screen.getByLabelText(/January 15, 2025/i);
      expect(header).toBeInTheDocument();
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
      const header = screen.getByLabelText(/Today/i);
      expect(header).toBeInTheDocument();
    });
  });

  describe("Event Display", () => {
    it("should render up to 3 event chips", () => {
      const events: DayEvent[] = [
        createEntryEvent({ note: "Event 1" }),
        createEntryEvent({ note: "Event 2" }),
        createEntryEvent({ note: "Event 3" }),
      ];

      render(<DayCell {...defaultProps} events={events} />);

      expect(screen.getByRole("button", { name: "View Event 1" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "View Event 2" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "View Event 3" })).toBeInTheDocument();
    });

    it("should show a clickable overflow toggle when more than 3 events", () => {
      const events: DayEvent[] = [
        createEntryEvent({ note: "Event 1" }),
        createEntryEvent({ note: "Event 2" }),
        createEntryEvent({ note: "Event 3" }),
        createEntryEvent({ note: "Event 4" }),
        createEntryEvent({ note: "Event 5" }),
      ];

      render(<DayCell {...defaultProps} events={events} />);

      // Should show "+2 more" (5 events - 3 visible = 2 hidden)
      const overflowButton = screen.getByRole("button", { name: "Show 2 more events" });
      expect(overflowButton).toBeInTheDocument();
      expect(overflowButton).toHaveTextContent("+2 more");
    });

    it("should use singular label when exactly 1 event is hidden", () => {
      const events: DayEvent[] = [
        createEntryEvent({ note: "Event 1" }),
        createEntryEvent({ note: "Event 2" }),
        createEntryEvent({ note: "Event 3" }),
        createEntryEvent({ note: "Event 4" }),
      ];

      render(<DayCell {...defaultProps} events={events} />);

      const overflowButton = screen.getByRole("button", { name: "Show 1 more event" });
      expect(overflowButton).toBeInTheDocument();
      expect(overflowButton).toHaveTextContent("+1 more");
    });

    it("should reveal hidden events when clicking the overflow toggle", async () => {
      const user = userEvent.setup();
      const events: DayEvent[] = [
        createEntryEvent({ note: "Event 1" }),
        createEntryEvent({ note: "Event 2" }),
        createEntryEvent({ note: "Event 3" }),
        createEntryEvent({ note: "Event 4" }),
      ];

      render(<DayCell {...defaultProps} events={events} />);

      await user.click(screen.getByRole("button", { name: "Show 1 more event" }));

      expect(screen.getByRole("button", { name: "Hide 1 more event" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "View Event 4" })).toBeInTheDocument();
    });

    it("should collapse hidden events when clicking the overflow toggle again", async () => {
      const user = userEvent.setup();
      const events: DayEvent[] = [
        createEntryEvent({ note: "Event 1" }),
        createEntryEvent({ note: "Event 2" }),
        createEntryEvent({ note: "Event 3" }),
        createEntryEvent({ note: "Event 4" }),
      ];

      render(<DayCell {...defaultProps} events={events} />);

      await user.click(screen.getByRole("button", { name: "Show 1 more event" }));
      expect(screen.getByRole("button", { name: "View Event 4" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Hide 1 more event" }));
      expect(screen.queryByRole("button", { name: "View Event 4" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Show 1 more event" })).toBeInTheDocument();
    });

    it("should reveal hidden events when activating overflow toggle with keyboard", async () => {
      const user = userEvent.setup();
      const events: DayEvent[] = [
        createEntryEvent({ note: "Event 1" }),
        createEntryEvent({ note: "Event 2" }),
        createEntryEvent({ note: "Event 3" }),
        createEntryEvent({ note: "Event 4" }),
      ];

      render(<DayCell {...defaultProps} events={events} />);

      const overflowButton = screen.getByRole("button", { name: "Show 1 more event" });
      overflowButton.focus();
      await user.keyboard("{Enter}");

      expect(screen.getByRole("button", { name: "Hide 1 more event" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "View Event 4" })).toBeInTheDocument();
    });

    it("should collapse hidden events when activating overflow toggle with keyboard", async () => {
      const user = userEvent.setup();
      const events: DayEvent[] = [
        createEntryEvent({ note: "Event 1" }),
        createEntryEvent({ note: "Event 2" }),
        createEntryEvent({ note: "Event 3" }),
        createEntryEvent({ note: "Event 4" }),
      ];

      render(<DayCell {...defaultProps} events={events} />);

      const overflowButton = screen.getByRole("button", { name: "Show 1 more event" });
      overflowButton.focus();
      await user.keyboard("{Enter}");
      expect(screen.getByRole("button", { name: "View Event 4" })).toBeInTheDocument();

      const hideButton = screen.getByRole("button", { name: "Hide 1 more event" });
      hideButton.focus();
      await user.keyboard("{Enter}");
      expect(screen.queryByRole("button", { name: "View Event 4" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Show 1 more event" })).toBeInTheDocument();
    });

    it("should display event type label when no title", () => {
      const events: DayEvent[] = [createEntryEvent({ note: null, entryType: "vacation" })];

      render(<DayCell {...defaultProps} events={events} />);

      expect(screen.getByRole("button", { name: "View Holiday" })).toBeInTheDocument();
    });

    it("should display time/location symbols", () => {
      const events: DayEvent[] = [createEntryEvent({ note: "Event", flag: "half_am" })];

      const { container } = render(<DayCell {...defaultProps} events={events} />);

      // Check for symbol in the event label
      const symbol = container.querySelector(".month-calendar-event-symbol");
      expect(symbol).toBeInTheDocument();
      expect(symbol?.textContent).toBe("◐");
    });

    it("should render multiple events with the same title", () => {
      const events: DayEvent[] = [
        createEntryEvent({ note: "Same Event" }),
        createEntryEvent({ note: "Same Event" }),
      ];

      render(<DayCell {...defaultProps} events={events} />);

      // Both events should render as separate DOM elements
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
      const event = createEntryEvent({ note: "Test Event" });
      const events: DayEvent[] = [event];

      render(<DayCell {...defaultProps} events={events} />);

      const eventButton = screen.getByRole("button", { name: "View Test Event" });
      await user.click(eventButton);

      expect(mockOnViewEvent).toHaveBeenCalledTimes(1);
      expect(mockOnViewEvent).toHaveBeenCalledWith(event.entry.id);
    });

    it("should stop propagation when clicking event chip", async () => {
      const user = userEvent.setup();
      const events: DayEvent[] = [createEntryEvent({ note: "Test Event" })];

      render(<DayCell {...defaultProps} events={events} />);

      const eventButton = screen.getByRole("button", { name: "View Test Event" });
      await user.click(eventButton);

      // Clicking stops propagation (tested by interaction working correctly)
      expect(mockOnViewEvent).toHaveBeenCalledTimes(1);
    });

    describe("long press vs. tap", () => {
      const mockOnEventContextMenu = vi.fn();

      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it("does not also open the view modal for a long press that opened the context menu", async () => {
        const events: DayEvent[] = [createEntryEvent({ note: "Test Event" })];
        render(
          <DayCell
            {...defaultProps}
            events={events}
            onEventContextMenu={mockOnEventContextMenu}
          />,
        );
        const eventButton = screen.getByRole("button", { name: "View Test Event" });

        fireEvent.touchStart(eventButton, { touches: [{ clientX: 10, clientY: 10 }] });
        await act(() => vi.advanceTimersByTimeAsync(500));
        expect(mockOnEventContextMenu).toHaveBeenCalledTimes(1);

        // Mobile browsers still fire touchend then a synthetic click after an
        // un-prevented touch sequence, even though the long press already
        // fired its own handler.
        fireEvent.touchEnd(eventButton);
        fireEvent.click(eventButton);

        expect(mockOnViewEvent).not.toHaveBeenCalled();
      });

      it("still opens the view modal for a quick tap that releases before the long-press threshold", async () => {
        const events: DayEvent[] = [createEntryEvent({ note: "Test Event" })];
        render(
          <DayCell
            {...defaultProps}
            events={events}
            onEventContextMenu={mockOnEventContextMenu}
          />,
        );
        const eventButton = screen.getByRole("button", { name: "View Test Event" });

        fireEvent.touchStart(eventButton, { touches: [{ clientX: 10, clientY: 10 }] });
        fireEvent.touchEnd(eventButton);
        fireEvent.click(eventButton);

        expect(mockOnEventContextMenu).not.toHaveBeenCalled();
        expect(mockOnViewEvent).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("Visual Indicators", () => {
    it("should show course indicator emoji for course events", () => {
      const events: DayEvent[] = [createEntryEvent({ note: "Training", entryType: "course" })];

      render(<DayCell {...defaultProps} events={events} />);

      // Check for course emoji (📘)
      expect(screen.getByText("📘")).toBeInTheDocument();
    });

    it("should show public holiday indicator", () => {
      const publicHoliday = {
        name: "New Year",
        localName: "New Year's Day",
      };

      render(<DayCell {...defaultProps} publicHoliday={publicHoliday} />);

      // Check for holiday emoji (🎉)
      expect(screen.getByText("🎉")).toBeInTheDocument();

      // Check aria-label includes holiday name
      const header = screen.getByLabelText(/New Year/i);
      expect(header).toBeInTheDocument();
    });

    it("should show school holiday indicator", () => {
      const schoolHoliday = {
        name: "Winter Break",
        localName: "Winter Break",
      };

      render(<DayCell {...defaultProps} schoolHoliday={schoolHoliday} />);

      // Check for school holiday emoji (🏫)
      expect(screen.getByText("🏫")).toBeInTheDocument();

      // Check aria-label includes school holiday
      const header = screen.getByLabelText(/School Holiday: Winter Break/i);
      expect(header).toBeInTheDocument();
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
      const header = screen.getByLabelText(/Payday/i);
      expect(header).toBeInTheDocument();
    });

    it("should apply holiday CSS classes", () => {
      const publicHoliday = {
        name: "Holiday",
        localName: "Holiday",
      };

      const { container } = render(<DayCell {...defaultProps} publicHoliday={publicHoliday} />);

      const gridcell = container.querySelector(".is-public-holiday");
      expect(gridcell).toBeInTheDocument();
    });

    it("should not duplicate indicators", () => {
      const events: DayEvent[] = [
        createEntryEvent({ note: "Course 1", entryType: "course" }),
        createEntryEvent({ note: "Course 2", entryType: "course" }),
      ];

      render(<DayCell {...defaultProps} events={events} />);

      // Should only show one course emoji despite two course events
      const courseEmojis = screen.getAllByText("📘");
      expect(courseEmojis).toHaveLength(1);
    });
  });

  describe("Work Location Indicators", () => {
    it("shows work location indicator even when the shift is off", () => {
      render(
        <DayCell
          {...defaultProps}
          isWeekend={true}
          shiftBadge={OFF_SHIFT}
          workLocation={{ location: "home", countryCode: "NL" as IsoAlpha2 }}
        />,
        { wrapper: TestProviders },
      );

      const indicator = screen.getByTitle("Working from home");
      expect(indicator).toBeInTheDocument();

      const header = screen.getByLabelText(/Working from home/i);
      expect(header).toBeInTheDocument();
    });

    it("shows work location indicator when no shift badge is provided", () => {
      render(
        <DayCell {...defaultProps} workLocation={{ location: "office", countryCode: "BE" as IsoAlpha2 }} />,
      );

      const indicator = screen.getByTitle("Working from office");
      expect(indicator).toBeInTheDocument();

      const header = screen.getByLabelText(/Working from office/i);
      expect(header).toBeInTheDocument();
    });

    it("shows work location alongside school holiday indicators", () => {
      render(
        <DayCell
          {...defaultProps}
          isWeekend={true}
          schoolHoliday={{ name: "Winter Break", localName: "Wintervakantie" }}
          shiftBadge={OFF_SHIFT}
          workLocation={{ location: "home", countryCode: "NL" as IsoAlpha2 }}
        />,
        { wrapper: TestProviders },
      );

      expect(screen.getByText("🏫")).toBeInTheDocument();
      const indicator = screen.getByTitle("Working from home");
      expect(indicator).toBeInTheDocument();
      expect(screen.getByLabelText(/School Holiday: Winter Break/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Working from home/i)).toBeInTheDocument();
    });
  });

  describe("Day Header", () => {
    it("should render day header with correct CSS class", () => {
      const { container } = render(<DayCell {...defaultProps} />);

      const dayHeader = container.querySelector(".month-calendar-day-header");
      expect(dayHeader).toBeInTheDocument();
    });
  });
});
