import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RealDayjs from "dayjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CurrentStatus } from "@/components/CurrentStatus";
import { SettingsProvider, useSettings } from "@/contexts/SettingsContext";
import { ToastProvider } from "@/contexts/ToastContext";
import * as useCountdownHook from "@/hooks/useCountdown";
import { dayjs, formatYYWWD } from "@/utils/dateTimeUtils";
import * as shiftCalculations from "@/utils/shiftCalculations";

// Mock useSettings to provide scheduleType
vi.mock("@/contexts/SettingsContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/contexts/SettingsContext")>();
  return {
    ...actual,
    useSettings: vi.fn(() => ({
      settings: {
        timeFormat: "24h",
        theme: "auto",
        notifications: "off",
        vacationAllowance: { yearlyAmounts: {}, unit: "days", hoursPerDay: 8 },
        enableTimeOff: false,
        enableTimeTracking: false,
      },
      lastUsed: {
        activeTab: "calendar",
        scheduleView: "today",
        otherSchedule: null,
        timeOffView: "table",
        timeTrackingView: "daily",
        otherTeam: null,
      },
      scheduleType: "5-shift",
      myTeam: null,
    })),
  };
});

// Mock dependencies
vi.mock("@/utils/shiftCalculations", () => ({
  calculateShift: vi.fn(),
  getAllTeamsShifts: vi.fn(),
  getCurrentShiftDay: vi.fn(),
  getNextShift: vi.fn(),
  getOffDayProgress: vi.fn(),
  getShiftCode: vi.fn(),
  getShift: vi.fn(),
  getFormattedShiftTime: vi.fn((shift) => {
    // Return formatted time based on shift start/end
    if (shift.start != null && shift.end != null) {
      const formatHour = (h: number) => String(Math.floor(h)).padStart(2, "0") + ":00";
      return `${formatHour(shift.start)}–${formatHour(shift.end)}`;
    }
    return "Not working";
  }),
  isCurrentlyWorking: vi.fn(),
  getCurrentWorkingTeam: vi.fn(),
}));

// getShiftClassName is now part of shiftCalculations mock

vi.mock("@/hooks/useCountdown", () => ({
  useCountdown: vi.fn(),
}));

vi.mock("@/utils/dateTimeUtils", async (importOriginal) => {
  const actual = await importOriginal();
  const mockDayjsObj: Record<string, ReturnType<typeof vi.fn>> = {
    startOf: vi.fn(() => ({
      toISOString: vi.fn(() => "2024-01-15T00:00:00.000Z"),
    })),
    isSame: vi.fn(() => false),
    isAfter: vi.fn(() => true),
    format: vi.fn(() => "2024-01-15"),
    diff: vi.fn(() => 28800),
    hour: vi.fn(() => ({
      minute: vi.fn(() => ({
        second: vi.fn(() => ({
          isBefore: vi.fn(() => false),
          isAfter: vi.fn(() => true),
          diff: vi.fn(() => 28800),
          isValid: vi.fn(() => true),
        })),
      })),
    })),
    add: vi.fn(),
    subtract: vi.fn(),
  };
  mockDayjsObj.add.mockReturnValue(mockDayjsObj);
  mockDayjsObj.subtract.mockReturnValue(mockDayjsObj);
  return {
    ...(actual && typeof actual === "object" ? actual : {}),
    dayjs: vi.fn(() => mockDayjsObj),
    formatYYWWD: vi.fn(() => "2430.1"),
    formatTimeByPreference: vi.fn(() => "17:01"),
  };
});

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <ToastProvider>
      <SettingsProvider>{ui}</SettingsProvider>
    </ToastProvider>,
  );
}

