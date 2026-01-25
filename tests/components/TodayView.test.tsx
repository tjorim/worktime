import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { TodayView } from "../../src/components/TodayView";
import { EventStoreProvider } from "../../src/contexts/EventStoreContext";
import { SettingsProvider, useSettings } from "../../src/contexts/SettingsContext";
import { ToastProvider } from "../../src/contexts/ToastContext";
import { dayjs } from "../../src/utils/dateTimeUtils";
import type { ShiftResult } from "../../src/utils/shiftCalculations";
import { getAllTeamsShifts } from "../../src/utils/shiftCalculations";

// Mock today shifts data
const mockTodayShiftsData: ShiftResult[] = [
  {
    teamNumber: 1,
    shift: {
      code: "M",
      emoji: "🌅",
      name: "🌅 Morning",
      hours: "07:00-15:00",
      start: 7,
      end: 15,
      isWorking: true,
      className: "shift-morning",
    },
    date: dayjs("2025-01-15"),
    code: "2503.3M",
  },
  {
    teamNumber: 2,
    shift: {
      code: "L",
      emoji: "🌆",
      name: "🌆 Evening",
      hours: "15:00-23:00",
      start: 15,
      end: 23,
      isWorking: true,
      className: "shift-late",
    },
    date: dayjs("2025-01-15"),
    code: "2503.3L",
  },
  {
    teamNumber: 3,
    shift: {
      code: "O",
      emoji: "🏠",
      name: "🏠 Off",
      hours: "",
      start: null,
      end: null,
      isWorking: false,
      className: "shift-off",
    },
    date: dayjs("2025-01-15"),
    code: "2503.3O",
  },
];

