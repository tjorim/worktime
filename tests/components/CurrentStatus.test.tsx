import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CurrentStatus } from "../../src/components/CurrentStatus";
import { SettingsProvider } from "../../src/contexts/SettingsContext";
import { ToastProvider } from "../../src/contexts/ToastContext";
import * as useCountdownHook from "../../src/hooks/useCountdown";
import { dayjs, formatYYWWD } from "../../src/utils/dateTimeUtils";
import * as shiftCalculations from "../../src/utils/shiftCalculations";

// Mock useSettings to provide scheduleType
vi.mock("../../src/contexts/SettingsContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/contexts/SettingsContext")>();
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
vi.mock("../../src/utils/shiftCalculations", () => ({
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

vi.mock("../../src/hooks/useCountdown", () => ({
  useCountdown: vi.fn(),
}));

vi.mock("../../src/utils/dateTimeUtils", async (importOriginal) => {
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
      renderWithProviders(<CurrentStatus myTeam={null} onChangeTeam={mockOnChangeTeam} />);

      expect(screen.getByText("1 working, 1 off")).toBeInTheDocument();
    });

    it("should hide generic shift countdown and progress after countdown expires", () => {
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

      vi.mocked(useCountdownHook.useCountdown)
        .mockReturnValueOnce(activeCountdown)
        .mockReturnValueOnce(activeCountdown)
        .mockReturnValueOnce(activeCountdown)
        .mockReturnValueOnce(expiredCountdown);

      const { rerender } = renderWithProviders(
        <CurrentStatus myTeam={null} onChangeTeam={mockOnChangeTeam} />,
      );

      expect(screen.getByText(/^Ends in/)).toBeInTheDocument();
      expect(
        screen.getByLabelText(/Shift progress with \d+ hours and \d+ minutes remaining/),
      ).toBeInTheDocument();

      rerender(
        <ToastProvider>
          <SettingsProvider>
            <CurrentStatus myTeam={null} onChangeTeam={mockOnChangeTeam} />
          </SettingsProvider>
        </ToastProvider>,
      );

      expect(screen.queryByText(/^Ends in/)).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText(/Shift progress with \d+ hours and \d+ minutes remaining/),
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
