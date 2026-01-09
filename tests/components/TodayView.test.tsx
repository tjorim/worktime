import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { TodayView } from "../../src/components/TodayView";
import { EventStoreProvider } from "../../src/contexts/EventStoreContext";
import { SettingsProvider } from "../../src/contexts/SettingsContext";
import { ToastProvider } from "../../src/contexts/ToastContext";
import { dayjs } from "../../src/utils/dateTimeUtils";
import type { ShiftResult } from "../../src/utils/shiftCalculations";

// Mock shift calculation utilities
vi.mock("../../src/utils/shiftCalculations", () => ({
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
  getShiftDisplay: vi.fn((shift) => ({
    displayName: shift.name,
    displayHours: shift.hours,
  })),
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

const mockTodayShifts: ShiftResult[] = [
  {
    teamNumber: 1,
    shift: {
      code: "M",
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
      code: "E",
      name: "🌆 Evening",
      hours: "15:00-23:00",
      start: 15,
      end: 23,
      isWorking: true,
      className: "shift-evening",
    },
    date: dayjs("2025-01-15"),
    code: "2503.3E",
  },
  {
    teamNumber: 3,
    shift: {
      code: "O",
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

const defaultProps = {
  todayShifts: mockTodayShifts,
  myTeam: 1,
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

      expect(screen.getByText(/🌅 Morning/)).toBeInTheDocument();
      expect(screen.getByText(/🌆 Evening/)).toBeInTheDocument();
      expect(screen.getByText(/🏠 Off/)).toBeInTheDocument();
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
      renderWithProviders(<TodayView {...defaultProps} todayShifts={[]} />);

      // Should still render the Today header
      expect(screen.getByText("Today")).toBeInTheDocument();
    });
  });

  describe("Shift display", () => {
    it("shows shift names for working shifts", () => {
      renderWithProviders(<TodayView {...defaultProps} />);

      // Should show shift names
      expect(screen.getByText(/🌅 Morning/)).toBeInTheDocument();
      expect(screen.getByText(/🌆 Evening/)).toBeInTheDocument();
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
});