describe("CurrentStatus Component", () => {
  const mockOnChangeTeam = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    vi.mocked(formatYYWWD).mockReturnValue("Mon 15 Jan");
    vi.mocked(shiftCalculations.getCurrentShiftDay).mockReturnValue(dayjs("2024-01-15"));
    vi.mocked(shiftCalculations.calculateShift).mockReturnValue({
      code: "M",
      displayCode: "M",
      emoji: "🌅",
      name: "Morning",
      start: 7,
      end: 15,
      isWorking: true,
      className: "shift-morning",
    });
    vi.mocked(shiftCalculations.getShiftCode).mockReturnValue("D1");
    vi.mocked(shiftCalculations.getAllTeamsShifts).mockReturnValue([
      {
        teamNumber: 1,
        shift: {
          code: "M",
          displayCode: "M",
          emoji: "🌅",
          name: "Morning",
          start: 7,
          end: 15,
          isWorking: true,
          className: "shift-morning",
        },
        date: dayjs("2024-01-15"),
        code: "D1M",
      },
      {
        teamNumber: 2,
        shift: {
          code: "O",
          displayCode: "O",
          emoji: "☀️",
          name: "Off",
          start: null,
          end: null,
          isWorking: false,
          className: "shift-off",
        },
        date: dayjs("2024-01-15"),
        code: "D1O",
      },
    ]);
    vi.mocked(shiftCalculations.getCurrentWorkingTeam).mockReturnValue({
      teamNumber: 1,
      shift: {
        code: "M",
        displayCode: "M",
        emoji: "🌅",
        name: "Morning",
        start: 7,
        end: 15,
        isWorking: true,
        className: "shift-morning",
      },
      date: dayjs("2024-01-15"),
      code: "D1M",
    });
    vi.mocked(shiftCalculations.getNextShift).mockReturnValue({
      date: dayjs("2024-01-16"),
      shift: {
        code: "L",
        displayCode: "E",
        emoji: "🌆",
        name: "Evening",
        start: 15,
        end: 23,
        isWorking: true,
        className: "shift-evening",
      },
      code: "2404.2L",
    });
    vi.mocked(shiftCalculations.getOffDayProgress).mockReturnValue({
      current: 2,
      total: 4,
    });
    vi.mocked(shiftCalculations.getShift).mockReturnValue({
      code: "M",
      displayCode: "M",
      emoji: "🌅",
      name: "Morning",
      start: 7,
      end: 15,
      isWorking: true,
      className: "shift-morning",
    });
    vi.mocked(shiftCalculations.isCurrentlyWorking).mockReturnValue(true);
    vi.mocked(useCountdownHook.useCountdown).mockReturnValue({
      days: 0,
      hours: 2,
      minutes: 30,
      seconds: 0,
      totalSeconds: 9000,
      formatted: "2h 30m",
      isExpired: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Basic Rendering", () => {
    it("should render without crashing", () => {
      renderWithProviders(<CurrentStatus myTeam={null} onChangeTeam={mockOnChangeTeam} />);

      expect(screen.getAllByText("Current Status")[0]).toBeInTheDocument();
    });

    it("should render the card structure correctly", () => {
      renderWithProviders(<CurrentStatus myTeam={null} onChangeTeam={mockOnChangeTeam} />);

      expect(screen.getAllByText("Current Status")[0]).toBeInTheDocument();
      // With scheduleType set to "5-shift" via mock, shows "Select Team" button
      expect(screen.getByRole("button", { name: /select team/i })).toBeInTheDocument();
    });
  });

  describe("Team Selection States", () => {
    it("should show team selection prompt when no team is selected", () => {
      renderWithProviders(<CurrentStatus myTeam={null} onChangeTeam={mockOnChangeTeam} />);

      expect(
        screen.getByText(
          "Select your team above for personalized shift tracking and countdown timers",
        ),
      ).toBeInTheDocument();
    });

    it("should show team summary badge in generic status", () => {
      // The default mock sets up exactly 2 teams: team 1 (working) + team 2 (off)
      renderWithProviders(<CurrentStatus myTeam={null} onChangeTeam={mockOnChangeTeam} />);

      expect(screen.getByText("1 working, 1 off")).toBeInTheDocument();
    });

    it("should show generic shift countdown and progress when countdown is active", () => {
      const activeCountdown = {
        days: 0,
        hours: 1,
        minutes: 15,
        seconds: 0,
        totalSeconds: 4500,
        formatted: "1h 15m",
        isExpired: false,
      };

      // GenericStatusContent calls useCountdown twice per render:
      //   1st call: countdown (next-shift start time — drives the Next Activity card)
      //   2nd call: shiftEndCountdown (current shift end time — drives the Ends in badge/progress)
      vi.mocked(useCountdownHook.useCountdown)
        .mockReturnValueOnce(activeCountdown) // countdown (next shift)
        .mockReturnValueOnce(activeCountdown); // shiftEndCountdown (active → shows badge/progress)

      renderWithProviders(<CurrentStatus myTeam={null} onChangeTeam={mockOnChangeTeam} />);

      expect(screen.getByText(/^Ends in/)).toBeInTheDocument();
      expect(
        screen.getByLabelText(/Shift progress with (?:\d+ hours and )?\d+ minutes remaining/),
      ).toBeInTheDocument();
    });

    it("should hide generic shift countdown and progress when countdown has expired", () => {
      const activeCountdown = {
        days: 0,
        hours: 1,
        minutes: 15,
        seconds: 0,
        totalSeconds: 4500,
        formatted: "1h 15m",
        isExpired: false,
      };
      const expiredCountdown = {
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        totalSeconds: 0,
        formatted: "",
        isExpired: true,
      };

      // GenericStatusContent calls useCountdown twice per render:
      //   1st call: countdown (next-shift start time — drives the Next Activity card)
      //   2nd call: shiftEndCountdown (current shift end time — drives the Ends in badge/progress)
      vi.mocked(useCountdownHook.useCountdown)
        .mockReturnValueOnce(activeCountdown) // countdown (next shift)
        .mockReturnValueOnce(expiredCountdown); // shiftEndCountdown (expired → hides badge/progress)

      renderWithProviders(<CurrentStatus myTeam={null} onChangeTeam={mockOnChangeTeam} />);

      expect(screen.queryByText(/^Ends in/)).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText(/Shift progress with (?:\d+ hours and )?\d+ minutes remaining/),
      ).not.toBeInTheDocument();
    });

    it("should show current shift information when team is selected", () => {
      renderWithProviders(<CurrentStatus myTeam={1} onChangeTeam={mockOnChangeTeam} />);

      // Team label and shift name are now separate elements
      expect(screen.getByText("Team 1:")).toBeInTheDocument();
      expect(screen.getAllByText("Morning").length).toBeGreaterThan(0);

      // Also check for hours somewhere in the document (localized format uses en-dash)
      expect(screen.getAllByText("07:00–15:00").length).toBeGreaterThan(0);
    });

    it("should show next shift information when team is selected", () => {
      renderWithProviders(<CurrentStatus myTeam={1} onChangeTeam={mockOnChangeTeam} />);

      expect(screen.getByText("Up Next")).toBeInTheDocument();
      expect(screen.getByText(/2024-01-15.*Evening/)).toBeInTheDocument();
      expect(screen.getByText("15:00–23:00")).toBeInTheDocument();
    });
  });

  describe("Single-team schedule (9-5)", () => {
    const defaultSettingsValue = {
      settings: {
        timeFormat: "24h" as const,
        theme: "auto" as const,
        notifications: "off" as const,
        vacationAllowance: { yearlyAmounts: {}, unit: "days" as const, hoursPerDay: 8 },
        enableTimeOff: false,
        enableTimeTracking: false,
      },
      lastUsed: {
        activeTab: "calendar" as const,
        scheduleView: "today" as const,
        otherSchedule: null,
        timeOffView: "table" as const,
        timeTrackingView: "daily" as const,
        otherTeam: null,
      },
      scheduleType: "5-shift" as const,
      myTeam: null,
    };

    afterEach(() => {
      // Restore the file-wide default ("5-shift") so later tests aren't affected.
      vi.mocked(useSettings).mockReturnValue(
        defaultSettingsValue as ReturnType<typeof useSettings>,
      );
    });

    it("should hide the redundant Up Next tile and let Today take the full width", () => {
      vi.mocked(useSettings).mockReturnValue({
        ...defaultSettingsValue,
        scheduleType: "9-5",
      } as ReturnType<typeof useSettings>);

      renderWithProviders(<CurrentStatus myTeam={null} onChangeTeam={mockOnChangeTeam} />);

      expect(screen.getByText("Today")).toBeInTheDocument();
      expect(screen.queryByText("Up Next")).not.toBeInTheDocument();

      const todayCard = screen.getByText("Today").closest(".col-md-12");
      expect(todayCard).toBeInTheDocument();
    });
  });

  describe("Duplicate Up Next suppression (multi-team)", () => {
    afterEach(() => {
      // Restore the default dayjs mock behavior for later tests in the file.
      vi.mocked(dayjs().isSame).mockImplementation(() => false);
    });

    it("hides Up Next and lets Today take the full width when next shift is the same date and shift as Today", () => {
      vi.mocked(dayjs().isSame).mockImplementation(() => true);
      vi.mocked(shiftCalculations.getNextShift).mockReturnValue({
        date: dayjs("2024-01-15"),
        shift: {
          code: "M",
          displayCode: "M",
          emoji: "🌅",
          name: "Morning",
          start: 7,
          end: 15,
          isWorking: true,
          className: "shift-morning",
        },
        code: "2404.1M",
      });

      renderWithProviders(<CurrentStatus myTeam={1} onChangeTeam={mockOnChangeTeam} />);

      expect(screen.getByText("Today")).toBeInTheDocument();
      expect(screen.queryByText("Up Next")).not.toBeInTheDocument();

      const todayCard = screen.getByText("Today").closest(".col-md-12");
      expect(todayCard).toBeInTheDocument();
    });

    it("still shows Up Next when next shift differs from Today's shift", () => {
      vi.mocked(dayjs().isSame).mockImplementation(() => false);

      renderWithProviders(<CurrentStatus myTeam={1} onChangeTeam={mockOnChangeTeam} />);

      expect(screen.getByText("Up Next")).toBeInTheDocument();
    });
  });

  describe("Later-today labeling for a night-shift-extension collision (#1145)", () => {
    // The file-wide `dayjs()` mock normally returns one shared stub whose `isSame` is a
    // dumb `() => false` — fine for the duplicate-suppression tests above, which only need
    // one true/false verdict, but this bug is exactly two `.isSame` comparisons disagreeing
    // in the same render (next-vs-today is same calendar day, current-vs-today is not), and
    // a canned answer can't produce that. For these two tests only, route the mock through
    // the real Day.js package instead: zero-arg calls (`dayjs()`, what `useLiveTime` reads
    // for "now") resolve to a fixed real instant, and calls with arguments still parse
    // through unchanged. Every date built below is then a genuine dayjs instance, so
    // `.isSame(..., "day")` exercises real calendar-day comparison — the actual logic the
    // bug was in — rather than a hand-coded stand-in for it.
    let originalDayjsImpl: unknown;
    let liveToday: ReturnType<typeof dayjs>;

    beforeEach(() => {
      originalDayjsImpl = vi.mocked(dayjs).getMockImplementation();
      liveToday = RealDayjs("2026-08-19T06:00:00") as unknown as ReturnType<typeof dayjs>;
      vi.mocked(dayjs).mockImplementation(((...args: Parameters<typeof RealDayjs>) =>
        args.length === 0 ? liveToday : RealDayjs(...args)) as typeof dayjs);
    });

    afterEach(() => {
      vi.mocked(dayjs).mockImplementation(originalDayjsImpl as typeof dayjs);
    });

    it('labels Up Next "Later today" instead of "Today" while Today is still showing an in-progress night shift', () => {
      // The shift day the still-running night shift belongs to: a real calendar day
      // before `liveToday`, exactly like the production bug (06:00 is still inside the
      // prior night shift's 23:00–07:00 window, so getCurrentShiftDay backs it up).
      const shiftDay = RealDayjs("2026-08-18T06:00:00") as unknown as ReturnType<typeof dayjs>;
      // Keeps isInNightShiftExtension truthy (isWorking + isCurrentlyWorking are already
      // mocked true in beforeEach), so currentShift.date becomes this shiftDay.
      vi.mocked(shiftCalculations.getCurrentShiftDay).mockReturnValue(shiftDay);
      vi.mocked(shiftCalculations.getNextShift).mockReturnValue({
        date: RealDayjs("2026-08-19T06:00:00") as unknown as ReturnType<typeof dayjs>, // the same real day as liveToday
        shift: {
          code: "L",
          displayCode: "E",
          emoji: "🌆",
          name: "Evening",
          start: 15,
          end: 23,
          isWorking: true,
          className: "shift-evening",
        },
        code: "2404.2L",
      });

      renderWithProviders(<CurrentStatus myTeam={1} onChangeTeam={mockOnChangeTeam} />);

      expect(screen.getByText("Up Next")).toBeInTheDocument();
      expect(screen.getByText(/Later today/)).toBeInTheDocument();
      // "Today" still appears once, as the left card's static heading — just not as the
      // Up Next date label too, which is the collision #1145 reports.
      expect(screen.getAllByText("Today")).toHaveLength(1);
    });

    it('still labels Up Next "Today" when Today\'s card already reflects the real calendar day', () => {
      // currentShift.date falls back to `today` itself whenever isInNightShiftExtension is
      // false — simulate that by making the shift-day lookup not currently working, so
      // currentShift.date resolves to the same real `liveToday` instant as nextShift.date.
      vi.mocked(shiftCalculations.isCurrentlyWorking).mockReturnValue(false);
      vi.mocked(shiftCalculations.getNextShift).mockReturnValue({
        date: RealDayjs("2026-08-19T06:00:00") as unknown as ReturnType<typeof dayjs>,
        shift: {
          code: "L",
          displayCode: "E",
          emoji: "🌆",
          name: "Evening",
          start: 15,
          end: 23,
          isWorking: true,
          className: "shift-evening",
        },
        code: "2404.2L",
      });

      renderWithProviders(<CurrentStatus myTeam={1} onChangeTeam={mockOnChangeTeam} />);

      expect(screen.getByText("Up Next")).toBeInTheDocument();
      expect(screen.queryByText(/Later today/)).not.toBeInTheDocument();
      // The Up Next label sits beside "- Evening" as sibling text nodes, so it never
      // matches an exact "Today" query on its own — assert the combined text instead.
      // Both cards legitimately say "Today" here (same real day, no collision): the left
      // card's isolated static heading, plus this compound label on the right.
      expect(screen.getAllByText("Today")).toHaveLength(1);
      expect(screen.getByText(/^Today\s*-\s*Evening$/)).toBeInTheDocument();
    });
  });

  describe("Compact variant", () => {
    it("renders a single-line summary without the full header, timeline, or Up Next tile", () => {
      renderWithProviders(
        <CurrentStatus myTeam={1} onChangeTeam={mockOnChangeTeam} variant="compact" />,
      );

      expect(screen.queryByText("Current Status")).not.toBeInTheDocument();
      expect(screen.queryByText("Up Next")).not.toBeInTheDocument();
      expect(screen.getByText("Team 1:")).toBeInTheDocument();
      expect(screen.getByText(/Morning/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /expand status/i })).toBeInTheDocument();
    });

    it("expands to the full card when the expand toggle is clicked", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <CurrentStatus myTeam={1} onChangeTeam={mockOnChangeTeam} variant="compact" />,
      );

      await user.click(screen.getByRole("button", { name: /expand status/i }));

      expect(screen.getByText("Current Status")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /collapse status/i })).toBeInTheDocument();
    });

    it("collapses back to the compact strip when the collapse toggle is clicked", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <CurrentStatus myTeam={1} onChangeTeam={mockOnChangeTeam} variant="compact" />,
      );

      await user.click(screen.getByRole("button", { name: /expand status/i }));
      await user.click(screen.getByRole("button", { name: /collapse status/i }));

      expect(screen.queryByText("Current Status")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /expand status/i })).toBeInTheDocument();
    });
  });

  describe("Date Display", () => {
    it("should display formatted date code", () => {
      renderWithProviders(<CurrentStatus myTeam={1} onChangeTeam={mockOnChangeTeam} />);

      expect(screen.getByText(/Mon 15 Jan/)).toBeInTheDocument();
      expect(formatYYWWD).toHaveBeenCalledWith(expect.any(Object));
    });
  });

  describe("Countdown Display", () => {
    it("should show countdown when next shift start time is available", () => {
      vi.mocked(shiftCalculations.getNextShift).mockReturnValue({
        date: dayjs("2024-01-16"),
        shift: {
          code: "M",
          displayCode: "M",
          emoji: "🌅",
          name: "Morning",
          start: 7,
          end: 15,
          isWorking: true,
          className: "shift-morning",
        },
        code: "2404.2M",
      });

      // Simulate current shift already ended: shiftStart and shiftEnd countdowns expired,
      // so the next shift countdown (first call) is shown.
      const expired = {
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        totalSeconds: 0,
        formatted: "",
        isExpired: true,
      };
      vi.mocked(useCountdownHook.useCountdown)
        .mockReturnValueOnce({
          days: 0,
          hours: 2,
          minutes: 30,
          seconds: 0,
          totalSeconds: 9000,
          formatted: "2h 30m",
          isExpired: false,
        }) // countdown
        .mockReturnValueOnce(expired) // shiftStartCountdown
        .mockReturnValueOnce(expired); // shiftEndCountdown

      renderWithProviders(<CurrentStatus myTeam={1} onChangeTeam={mockOnChangeTeam} />);

      expect(screen.getByText(/Starts in 2h 30m/)).toBeInTheDocument();
    });

    it("should handle night shift countdown correctly", () => {
      vi.mocked(shiftCalculations.getNextShift).mockReturnValue({
        date: dayjs("2024-01-16"),
        shift: {
          code: "N",
          displayCode: "N",
          emoji: "🌙",
          name: "Night",
          start: 23,
          end: 7,
          isWorking: true,
          className: "shift-night",
        },
        code: "2404.2N",
      });

      // Simulate current shift already ended so the next shift countdown is shown.
      const expired = {
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        totalSeconds: 0,
        formatted: "",
        isExpired: true,
      };
      vi.mocked(useCountdownHook.useCountdown)
        .mockReturnValueOnce({
          days: 0,
          hours: 2,
          minutes: 30,
          seconds: 0,
          totalSeconds: 9000,
          formatted: "2h 30m",
          isExpired: false,
        }) // countdown
        .mockReturnValueOnce(expired) // shiftStartCountdown
        .mockReturnValueOnce(expired); // shiftEndCountdown

      renderWithProviders(<CurrentStatus myTeam={1} onChangeTeam={mockOnChangeTeam} />);

      // Should still show countdown
      expect(screen.getByText(/Starts in 2h 30m/)).toBeInTheDocument();
    });

    it("should not show countdown when expired", () => {
      vi.mocked(useCountdownHook.useCountdown).mockReturnValue({
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        totalSeconds: 0,
        formatted: "",
        isExpired: true,
      });

      renderWithProviders(<CurrentStatus myTeam={1} onChangeTeam={mockOnChangeTeam} />);

      expect(screen.queryByText(/Starts in/)).not.toBeInTheDocument();
    });

    it("should not show countdown when no countdown data", () => {
      vi.mocked(shiftCalculations.getNextShift).mockReturnValue({
        date: dayjs("2024-01-16"),
        shift: {
          code: "O",
          displayCode: "O",
          emoji: "☀️",
          name: "Off",
          start: null,
          end: null,
          isWorking: false,
          className: "shift-off",
        },
        code: "2404.2O",
      });

      vi.mocked(useCountdownHook.useCountdown).mockReturnValue({
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        totalSeconds: 0,
        formatted: "",
        isExpired: true,
      });

      renderWithProviders(<CurrentStatus myTeam={1} onChangeTeam={mockOnChangeTeam} />);

      expect(useCountdownHook.useCountdown).toHaveBeenCalledWith(null);
      expect(screen.queryByText(/Starts in/)).not.toBeInTheDocument();
    });
  });

  describe("Edge Cases and Error Handling", () => {
    it("should show fallback when no team is selected", () => {
      renderWithProviders(<CurrentStatus myTeam={null} onChangeTeam={mockOnChangeTeam} />);

      // Should show team selection prompt
      expect(
        screen.getByText(
          "Select your team above for personalized shift tracking and countdown timers",
        ),
      ).toBeInTheDocument();
    });

    it("should show empty state when no teams are currently working", () => {
      vi.mocked(shiftCalculations.getCurrentWorkingTeam).mockReturnValue(null);

      renderWithProviders(<CurrentStatus myTeam={null} onChangeTeam={mockOnChangeTeam} />);

      expect(screen.getByText("No Teams Working")).toBeInTheDocument();
      expect(screen.getByText("All teams are currently off duty")).toBeInTheDocument();
    });

    it("should handle null next shift gracefully", () => {
      vi.mocked(shiftCalculations.getNextShift).mockReturnValue(null);

      renderWithProviders(<CurrentStatus myTeam={1} onChangeTeam={mockOnChangeTeam} />);

      expect(screen.getByText("No upcoming shifts found for your team.")).toBeInTheDocument();
    });

    it("should handle undefined shift start time", () => {
      vi.mocked(shiftCalculations.getNextShift).mockReturnValue({
        date: dayjs("2024-01-16"),
        shift: {
          code: "O",
          displayCode: "O",
          emoji: "☀️",
          name: "Off",
          start: null,
          end: null,
          isWorking: false,
          className: "shift-off",
        },
        code: "2404.2O",
      });

      renderWithProviders(<CurrentStatus myTeam={1} onChangeTeam={mockOnChangeTeam} />);

      // Should not show countdown
      expect(screen.queryByText(/Starts in/)).not.toBeInTheDocument();
    });

    it("should handle different team numbers correctly", () => {
      renderWithProviders(<CurrentStatus myTeam={4} onChangeTeam={mockOnChangeTeam} />);

      expect(screen.getByText("Team 4:")).toBeInTheDocument();
      expect(screen.getAllByText("Morning").length).toBeGreaterThan(0);
      expect(shiftCalculations.calculateShift).toHaveBeenCalledWith(
        expect.any(Object),
        4,
        "5-shift",
      );
    });
  });

  describe("Accessibility", () => {
    it("should have proper button labels and titles when setup needed", () => {
      renderWithProviders(<CurrentStatus myTeam={null} onChangeTeam={mockOnChangeTeam} />);

      const selectTeamButton = screen.getByRole("button", {
        name: /select team/i,
      });
      expect(selectTeamButton).toHaveAttribute("title", "Select your team");
    });
  });

  describe("Component State Management", () => {
    it("should recalculate shifts when team changes", () => {
      const { rerender } = renderWithProviders(
        <CurrentStatus myTeam={1} onChangeTeam={mockOnChangeTeam} />,
      );

      expect(shiftCalculations.calculateShift).toHaveBeenCalledWith(
        expect.any(Object),
        1,
        "5-shift",
      );

      rerender(
        <ToastProvider>
          <SettingsProvider>
            <CurrentStatus myTeam={2} onChangeTeam={mockOnChangeTeam} />
          </SettingsProvider>
        </ToastProvider>,
      );

      expect(shiftCalculations.calculateShift).toHaveBeenCalledWith(
        expect.any(Object),
        2,
        "5-shift",
      );
    });

    it("should use memoized values correctly", () => {
      const { rerender } = renderWithProviders(
        <CurrentStatus myTeam={1} onChangeTeam={mockOnChangeTeam} />,
      );

      const initialCallCount = vi.mocked(shiftCalculations.calculateShift).mock.calls.length;

      // Rerender with same props - should not recalculate
      rerender(
        <ToastProvider>
          <SettingsProvider>
            <CurrentStatus myTeam={1} onChangeTeam={mockOnChangeTeam} />
          </SettingsProvider>
        </ToastProvider>,
      );

      expect(vi.mocked(shiftCalculations.calculateShift)).toHaveBeenCalledTimes(initialCallCount);
    });
  });

  describe("Bootstrap Components Integration", () => {
    it("should render with correct Bootstrap classes", () => {
      renderWithProviders(<CurrentStatus myTeam={1} onChangeTeam={mockOnChangeTeam} />);

      // Check for Bootstrap card structure
      const cardElement = screen.getByText("Current Status").closest(".card");
      expect(cardElement).toBeInTheDocument();
    });

    it("should render badges with correct classes", () => {
      renderWithProviders(<CurrentStatus myTeam={1} onChangeTeam={mockOnChangeTeam} />);

      const shiftBadges = screen.getAllByText("Morning");
      const mainShiftBadge = shiftBadges.find((badge) =>
        badge.classList.contains("shift-badge-lg"),
      );
      expect(mainShiftBadge).toBeTruthy();
      expect(mainShiftBadge).toHaveClass("badge");
      expect(mainShiftBadge).toHaveClass("shift-code");
      expect(mainShiftBadge).toHaveClass("shift-badge-lg");
      expect(screen.getByText("Team 1:")).toBeInTheDocument();
    });
  });
});
