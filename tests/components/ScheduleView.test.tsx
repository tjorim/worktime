import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { ScheduleView } from "../../src/components/schedule/ScheduleView";
import { EventStoreProvider } from "../../src/contexts/EventStoreContext";
import { SettingsProvider } from "../../src/contexts/SettingsContext";
import { ToastProvider } from "../../src/contexts/ToastContext";
import { dayjs } from "../../src/utils/dateTimeUtils";

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
        vacationAllowance: { amount: 0, unit: "days", hoursPerDay: 8 },
      },
      scheduleType: "5-shift",
    })),
  };
});

// Mock the dependencies
vi.mock("../../src/hooks/useKeyboardShortcuts", () => ({
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock("../../src/utils/dateTimeUtils", () => {
  let callCount = 0;
  return {
    dayjs: vi.fn(() => {
      callCount++;
      return {
        startOf: vi.fn(() => ({
          add: vi.fn(() => {
            const uniqueDay = 13 + (callCount % 7);
            return {
              format: vi.fn(() => `${uniqueDay}-${Date.now()}-${Math.random()}`),
              isSame: vi.fn(() => false),
              isoWeek: vi.fn(() => 20),
              isoWeekday: vi.fn(() => (callCount % 7) + 1),
              toDate: vi.fn(() => new Date(2025, 0, uniqueDay)),
            };
          }),
          format: vi.fn(() => "Jan 13"),
          isSame: vi.fn(() => false),
        })),
        format: vi.fn(() => "2025-01-15"),
        add: vi.fn(() => {
          const uniqueDay = 18 + (callCount % 7);
          return {
            format: vi.fn(() => `${uniqueDay}-${Date.now()}-${Math.random()}`),
            toDate: vi.fn(() => new Date(2025, 0, uniqueDay)),
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

vi.mock("../../src/utils/shiftCalculations", () => ({
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

describe("ScheduleView", () => {
  describe("Basic rendering", () => {
    it("renders schedule overview header", () => {
      renderWithProviders(<ScheduleView {...defaultProps} />);
      expect(screen.getByText("📅 Schedule Overview")).toBeInTheDocument();
    });

    it("displays navigation buttons", () => {
      renderWithProviders(<ScheduleView {...defaultProps} />);

      expect(screen.getByLabelText("Go to previous week")).toBeInTheDocument();
      expect(screen.getByText("This Week")).toBeInTheDocument();
      expect(screen.getByLabelText("Go to next week")).toBeInTheDocument();
    });

    it("shows date picker", () => {
      renderWithProviders(<ScheduleView {...defaultProps} />);

      const dateInput = screen.getByDisplayValue("2025-01-15");
      expect(dateInput).toBeInTheDocument();
    });

    it("displays team headers", () => {
      renderWithProviders(<ScheduleView {...defaultProps} />);

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

      renderWithProviders(<ScheduleView {...defaultProps} setCurrentDate={mockSetCurrentDate} />);

      const prevButton = screen.getByLabelText("Go to previous week");
      await user.click(prevButton);

      expect(mockSetCurrentDate).toHaveBeenCalled();
    });

    it("calls setCurrentDate when next button clicked", async () => {
      const user = userEvent.setup();
      const mockSetCurrentDate = vi.fn();

      renderWithProviders(<ScheduleView {...defaultProps} setCurrentDate={mockSetCurrentDate} />);

      const nextButton = screen.getByLabelText("Go to next week");
      await user.click(nextButton);

      expect(mockSetCurrentDate).toHaveBeenCalled();
    });

    it("calls setCurrentDate when this week button clicked", async () => {
      const user = userEvent.setup();
      const mockSetCurrentDate = vi.fn();

      renderWithProviders(<ScheduleView {...defaultProps} setCurrentDate={mockSetCurrentDate} />);

      const thisWeekButton = screen.getByLabelText("Go to current week");
      await user.click(thisWeekButton);

      expect(mockSetCurrentDate).toHaveBeenCalled();
    });
  });

  describe("Schedule table", () => {
    it("displays schedule table", () => {
      renderWithProviders(<ScheduleView {...defaultProps} />);

      const table = screen.getByRole("table");
      expect(table).toBeInTheDocument();
    });

    it("shows day codes", () => {
      renderWithProviders(<ScheduleView {...defaultProps} />);

      // Should show formatted date codes
      const dateCodes = screen.getAllByText("2503.1");
      expect(dateCodes.length).toBeGreaterThan(0);
    });
  });

  describe("Team highlighting", () => {
    it("highlights my team when provided", () => {
      renderWithProviders(<ScheduleView {...defaultProps} myTeam={2} />);

      // The my team row should have my-team class
      const team2Element = screen.getByText("Team 2");
      const teamRow = team2Element.closest("tr");
      expect(teamRow).toHaveClass("my-team");
    });

    it("handles no my team", () => {
      renderWithProviders(<ScheduleView {...defaultProps} myTeam={null} />);

      // Should render without errors
      expect(screen.getByText("Team 1")).toBeInTheDocument();
    });
  });

  describe("Week display", () => {
    it("shows week information", () => {
      renderWithProviders(<ScheduleView {...defaultProps} currentDate={dayjs("2025-01-15")} />);

      // Should show week range (Jan 15 is in the week of Jan 13-19)
      expect(screen.getByText(/Week of/)).toBeInTheDocument();
      expect(screen.getByText(/Jan 13/)).toBeInTheDocument();
    });
  });
});
