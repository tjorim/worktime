import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { WeekView } from "@/components/schedule/WeekView";
import { EventStoreProvider } from "@/contexts/EventStoreContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { dayjs } from "@/utils/dateTimeUtils";

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
    })),
  };
});

// Mock the dependencies
vi.mock("@/hooks/useKeyboardShortcuts", () => ({
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock("@/utils/dateTimeUtils", () => {
  return {
    dayjs: vi.fn(() => {
      return {
        startOf: vi.fn(() => ({
          add: vi.fn(() => {
            return {
              format: vi.fn(() => "13-STATIC"),
              isSame: vi.fn(() => false),
              isoWeek: vi.fn(() => 20),
              isoWeekday: vi.fn(() => 1),
              toDate: vi.fn(() => new Date(2025, 0, 13)),
            };
          }),
          format: vi.fn(() => "Jan 13"),
          isSame: vi.fn(() => false),
          isoWeekYear: vi.fn(() => 2025),
        })),
        format: vi.fn(() => "2025-01-15"),
        add: vi.fn(() => {
          return {
            format: vi.fn(() => "18-STATIC"),
            toDate: vi.fn(() => new Date(2025, 0, 18)),
          };
        }),
        subtract: vi.fn(() => ({
          format: vi.fn(() => "Jan 12"),
          toDate: vi.fn(() => new Date(2025, 0, 12)),
        })),
        toDate: vi.fn(() => new Date(2025, 0, 15)),
      };
    }),
    formatYYWWD: vi.fn((_date: string) => "2503.1"),
    getISOWeekYear2Digit: vi.fn(() => "25"),
    getLocalizedShiftTime: vi.fn(() => "07:00–15:00"),
  };
});

vi.mock("@/utils/shiftCalculations", () => ({
  calculateShift: vi.fn(() => ({
    code: "M",
    displayCode: "M",
    emoji: "🌅",
    name: "Morning",
    start: 7,
    end: 15,
    isWorking: true,
    className: "shift-morning",
  })),
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
  getFormattedShiftTime: vi.fn(() => "07:00–15:00"),
}));

const defaultProps = {
  myTeam: 1,
  currentDate: dayjs("2025-01-15"),
  setCurrentDate: vi.fn(),
};

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <ToastProvider>
      <SettingsProvider>
        <EventStoreProvider>{ui}</EventStoreProvider>
      </SettingsProvider>
    </ToastProvider>,
  );
}

describe("WeekView", () => {
  describe("Basic rendering", () => {
    it("renders schedule overview header", () => {
      renderWithProviders(<WeekView {...defaultProps} />);
      expect(screen.getByText("All Teams")).toBeInTheDocument();
    });

    it("displays navigation buttons", () => {
      renderWithProviders(<WeekView {...defaultProps} />);

      expect(screen.getByLabelText("Go to previous week")).toBeInTheDocument();
      expect(screen.getByText("This Week")).toBeInTheDocument();
      expect(screen.getByLabelText("Go to next week")).toBeInTheDocument();
    });

    it("shows date picker", () => {
      renderWithProviders(<WeekView {...defaultProps} />);

      const dateInput = screen.getByDisplayValue("2025-01-15");
      expect(dateInput).toBeInTheDocument();
    });

    it("displays team headers", () => {
      renderWithProviders(<WeekView {...defaultProps} />);

      expect(screen.getByText("Team 1")).toBeInTheDocument();
      expect(screen.getByText("Team 2")).toBeInTheDocument();
      expect(screen.getByText("Team 3")).toBeInTheDocument();
      expect(screen.getByText("Team 4")).toBeInTheDocument();
      expect(screen.getByText("Team 5")).toBeInTheDocument();
    });
  });

  describe("Navigation", () => {
    it("calls setCurrentDate when previous button clicked", async () => {
      const user = userEvent.setup();
      const mockSetCurrentDate = vi.fn();

      renderWithProviders(<WeekView {...defaultProps} setCurrentDate={mockSetCurrentDate} />);

      const prevButton = screen.getByLabelText("Go to previous week");
      await user.click(prevButton);

      expect(mockSetCurrentDate).toHaveBeenCalled();
    });

    it("calls setCurrentDate when next button clicked", async () => {
      const user = userEvent.setup();
      const mockSetCurrentDate = vi.fn();

      renderWithProviders(<WeekView {...defaultProps} setCurrentDate={mockSetCurrentDate} />);

      const nextButton = screen.getByLabelText("Go to next week");
      await user.click(nextButton);

      expect(mockSetCurrentDate).toHaveBeenCalled();
    });

    it("calls setCurrentDate when this week button clicked", async () => {
      const user = userEvent.setup();
      const mockSetCurrentDate = vi.fn();

      renderWithProviders(<WeekView {...defaultProps} setCurrentDate={mockSetCurrentDate} />);

      const thisWeekButton = screen.getByLabelText("Go to current week");
      await user.click(thisWeekButton);

      expect(mockSetCurrentDate).toHaveBeenCalled();
    });
  });

  describe("Schedule table", () => {
    it("displays schedule table", () => {
      renderWithProviders(<WeekView {...defaultProps} />);

      const table = screen.getByRole("table");
      expect(table).toBeInTheDocument();
    });

    it("shows day codes", () => {
      renderWithProviders(<WeekView {...defaultProps} />);

      // Should show formatted date codes
      const dateCodes = screen.getAllByText("2503.1");
      expect(dateCodes.length).toBeGreaterThan(0);
    });
  });

  describe("Team highlighting", () => {
    it("highlights my team when provided", () => {
      renderWithProviders(<WeekView {...defaultProps} myTeam={2} />);

      // The my team row should have my-team class
      const team2Element = screen.getByText("Team 2");
      const teamRow = team2Element.closest("tr");
      expect(teamRow).toHaveClass("my-team");
    });

    it("handles no my team", () => {
      renderWithProviders(<WeekView {...defaultProps} myTeam={null} />);

      // Should render without errors
      expect(screen.getByText("Team 1")).toBeInTheDocument();
    });
  });

  describe("Week display", () => {
    it("shows week information", () => {
      renderWithProviders(<WeekView {...defaultProps} currentDate={dayjs("2025-01-15")} />);

      // Should show week number context
      expect(screen.getAllByText(/Week\s+\d+/).length).toBeGreaterThan(0);
    });
  });
});
