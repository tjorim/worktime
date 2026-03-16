import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vite-plus/test";
import { TodayView } from "../../src/components/schedule/TodayView";
import { EventStoreProvider } from "../../src/contexts/EventStoreContext";
import { SettingsProvider } from "../../src/contexts/SettingsContext";
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
      displayCode: "M",
      emoji: "🌅",
      name: "🌅 Morning",
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
      displayCode: "E",
      emoji: "🌆",
      name: "🌆 Evening",
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
      displayCode: "O",
      emoji: "🏠",
      name: "🏠 Off",
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
  getShift: vi.fn(() => ({
    code: "M",
    displayCode: "M",
    emoji: "🌅",
    name: "Morning",
    start: 7,
    end: 15,
    isWorking: true,
    className: "shift-morning",
  })),
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
  onDateSelect: vi.fn(),
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

  describe("Date selector", () => {
    it("calls onDateSelect when direct date selector changes", async () => {
      const onDateSelect = vi.fn();
      renderWithProviders(<TodayView {...defaultProps} onDateSelect={onDateSelect} />);

      const dateInput = screen.getByLabelText(/Jump to date/i);
      fireEvent.change(dateInput, { target: { value: "2025-01-20" } });

      expect(onDateSelect).toHaveBeenCalled();
      const selected = onDateSelect.mock.calls.at(-1)?.[0];
      expect(selected?.format("YYYY-MM-DD")).toBe("2025-01-20");
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
});
