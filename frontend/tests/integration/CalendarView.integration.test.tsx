import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { CalendarView } from "@/components/CalendarView";
import { EventStoreProvider } from "@/contexts/EventStoreContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { buildTimeOffEntryForRange, createWeeklyTimeOffEntry } from "@/lib/timeOff/codecs";
import type { TimeOffEntry } from "@/lib/timeOff/types";
import { timeOffCollection } from "@/db/collections";
import type { PublicHolidayInfo } from "@/types/publicHolidays";
import type { SchoolHolidayInfo } from "@/types/schoolHolidays";
import type { PaydayInfo } from "@/types/paydays";

// Mock the hooks that fetch external holiday and payday data
vi.mock("@/hooks/usePublicHolidays");
vi.mock("@/hooks/useSchoolHolidays");
vi.mock("@/hooks/usePaydates");
vi.mock("@/hooks/useLongWeekend");

// Import after mocking to get the mocked versions
import { usePublicHolidays } from "@/hooks/usePublicHolidays";
import { useSchoolHolidays } from "@/hooks/useSchoolHolidays";
import { usePaydates } from "@/hooks/usePaydates";
import { useLongWeekend } from "@/hooks/useLongWeekend";

// Cast to mocked functions for type safety
const mockedUsePublicHolidays = vi.mocked(usePublicHolidays);
const mockedUseSchoolHolidays = vi.mocked(useSchoolHolidays);
const mockedUsePaydates = vi.mocked(usePaydates);
const mockedUseLongWeekend = vi.mocked(useLongWeekend);

/**
 * Test fixtures for multi-source data integration testing.
 * These represent typical data combinations seen in CalendarView.
 */
const createTestFixtures = () => {
  // Public holidays fixture - New Year's Day
  const publicHolidayMap = new Map<string, PublicHolidayInfo>([
    ["2025-01-01", { name: "New Year's Day", localName: "Nieuwjaarsdag" }],
    ["2025-12-25", { name: "Christmas Day", localName: "Kerstmis" }],
    ["2025-12-26", { name: "Boxing Day", localName: "Tweede Kerstdag" }],
  ]);

  // School holidays fixture - Winter break
  const schoolHolidayMap = new Map<string, SchoolHolidayInfo>([
    ["2025-01-06", { name: "Winter Holiday", localName: "Wintervakantie" }],
    ["2025-01-07", { name: "Winter Holiday", localName: "Wintervakantie" }],
    ["2025-01-08", { name: "Winter Holiday", localName: "Wintervakantie" }],
  ]);

  // Payday fixture - 25th or nearest business day
  const paydayMap = new Map<string, PaydayInfo>([
    ["2025-01-24", { name: "Payday" }],
    ["2025-02-25", { name: "Payday" }],
  ]);

  // Time-off events fixture
  const timeOffEvents: TimeOffEntry[] = [
    buildTimeOffEntryForRange({
      start: "2025-01-15",
      end: "2025-01-17",
      note: "Vacation",
      entryType: "vacation",
      entryFlag: "full_day",
    }),
    createWeeklyTimeOffEntry({
      weekday: 5,
      note: "Remote Work",
      entryType: "in",
      entryFlag: "full_day",
    }),
  ];

  return {
    publicHolidayMap,
    schoolHolidayMap,
    paydayMap,
    timeOffEvents,
  };
};

/**
 * Configures localStorage with a valid user state for testing.
 */
const setupUserState = (
  overrides: {
    myTeam?: number | null;
    scheduleType?: string | null;
    enableTimeOff?: boolean;
  } = {},
) => {
  const { myTeam = 1, scheduleType = "5-shift", enableTimeOff = true } = overrides;

  localStorage.setItem(
    "worktime_user_state",
    JSON.stringify({
      version: 3,
      hasCompletedOnboarding: true,
      myTeam,
      scheduleType,
      settings: {
        timeFormat: "24h",
        theme: "system",
        notifications: "off",
        vacationAllowance: { yearlyAmounts: {}, unit: "days", hoursPerDay: 8 },
        enableTimeOff,
        enableTimeTracking: false,
        homeCountry: null,
        officeCountry: null,
        enableCrossBorderTracking: false,
      },
      lastUsed: {
        activeTab: "calendar",
        scheduleView: "today",
        otherSchedule: null,
        timeOffView: "table",
        timeTrackingView: "daily",
        otherTeam: null,
      },
    }),
  );
};

/**
 * Seeds time-off entries into the collection for EventStoreProvider.
 */
