import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { TodayView } from "@/components/schedule/TodayView";
import { EventStoreProvider } from "@/contexts/EventStoreContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { dayjs } from "@/utils/dateTimeUtils";
import type { ShiftResult } from "@/utils/shiftCalculations";
import { getAllTeamsShifts } from "@/utils/shiftCalculations";

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
vi.mock("@/utils/shiftCalculations", () => ({
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
  viewingScheduleType: "5-shift" as const,
  userScheduleType: "5-shift" as const,
  onViewingScheduleTypeChange: vi.fn(),
};

describe("TodayView", () => {
  describe("Basic rendering", () => {
    it("renders today view with shifts", () => {
      renderWithProviders(<TodayView {...defaultProps} />);

      expect(screen.getByText("Today")).toBeInTheDocument();
      expect(screen.getAllByText("Team 1")).not.toHaveLength(0);
      expect(screen.getAllByText("Team 2")).not.toHaveLength(0);
      expect(screen.getAllByText("Team 3")).not.toHaveLength(0);
    });

    it("displays shift information for working teams", () => {
      renderWithProviders(<TodayView {...defaultProps} />);

      expect(screen.getAllByText(/Morning/)).not.toHaveLength(0);
      expect(screen.getAllByText(/Evening/)).not.toHaveLength(0);
      expect(screen.getAllByText(/Off/)).not.toHaveLength(0);
      expect(screen.getAllByText(/Not working today/)).not.toHaveLength(0);
    });
  });

  describe("Team highlighting", () => {
    it("highlights my team", () => {
      renderWithProviders(<TodayView {...defaultProps} myTeam={1} />);

      // The my team should have my-team class on the div element
      const team1Element = screen.getAllByText("Team 1")[0]?.closest(".my-team");
      expect(team1Element).toBeInTheDocument();
    });

    it("handles no my team", () => {
      renderWithProviders(<TodayView {...defaultProps} myTeam={null} />);

      // Should render without errors
      expect(screen.getAllByText("Team 1")).not.toHaveLength(0);
    });
  });

  describe("Mobile team carousel", () => {
    it("keeps swipe navigation separate from the desktop team grid", async () => {
      const user = userEvent.setup();
      const { container } = renderWithProviders(<TodayView {...defaultProps} />);

      expect(container.querySelector(".team-mobile-carousel")).toBeInTheDocument();
      expect(container.querySelector(".d-none.d-sm-flex")).toBeInTheDocument();
      expect(screen.getByText("Team 1 of 3")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Show next team" }));

      expect(screen.getByText("Team 2 of 3")).toBeInTheDocument();
    });
  });

  describe("Schedule selector", () => {
    it("shows a select-schedule hint instead of team cards when no schedule is chosen", () => {
      renderWithProviders(
        <TodayView {...defaultProps} viewingScheduleType={null} userScheduleType={null} />,
      );

      expect(
        screen.getByText("Select a schedule to view the team lineup and shift details."),
      ).toBeInTheDocument();
      expect(screen.queryByText("Team 1")).not.toBeInTheDocument();
    });

    it("calls onViewingScheduleTypeChange when the schedule selector changes", async () => {
      const user = userEvent.setup();
      const onViewingScheduleTypeChange = vi.fn();
      renderWithProviders(
        <TodayView {...defaultProps} onViewingScheduleTypeChange={onViewingScheduleTypeChange} />,
      );

      const selector = screen.getByLabelText(/View schedule:/i);
      await user.selectOptions(selector, "9-5");

      expect(onViewingScheduleTypeChange).toHaveBeenCalledWith("9-5");
    });

    it("marks the user's own schedule in the selector options", () => {
      renderWithProviders(<TodayView {...defaultProps} userScheduleType="9-5" />);

      const selector = screen.getByLabelText(/View schedule:/i) as HTMLSelectElement;
      const option = Array.from(selector.options).find((opt) => opt.value === "9-5");
      expect(option?.text).toContain("Your schedule");
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
      expect(screen.getAllByText(/Morning/)).not.toHaveLength(0);
      expect(screen.getAllByText(/Evening/)).not.toHaveLength(0);
    });

    it("shows off status for non-working teams", () => {
      renderWithProviders(<TodayView {...defaultProps} />);

      expect(screen.getAllByText(/🏠 Off/)).not.toHaveLength(0);
      expect(screen.getAllByText(/Not working today/)).not.toHaveLength(0);
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