// Mock shift calculation utilities
vi.mock("../../src/utils/shiftCalculations", () => ({
  getAllTeamsShifts: vi.fn(() => mockTodayShiftsData),
  getShiftByCode: vi.fn(() => ({
    code: "M",
    emoji: "🌅",
    name: "Morning",
    hours: "07:00-15:00",
    start: 7,
    end: 15,
    isWorking: true,
    className: "shift-morning",
  })),
  getShiftDisplay: vi.fn((shift) => {
    // Apply 5-shift roster display overrides
    if (shift.code === "L") {
      return {
        displayName: "Evening",
        displayHours: shift.hours,
        displayCode: "E",
      };
    }
    return {
      displayName: shift.name,
      displayHours: shift.hours,
      displayCode: shift.code,
    };
  }),
  getFormattedShiftTime: vi.fn(() => "07:00-15:00"),
  isCurrentlyWorking: vi.fn(() => false),
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <ToastProvider>
      <SettingsProvider>
        <EventStoreProvider>{ui}</EventStoreProvider>
      </SettingsProvider>
    </ToastProvider>,
  );
}

const defaultProps = {
  myTeam: 1,
  currentDate: dayjs("2025-01-15"),
  onPreviousDay: vi.fn(),
  onNextDay: vi.fn(),
  onTodayClick: vi.fn(),
};

describe("TodayView", () => {
  describe("Basic rendering", () => {
    it("renders today view with shifts", () => {
      renderWithProviders(<TodayView {...defaultProps} />);

      expect(screen.getByText("Today")).toBeInTheDocument();
      expect(screen.getByText("Team 1")).toBeInTheDocument();
      expect(screen.getByText("Team 2")).toBeInTheDocument();
      expect(screen.getByText("Team 3")).toBeInTheDocument();
    });

    it("displays shift information for working teams", () => {
      renderWithProviders(<TodayView {...defaultProps} />);

      expect(screen.getByText(/Morning/)).toBeInTheDocument();
      expect(screen.getByText(/Evening/)).toBeInTheDocument();
      expect(screen.getByText(/Off/)).toBeInTheDocument();
      expect(screen.getByText(/Not working today/)).toBeInTheDocument();
    });

    it("shows Today button", () => {
      renderWithProviders(<TodayView {...defaultProps} />);
      expect(screen.getByText("Today")).toBeInTheDocument();
    });
  });

  describe("Team highlighting", () => {
    it("highlights my team", () => {
      renderWithProviders(<TodayView {...defaultProps} myTeam={1} />);

      // The my team should have my-team class on the div element
      const team1Element = screen.getByText("Team 1").closest(".my-team");
      expect(team1Element).toBeInTheDocument();
    });

    it("handles no my team", () => {
      renderWithProviders(<TodayView {...defaultProps} myTeam={null} />);

      // Should render without errors
      expect(screen.getByText("Team 1")).toBeInTheDocument();
    });
  });

  describe("Today button functionality", () => {
    it("calls onTodayClick when Today button is clicked", async () => {
      const user = userEvent.setup();
      const mockOnTodayClick = vi.fn();

      renderWithProviders(<TodayView {...defaultProps} onTodayClick={mockOnTodayClick} />);

      const todayButton = screen.getByRole("button", { name: /today/i });
      await user.click(todayButton);

      expect(mockOnTodayClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("Empty state", () => {
    it("handles empty shifts array", () => {
      // Override the mock to return empty array for this test
      vi.mocked(getAllTeamsShifts).mockReturnValueOnce([]);

      renderWithProviders(<TodayView {...defaultProps} />);

      // Should still render the header
      expect(screen.getByText(/All Teams|Schedule/)).toBeInTheDocument();
    });
  });

  describe("Shift display", () => {
    it("shows shift names for working shifts", () => {
      renderWithProviders(<TodayView {...defaultProps} />);

      // Should show shift names
      expect(screen.getByText(/Morning/)).toBeInTheDocument();
      expect(screen.getByText(/Evening/)).toBeInTheDocument();
    });

    it("shows off status for non-working teams", () => {
      renderWithProviders(<TodayView {...defaultProps} />);

      expect(screen.getByText(/🏠 Off/)).toBeInTheDocument();
      expect(screen.getByText(/Not working today/)).toBeInTheDocument();
    });

    // Note: Active badge functionality exists but requires complex time mocking
    // The isCurrentlyActive function in TodayView checks if current time is within shift hours
    // Testing this would require mocking dayjs() calls throughout the component

    it("does not show active badge for off shifts", () => {
      renderWithProviders(<TodayView {...defaultProps} />);

      // Team 3 is off, so should never show active badge
      const offTeamBadges = screen.getAllByText(/🏠 Off/);
      expect(offTeamBadges.length).toBeGreaterThan(0);
      expect(screen.queryByText("Active")).not.toBeInTheDocument();
    });
  });

  describe("Cross-schedule viewing", () => {
    it("renders schedule selector dropdown with available schedules", () => {
      renderWithProviders(<TodayView {...defaultProps} />);

      // Should have a schedule selector
      const selector = screen.getByLabelText(/View schedule:/i);
      expect(selector).toBeInTheDocument();
      expect(selector).toBeInstanceOf(HTMLSelectElement);
    });

    it("shows current schedule as selected option", () => {
      renderWithProviders(<TodayView {...defaultProps} />);

      const selector = screen.getByLabelText(/View schedule:/i) as HTMLSelectElement;
      // Default schedule type is "9-5" in SettingsContext default
      expect(selector.value).toBe("9-5");
    });

    it("updates displayed shifts when schedule type changes", async () => {
      const user = userEvent.setup();
      const mockNineToFiveShifts: ShiftResult[] = [
        {
          teamNumber: 1,
          shift: {
            code: "D",
            emoji: "💼",
            name: "💼 Day",
            hours: "09:00-17:00",
            start: 9,
            end: 17,
            isWorking: true,
            className: "shift-day",
          },
          date: dayjs("2025-01-15"),
          code: "2503.3D",
        },
      ];

      // Mock getAllTeamsShifts to return different data on second call
      vi.mocked(getAllTeamsShifts)
        .mockReturnValueOnce(mockTodayShiftsData) // First render
        .mockReturnValueOnce(mockNineToFiveShifts); // After schedule change

      renderWithProviders(<TodayView {...defaultProps} />);

      // Initially showing 5-shift teams
      expect(screen.getByText("Team 1")).toBeInTheDocument();
      expect(screen.getByText("Team 2")).toBeInTheDocument();

      // Change schedule to 9-5
      const selector = screen.getByLabelText(/View schedule:/i);
      await user.selectOptions(selector, "9-5");

      // getAllTeamsShifts should be called with new schedule type
      expect(getAllTeamsShifts).toHaveBeenCalledWith(
        expect.anything(),
        "9-5",
      );
    });

    it("displays multiple schedule options to choose from", () => {
      renderWithProviders(<TodayView {...defaultProps} />);

      const selector = screen.getByLabelText(/View schedule:/i) as HTMLSelectElement;
      const options = Array.from(selector.options);

      // Should have multiple schedule options available
      expect(options.length).toBeGreaterThan(0);

      // Each option should have a value and title
      options.forEach((option) => {
        expect(option.value).toBeTruthy();
        expect(option.text).toBeTruthy();
      });
    });

    it("syncs dropdown with user schedule after onboarding (bug fix)", async () => {
      // This test validates the fix for the issue where the dropdown shows the wrong
      // schedule after onboarding completes. The dropdown should automatically update
      // when the user's schedule changes while the component remains mounted.
      
      // Start with 9-5 schedule in localStorage
      window.localStorage.setItem(
        "worktime_user_state",
        JSON.stringify({
          hasCompletedOnboarding: true,
          myTeam: null,
          scheduleType: "9-5",
          settings: {
            timeFormat: "24h",
            theme: "auto",
            notifications: "off",
            vacationAllowance: { amount: 0, unit: "days", hoursPerDay: 8 },
          },
        }),
      );

      // Create a test component that allows us to trigger schedule changes
      let triggerScheduleChange: (() => void) | null = null;
      function TestWrapper() {
        const { setScheduleType } = useSettings();
        triggerScheduleChange = () => setScheduleType("5-shift");
        return <TodayView {...defaultProps} />;
      }

      render(
        <ToastProvider>
          <SettingsProvider>
            <EventStoreProvider>
              <TestWrapper />
            </EventStoreProvider>
          </SettingsProvider>
        </ToastProvider>,
      );

      const selector = screen.getByLabelText(/View schedule:/i) as HTMLSelectElement;
      
      // Initial state: schedule is "9-5"
      expect(selector.value).toBe("9-5");

      // Simulate onboarding completion by changing the schedule while component is mounted
      // This is what happens when the user completes onboarding - the context updates
      // but TodayView remains mounted
      await act(async () => {
        triggerScheduleChange?.();
      });

      // The dropdown should now show "5-shift" to match the user's schedule
      // WITHOUT needing to unmount/remount the component
      expect(selector.value).toBe("5-shift");

      // Cleanup
      window.localStorage.removeItem("worktime_user_state");
    });
  });
});