const setupTimeOffEvents = (events: TimeOffEntry[]) => {
  timeOffCollection.utils.writeUpsert(events);
};

/**
 * Renders CalendarView with all required providers.
 */
const renderCalendarView = (props: { myTeam: number | null } = { myTeam: 1 }) => {
  return render(
    <SettingsProvider>
      <ToastProvider>
        <EventStoreProvider>
          <CalendarView {...props} />
        </EventStoreProvider>
      </ToastProvider>
    </SettingsProvider>,
  );
};

describe("CalendarView Integration Tests", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();

    // Set default mock return values
    mockedUsePublicHolidays.mockReturnValue({
      publicHolidayMap: new Map(),
      loading: false,
      error: null,
    });

    mockedUseSchoolHolidays.mockReturnValue({
      schoolHolidayMap: new Map(),
      loading: false,
      error: null,
    });

    mockedUsePaydates.mockReturnValue({
      paydayMap: new Map(),
      loading: false,
      error: null,
    });

    mockedUseLongWeekend.mockReturnValue({
      longWeekendMap: new Map(),
      loading: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Multi-Source Data Rendering", () => {
    it("renders day cells with combined roster shifts, public holidays, and paydays", () => {
      const fixtures = createTestFixtures();
      setupUserState({ myTeam: 1, scheduleType: "5-shift", enableTimeOff: false });

      mockedUsePublicHolidays.mockReturnValue({
        publicHolidayMap: fixtures.publicHolidayMap,
        loading: false,
        error: null,
      });

      mockedUseSchoolHolidays.mockReturnValue({
        schoolHolidayMap: fixtures.schoolHolidayMap,
        loading: false,
        error: null,
      });

      mockedUsePaydates.mockReturnValue({
        paydayMap: fixtures.paydayMap,
        loading: false,
        error: null,
      });

      // Set fake time to January 2025 for consistent testing
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-10T12:00:00Z"));

      renderCalendarView({ myTeam: 1 });

      // Verify calendar is rendered
      expect(screen.getByText(/My Working Calendar/i)).toBeInTheDocument();

      // Verify shift badges are present (M/L/N/D/O codes)
      const shiftBadges = screen.getAllByText(/^[MLNDO]$/);
      expect(shiftBadges.length).toBeGreaterThan(0);

      // Verify public holiday is exposed through day-cell accessible name
      const holidayCell = screen.getByRole("gridcell", { name: /New Year's Day/i });
      expect(holidayCell).toBeInTheDocument();

      // Verify payday is exposed through day-cell accessible name
      const paydayCell = screen.getByRole("gridcell", { name: /Payday/i });
      expect(paydayCell).toBeInTheDocument();
    });

    it("renders day cells with time-off events when enabled", () => {
      const fixtures = createTestFixtures();
      setupUserState({ myTeam: 1, scheduleType: "5-shift", enableTimeOff: true });
      setupTimeOffEvents(fixtures.timeOffEvents);

      mockedUsePublicHolidays.mockReturnValue({
        publicHolidayMap: fixtures.publicHolidayMap,
        loading: false,
        error: null,
      });

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-10T12:00:00Z"));

      renderCalendarView({ myTeam: 1 });

      // Verify time-off events are rendered (may appear multiple times across date range)
      expect(screen.getAllByRole("button", { name: /Vacation/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("button", { name: /Remote Work/i }).length).toBeGreaterThan(0);
    });

    it("combines school holidays with roster shifts", () => {
      const fixtures = createTestFixtures();
      setupUserState({ myTeam: 1, scheduleType: "5-shift", enableTimeOff: false });

      mockedUseSchoolHolidays.mockReturnValue({
        schoolHolidayMap: fixtures.schoolHolidayMap,
        loading: false,
        error: null,
      });

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-10T12:00:00Z"));

      renderCalendarView({ myTeam: 1 });

      // Verify school holiday is exposed through day-cell accessible name
      const schoolHolidayCells = screen.getAllByRole("gridcell", {
        name: /School Holiday: Winter Holiday/i,
      });
      expect(schoolHolidayCells.length).toBeGreaterThan(0);
    });

    it("displays all data sources on a single day when overlapping", () => {
      // Create overlapping data on Jan 6 (shift + school holiday + time-off)
      const fixtures = createTestFixtures();
      const overlappingEvents: TimeOffEntry[] = [
        buildTimeOffEntryForRange({
          start: "2025-01-06",
          end: "2025-01-06",
          note: "Personal Day",
          entryType: "vacation",
          entryFlag: "full_day",
        }),
      ];

      setupUserState({ myTeam: 1, scheduleType: "5-shift", enableTimeOff: true });
      setupTimeOffEvents(overlappingEvents);

      mockedUseSchoolHolidays.mockReturnValue({
        schoolHolidayMap: fixtures.schoolHolidayMap,
        loading: false,
        error: null,
      });

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-10T12:00:00Z"));

      renderCalendarView({ myTeam: 1 });

      // Verify both school holiday and time-off event appear (school holiday appears multiple days)
      expect(
        screen.getAllByRole("gridcell", { name: /School Holiday: Winter Holiday/i }).length,
      ).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: /Personal Day/i })).toBeInTheDocument();
    });
  });

  describe("Context Menu Interactions", () => {
    it("opens add event modal when right-clicking on a day", async () => {
      setupUserState({ myTeam: 1, scheduleType: "5-shift", enableTimeOff: true });

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-10T12:00:00Z"));

      const { container } = renderCalendarView({ myTeam: 1 });

      // Find a day cell by class name (day cells are divs, not buttons)
      const dayCells = container.querySelectorAll(".month-calendar-day");
      const targetCell = Array.from(dayCells).find((cell) =>
        cell.querySelector(".month-calendar-day-number")?.textContent?.includes("15"),
      );
      expect(targetCell).toBeTruthy();

      // Right-click to open context menu using fireEvent (more reliable than userEvent.pointer)
      fireEvent.contextMenu(targetCell!);

      // Verify context menu appears
      expect(screen.getByText("Add new event")).toBeInTheDocument();

      // Click add event using fireEvent (more reliable with fake timers)
      fireEvent.click(screen.getByText("Add new event"));

      // Verify modal opens
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("opens edit modal when right-clicking on an event", async () => {
      const fixtures = createTestFixtures();
      setupUserState({ myTeam: 1, scheduleType: "5-shift", enableTimeOff: true });
      setupTimeOffEvents(fixtures.timeOffEvents);

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-10T12:00:00Z"));

      renderCalendarView({ myTeam: 1 });

      // Find the vacation event badge (get first occurrence since it spans multiple days)
      const vacationBadges = screen.getAllByRole("button", { name: /Vacation/i });
      expect(vacationBadges.length).toBeGreaterThan(0);
      const vacationBadge = vacationBadges[0];

      // Right-click the event using fireEvent
      fireEvent.contextMenu(vacationBadge);

      // Verify context menu appears with edit option
      expect(screen.getByText("Edit event")).toBeInTheDocument();

      // Click edit event using fireEvent
      fireEvent.click(screen.getByText("Edit event"));

      // Verify modal opens in edit mode
      const modal = screen.getByRole("dialog");
      expect(modal).toBeInTheDocument();
      expect(within(modal).getByText(/Edit Event/i)).toBeInTheDocument();
    });

    it("shows delete option in context menu for events", async () => {
      const fixtures = createTestFixtures();
      setupUserState({ myTeam: 1, scheduleType: "5-shift", enableTimeOff: true });
      setupTimeOffEvents(fixtures.timeOffEvents);

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-10T12:00:00Z"));

      renderCalendarView({ myTeam: 1 });

      // Find the vacation event badge (get first occurrence)
      const vacationBadges = screen.getAllByRole("button", { name: /Vacation/i });
      const vacationBadge = vacationBadges[0];

      // Right-click the event using fireEvent
      fireEvent.contextMenu(vacationBadge);

      // Verify delete option appears
      expect(screen.getByText("Delete event")).toBeInTheDocument();
    });

    it("does not show context menu when time-off is disabled", async () => {
      setupUserState({ myTeam: 1, scheduleType: "5-shift", enableTimeOff: false });

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-10T12:00:00Z"));

      const { container } = renderCalendarView({ myTeam: 1 });

      // Find a day cell
      const dayCells = container.querySelectorAll(".month-calendar-day");
      const targetCell = Array.from(dayCells).find((cell) =>
        cell.querySelector(".month-calendar-day-number")?.textContent?.includes("15"),
      );
      expect(targetCell).toBeTruthy();

      // Right-click to attempt context menu using fireEvent
      fireEvent.contextMenu(targetCell!);

      // Verify context menu does NOT appear
      expect(screen.queryByText("Add new event")).not.toBeInTheDocument();
    });
  });

  describe("Month Navigation", () => {
    it("navigates to previous month and updates display", async () => {
      setupUserState({ myTeam: 1, scheduleType: "5-shift", enableTimeOff: false });

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-02-15T12:00:00Z"));

      renderCalendarView({ myTeam: 1 });

      // Verify we're in February
      expect(screen.getByText(/February 2025/i)).toBeInTheDocument();

      // Click previous month button using fireEvent
      const prevButton = screen.getByRole("button", { name: /Previous month/i });
      fireEvent.click(prevButton);

      // Verify we're now in January
      expect(screen.getByText(/January 2025/i)).toBeInTheDocument();
    });

    it("navigates to next month and updates display", async () => {
      setupUserState({ myTeam: 1, scheduleType: "5-shift", enableTimeOff: false });

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));

      renderCalendarView({ myTeam: 1 });

      // Verify we're in January
      expect(screen.getByText(/January 2025/i)).toBeInTheDocument();

      // Click next month button using fireEvent
      const nextButton = screen.getByRole("button", { name: /Next month/i });
      fireEvent.click(nextButton);

      // Verify we're now in February
      expect(screen.getByText(/February 2025/i)).toBeInTheDocument();
    });

    it("navigates to current month when clicking Today button", async () => {
      setupUserState({ myTeam: 1, scheduleType: "5-shift", enableTimeOff: false });

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));

      renderCalendarView({ myTeam: 1 });

      // Navigate away from current month
      const nextButton = screen.getByRole("button", { name: /Next month/i });
      fireEvent.click(nextButton);
      expect(screen.getByText(/February 2025/i)).toBeInTheDocument();

      // Click Today button (labeled as "This Month" in MonthCalendar) using fireEvent
      const todayButton = screen.getByRole("button", { name: /current month/i });
      fireEvent.click(todayButton);

      // Verify we're back in January
      expect(screen.getByText(/January 2025/i)).toBeInTheDocument();
    });

    it("navigates across year boundary correctly", async () => {
      setupUserState({ myTeam: 1, scheduleType: "5-shift", enableTimeOff: false });

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));

      renderCalendarView({ myTeam: 1 });

      // Navigate to previous month (should go to December 2024) using fireEvent
      const prevButton = screen.getByRole("button", { name: /Previous month/i });
      fireEvent.click(prevButton);

      // Verify we're in December 2024
      expect(screen.getByText(/December 2024/i)).toBeInTheDocument();
    });
  });

  describe("Time-Off Feature Toggle", () => {
    it("hides time-off events when feature is disabled", () => {
      const fixtures = createTestFixtures();
      setupUserState({ myTeam: 1, scheduleType: "5-shift", enableTimeOff: false });
      setupTimeOffEvents(fixtures.timeOffEvents);

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-10T12:00:00Z"));

      renderCalendarView({ myTeam: 1 });

      // Verify time-off events are NOT displayed
      expect(screen.queryByRole("button", { name: /Vacation/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Remote Work/i })).not.toBeInTheDocument();
    });

    it("shows time-off events when feature is enabled", () => {
      const fixtures = createTestFixtures();
      setupUserState({ myTeam: 1, scheduleType: "5-shift", enableTimeOff: true });
      setupTimeOffEvents(fixtures.timeOffEvents);

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-10T12:00:00Z"));

      renderCalendarView({ myTeam: 1 });

      // Verify time-off events ARE displayed (may appear multiple times)
      expect(screen.getAllByRole("button", { name: /Vacation/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("button", { name: /Remote Work/i }).length).toBeGreaterThan(0);
    });

    it("does not show event modal when time-off is disabled", () => {
      setupUserState({ myTeam: 1, scheduleType: "5-shift", enableTimeOff: false });

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-10T12:00:00Z"));

      renderCalendarView({ myTeam: 1 });

      // Verify modal is not present
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("hides calendar legend event types when time-off is disabled", () => {
      setupUserState({ myTeam: 1, scheduleType: "5-shift", enableTimeOff: false });

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-10T12:00:00Z"));

      renderCalendarView({ myTeam: 1 });

      // Open the legend popover
      const legendButton = screen.getByRole("button", { name: /Legend/i });
      fireEvent.click(legendButton);

      // Verify "Event Types" section is not shown when time-off is disabled
      expect(screen.queryByText("Event Types")).not.toBeInTheDocument();
      // But "Day Indicators" should still be visible
      expect(screen.getByText("Day Indicators")).toBeInTheDocument();
    });
  });

  describe("Empty State Handling", () => {
    it("shows empty state when no schedule is selected", () => {
      setupUserState({ myTeam: null, scheduleType: null, enableTimeOff: false });

      renderCalendarView({ myTeam: null });

      // Verify empty state message
      expect(screen.getByText(/Welcome to Your Working Calendar/i)).toBeInTheDocument();
      expect(screen.getByText(/select your work schedule/i)).toBeInTheDocument();
    });

    it("shows empty state when schedule is selected but no team", () => {
      setupUserState({ myTeam: null, scheduleType: "5-shift", enableTimeOff: false });

      renderCalendarView({ myTeam: null });

      // Verify empty state message for team selection
      expect(screen.getByText(/select your team/i)).toBeInTheDocument();
    });

    it("does not show empty state for single-user schedules", () => {
      setupUserState({ myTeam: null, scheduleType: "9-5", enableTimeOff: false });

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-10T12:00:00Z"));

      renderCalendarView({ myTeam: null });

      // 9-5 schedule doesn't require team selection - should show calendar
      expect(screen.queryByText(/Welcome to Your Working Calendar/i)).not.toBeInTheDocument();

      // Should show calendar with day shifts
      const shiftBadges = screen.getAllByText(/^[DO]$/);
      expect(shiftBadges.length).toBeGreaterThan(0);
    });
  });

  describe("Modal Event Workflows", () => {
    /**
     * Helper function to open the 'Add new event' modal for a specific day.
     */
    const openAddEventModalForDay = (container: HTMLElement, day: string) => {
      const dayCells = container.querySelectorAll(".month-calendar-day");
      const targetCell = Array.from(dayCells).find((cell) =>
        cell.querySelector(".month-calendar-day-number")?.textContent?.includes(day),
      );
      if (!targetCell) {
        throw new Error(`Target day cell for date "${day}" was not found in the month calendar.`);
      }
      fireEvent.contextMenu(targetCell);
      fireEvent.click(screen.getByText("Add new event"));
    };

    beforeEach(() => {
      setupUserState({ myTeam: 1, scheduleType: "5-shift", enableTimeOff: true });
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-10T12:00:00Z"));
    });

    it("completes add event workflow successfully", async () => {
      const { container } = renderCalendarView({ myTeam: 1 });

      openAddEventModalForDay(container, "20");

      // Fill in event details (the label is "Comment" not "Event title") using fireEvent
      const modal = screen.getByRole("dialog");
      const titleInput = within(modal).getByLabelText(/Comment/i);
      fireEvent.change(titleInput, { target: { value: "Doctor Appointment" } });

      // Submit form using fireEvent (button is "Add" in add mode)
      const addButton = within(modal).getByRole("button", { name: /^Add$/i });
      fireEvent.click(addButton);

      // Verify modal closes and event is added
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Doctor Appointment/i })).toBeInTheDocument();
    });

    it("validates date input when adding events", async () => {
      const { container } = renderCalendarView({ myTeam: 1 });

      openAddEventModalForDay(container, "20");

      // Clear the pre-filled start date to trigger required validation
      const modal = screen.getByRole("dialog");
      const startInput = within(modal).getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      fireEvent.change(startInput, { target: { value: "" } });

      // Try to submit using fireEvent (button is "Add" in add mode)
      const addButton = within(modal).getByRole("button", { name: /^Add$/i });
      fireEvent.click(addButton);

      // Verify required validation error appears
      expect(within(modal).getByText(/Start date is required/i)).toBeInTheDocument();
    });

    it("switches from view mode to edit mode in modal", async () => {
      const fixtures = createTestFixtures();
      setupUserState({ myTeam: 1, scheduleType: "5-shift", enableTimeOff: true });
      setupTimeOffEvents(fixtures.timeOffEvents);

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-10T12:00:00Z"));

      renderCalendarView({ myTeam: 1 });

      // Click on an event to view it (get first occurrence) using fireEvent
      const vacationBadges = screen.getAllByRole("button", { name: /Vacation/i });
      const vacationBadge = vacationBadges[0];
      fireEvent.click(vacationBadge);

      // Verify view modal opens
      const modal = screen.getByRole("dialog");
      expect(within(modal).getByText(/View Event/i)).toBeInTheDocument();

      // Click edit button using fireEvent (button text is "Edit" in view mode)
      const editButtons = within(modal).getAllByRole("button", { name: /Edit/i });
      const editButton = editButtons.find((btn) => btn.textContent === "Edit");
      expect(editButton).toBeTruthy();
      fireEvent.click(editButton!);

      // Verify modal switches to edit mode (button is "Update" not "Save" in edit mode)
      expect(within(modal).getByText(/Edit Event/i)).toBeInTheDocument();
      expect(within(modal).getByRole("button", { name: /Update/i })).toBeInTheDocument();
    });

    it("shows Cancel button in edit mode and returns to view mode", async () => {
      const fixtures = createTestFixtures();
      setupUserState({ myTeam: 1, scheduleType: "5-shift", enableTimeOff: true });
      setupTimeOffEvents(fixtures.timeOffEvents);

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-10T12:00:00Z"));

      renderCalendarView({ myTeam: 1 });

      const vacationBadge = screen.getAllByRole("button", { name: /Vacation/i })[0];
      fireEvent.click(vacationBadge);

      const modal = screen.getByRole("dialog");
      const editButton = within(modal)
        .getAllByRole("button", { name: /Edit/i })
        .find((button) => button.textContent === "Edit");
      expect(editButton).toBeTruthy();
      fireEvent.click(editButton!);

      expect(within(modal).getByRole("button", { name: /^Cancel$/i })).toBeInTheDocument();

      fireEvent.click(within(modal).getByRole("button", { name: /^Cancel$/i }));

      expect(within(modal).getByText(/View Event/i)).toBeInTheDocument();
    });

    it("confirms reset in edit mode when form has unsaved changes", async () => {
      const fixtures = createTestFixtures();
      setupUserState({ myTeam: 1, scheduleType: "5-shift", enableTimeOff: true });
      setupTimeOffEvents(fixtures.timeOffEvents);

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-10T12:00:00Z"));

      renderCalendarView({ myTeam: 1 });

      const vacationBadge = screen.getAllByRole("button", { name: /Vacation/i })[0];
      fireEvent.click(vacationBadge);

      const modal = screen.getByRole("dialog");
      const editButton = within(modal)
        .getAllByRole("button", { name: /Edit/i })
        .find((button) => button.textContent === "Edit");
      expect(editButton).toBeTruthy();
      fireEvent.click(editButton!);

      const commentInput = within(modal).getByLabelText(/Comment/i);
      fireEvent.change(commentInput, { target: { value: "Updated title" } });

      fireEvent.click(within(modal).getByRole("button", { name: /Reset form/i }));

      expect(
        screen.getByRole("dialog", { description: /You have unsaved changes/i }),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Keep Editing/i }));
      expect(
        screen.queryByRole("dialog", { description: /You have unsaved changes/i }),
      ).not.toBeInTheDocument();

      const eventFormDialog = screen.getByRole("dialog");
      expect(within(eventFormDialog).getByDisplayValue("Updated title")).toBeInTheDocument();
    });
  });

  describe("Delete Confirmation Flow", () => {
    /**
     * Helper function to open the delete confirmation dialog for the first vacation event.
     */
    const openDeleteConfirmationForVacation = () => {
      const vacationBadge = screen.getAllByRole("button", { name: /Vacation/i })[0];
      fireEvent.contextMenu(vacationBadge);
      fireEvent.click(screen.getByText("Delete event"));
    };

    beforeEach(() => {
      const fixtures = createTestFixtures();
      setupUserState({ myTeam: 1, scheduleType: "5-shift", enableTimeOff: true });
      setupTimeOffEvents(fixtures.timeOffEvents);
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-10T12:00:00Z"));
      renderCalendarView({ myTeam: 1 });
    });

    it("shows confirmation dialog when deleting event", async () => {
      openDeleteConfirmationForVacation();

      // Verify confirmation dialog appears
      expect(screen.getByText(/Delete Event/i)).toBeInTheDocument();
      expect(screen.getByText(/Are you sure/i)).toBeInTheDocument();
    });

    it("cancels delete when user clicks Cancel", async () => {
      openDeleteConfirmationForVacation();

      // Click Cancel using fireEvent
      const cancelButton = screen.getByRole("button", { name: /Cancel/i });
      fireEvent.click(cancelButton);

      // Verify event still exists
      expect(screen.getAllByRole("button", { name: /Vacation/i }).length).toBeGreaterThan(0);
    });

    it("deletes event when user confirms", async () => {
      openDeleteConfirmationForVacation();

      // Click Delete to confirm using fireEvent
      const deleteButton = screen.getByRole("button", { name: /^Delete$/i });
      fireEvent.click(deleteButton);

      // Verify event is removed
      expect(screen.queryByRole("button", { name: /Vacation/i })).not.toBeInTheDocument();
    });
  });
});
