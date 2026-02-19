import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransferView } from "../../src/components/TransferView";
import { SettingsProvider } from "../../src/contexts/SettingsContext";
import { useTransferCalculations } from "../../src/hooks/useTransferCalculations";
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

function renderWithProviders(ui: React.ReactElement) {
  return render(<SettingsProvider>{ui}</SettingsProvider>);
}

// Mock the useTransferCalculations hook
vi.mock("../../src/hooks/useTransferCalculations", () => ({
  useTransferCalculations: vi.fn(),
}));

const mockUseTransferCalculations = vi.mocked(useTransferCalculations);

vi.mock("../../src/utils/shiftCalculations", () => ({
  getShift: vi.fn((code) => {
    const shifts: Record<
      string,
      {
        code: string;
        displayCode: string;
        emoji: string;
        name: string;
        start: number;
        end: number;
        isWorking: boolean;
        className: string;
      }
    > = {
      M: {
        code: "M",
        displayCode: "M",
        emoji: "🌅",
        name: "Morning",
        start: 7,
        end: 15,
        isWorking: true,
        className: "shift-morning",
      },
      L: {
        code: "L",
        displayCode: "E",
        emoji: "🌆",
        name: "Evening",
        start: 15,
        end: 23,
        isWorking: true,
        className: "shift-late",
      },
      N: {
        code: "N",
        displayCode: "N",
        emoji: "🌙",
        name: "Night",
        start: 23,
        end: 7,
        isWorking: true,
        className: "shift-night",
      },
    };
    return shifts[code] || shifts.M;
  }),
  getFormattedShiftTime: vi.fn(() => "07:00–15:00"),
}));

vi.mock("../../src/utils/config", () => ({
  CONFIG: {
    TEAMS_COUNT: 5,
  },
}));

let mockConsoleWarn: ReturnType<typeof vi.spyOn>;

// Default hook return value
const defaultHookReturn = {
  transfers: [],
  hasMoreTransfers: false,
  totalTransfers: 0,
  availableOtherTeams: [2, 3, 4, 5],
  otherTeam: 2,
  setOtherTeam: vi.fn(),
  validatedMyTeam: 1, // Add validated team
};

const defaultProps = {
  myTeam: 1,
};

describe("TransferView", () => {
  beforeEach(() => {
    mockUseTransferCalculations.mockReturnValue(defaultHookReturn);
    mockConsoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    mockConsoleWarn.mockRestore();
  });

  describe("Basic rendering", () => {
    it("renders transfer view header", () => {
      renderWithProviders(<TransferView {...defaultProps} />);
      expect(screen.getByText("Team Transfers")).toBeInTheDocument();
    });

    it("shows team comparison controls when team is selected", () => {
      renderWithProviders(<TransferView {...defaultProps} myTeam={1} />);
      expect(screen.getByText(/View transfers with Team/i)).toBeInTheDocument();
      expect(screen.getByText(/Filter by custom date range/i)).toBeInTheDocument();
    });

    it("shows team selection prompt when no team selected", () => {
      mockUseTransferCalculations.mockReturnValue({
        ...defaultHookReturn,
        transfers: [],
        validatedMyTeam: null, // Set validated team to null
      });

      renderWithProviders(<TransferView {...defaultProps} myTeam={null} />);
      expect(screen.getByText(/Please select your team/)).toBeInTheDocument();
    });

    it("shows team selector shortcut when no team selected and handler provided", async () => {
      const user = userEvent.setup();
      const handleChangeTeam = vi.fn();
      mockUseTransferCalculations.mockReturnValue({
        ...defaultHookReturn,
        transfers: [],
        validatedMyTeam: null, // Set validated team to null
      });

      renderWithProviders(
        <TransferView {...defaultProps} myTeam={null} onChangeTeam={handleChangeTeam} />,
      );

      const button = screen.getByRole("button", { name: /Select Team/i });
      expect(button).toBeInTheDocument();

      await user.click(button);
      expect(handleChangeTeam).toHaveBeenCalled();
    });
  });

  describe("Team comparison UI", () => {
    it("displays team comparison dropdown with available teams", () => {
      renderWithProviders(<TransferView {...defaultProps} />);

      const otherTeamSelect = screen.getByLabelText(/View transfers with Team/i);
      expect(otherTeamSelect).toBeInTheDocument();
      expect(otherTeamSelect).toHaveValue("2"); // From mock hook

      // Check that available teams are rendered
      expect(screen.getAllByText(/Team 2/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Team 3/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Team 4/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Team 5/).length).toBeGreaterThan(0);
    });

    it("calls setOtherTeam when user selects different team", async () => {
      const mockSetOtherTeam = vi.fn();
      mockUseTransferCalculations.mockReturnValue({
        ...defaultHookReturn,
        setOtherTeam: mockSetOtherTeam,
      });

      const user = userEvent.setup();
      renderWithProviders(<TransferView {...defaultProps} />);

      const otherTeamSelect = screen.getByLabelText("View transfers with Team:");
      await user.selectOptions(otherTeamSelect, "3");

      expect(mockSetOtherTeam).toHaveBeenCalledWith(3);
    });
  });

  describe("Date range selection UI", () => {
    it("displays date range dropdown with options", () => {
      renderWithProviders(<TransferView {...defaultProps} />);

      const filterCheckbox = screen.getByLabelText(/Filter by custom date range/i);
      expect(filterCheckbox).toBeInTheDocument();
      expect(filterCheckbox).not.toBeChecked();
    });

    it("toggles custom date range when checkbox is clicked", async () => {
      const user = userEvent.setup();
      renderWithProviders(<TransferView {...defaultProps} />);

      const filterCheckbox = screen.getByLabelText(/Filter by custom date range/i);

      // Initially unchecked
      expect(filterCheckbox).not.toBeChecked();

      // Click to enable custom range
      await user.click(filterCheckbox);
      expect(filterCheckbox).toBeChecked();

      // Date inputs should now be visible
      expect(screen.getByLabelText(/Start Date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/End Date/i)).toBeInTheDocument();
    });

    it("updates date inputs when user changes custom dates", async () => {
      const user = userEvent.setup();
      renderWithProviders(<TransferView {...defaultProps} />);

      // Enable custom range
      const filterCheckbox = screen.getByLabelText(/Filter by custom date range/i);
      await user.click(filterCheckbox);

      // Test start date input
      const startDateInput = screen.getByLabelText(/Start Date/i);
      await user.type(startDateInput, "2025-01-01");
      expect(startDateInput).toHaveValue("2025-01-01");

      // Test end date input
      const endDateInput = screen.getByLabelText(/End Date/i);
      await user.type(endDateInput, "2025-01-31");
      expect(endDateInput).toHaveValue("2025-01-31");
    });

    it("clears date inputs when clear button is clicked", async () => {
      const user = userEvent.setup();
      renderWithProviders(<TransferView {...defaultProps} />);

      // Enable custom range
      const filterCheckbox = screen.getByLabelText(/Filter by custom date range/i);
      await user.click(filterCheckbox);

      // Set some dates
      const startDateInput = screen.getByLabelText(/Start Date/i);
      const endDateInput = screen.getByLabelText(/End Date/i);
      await user.type(startDateInput, "2025-01-01");
      await user.type(endDateInput, "2025-01-31");

      // Click clear button
      const clearButton = screen.getByRole("button", { name: /Clear/i });
      await user.click(clearButton);

      // Dates should be cleared
      expect(startDateInput).toHaveValue("");
      expect(endDateInput).toHaveValue("");
    });
  });

  describe("Transfer results display", () => {
    it("shows no transfers message when transfers array is empty", () => {
      mockUseTransferCalculations.mockReturnValue({
        ...defaultHookReturn,
        transfers: [],
        otherTeam: 2,
      });

      renderWithProviders(<TransferView {...defaultProps} myTeam={1} />);

      expect(screen.getByText(/No transfers found between Team 1 and Team 2/)).toBeInTheDocument();
    });

    it("displays transfers when provided by hook", () => {
      const mockTransfers = [
        {
          date: dayjs("2025-01-15"),
          fromTeam: 1,
          toTeam: 2,
          fromShiftType: "M" as const,
          toShiftType: "L" as const,
          type: "handover",
        },
      ];

      mockUseTransferCalculations.mockReturnValue({
        ...defaultHookReturn,
        transfers: mockTransfers,
        otherTeam: 2,
      });

      renderWithProviders(<TransferView {...defaultProps} myTeam={1} />);

      // Check for badges and icons for team direction
      expect(screen.getAllByText(/Your Team 1/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Team 2/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Wed, Jan 15/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Morning/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Evening/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Handover/).length).toBeGreaterThan(0);
    });

    it("shows team selection prompt when no team selected", () => {
      mockUseTransferCalculations.mockReturnValue({
        ...defaultHookReturn,
        validatedMyTeam: null, // Set validated team to null
      });

      renderWithProviders(<TransferView {...defaultProps} myTeam={null} />);

      expect(screen.getByText(/Please select your team/)).toBeInTheDocument();
    });
  });

  describe("Prop validation", () => {
    it("handles invalid team selection without crashing", () => {
      // Invalid teams are handled by useTransferCalculations hook - mock returns null
      mockUseTransferCalculations.mockReturnValue({
        ...defaultHookReturn,
        validatedMyTeam: null, // Hook validates to null
      });

      renderWithProviders(<TransferView {...defaultProps} myTeam={999} />);

      // Should render without crashing - shows team selection prompt
      expect(screen.getByText("Team Transfers")).toBeInTheDocument();
      expect(screen.getByText(/Please select your team/)).toBeInTheDocument();
      // No warnings are logged at this level - validation is in the hook
    });

    it("handles negative team numbers without crashing", () => {
      mockUseTransferCalculations.mockReturnValue({
        ...defaultHookReturn,
        validatedMyTeam: null, // Hook validates to null
      });

      renderWithProviders(<TransferView {...defaultProps} myTeam={-1} />);

      expect(screen.getByText("Team Transfers")).toBeInTheDocument();
      expect(screen.getByText(/Please select your team/)).toBeInTheDocument();
      // No warnings are logged at this level - validation is in the hook
    });

    it("handles null team selection without warning", () => {
      mockUseTransferCalculations.mockReturnValue({
        ...defaultHookReturn,
        validatedMyTeam: null, // Set validated team to null
      });

      renderWithProviders(<TransferView {...defaultProps} myTeam={null} />);

      expect(screen.getByText("Team Transfers")).toBeInTheDocument();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
    });
  });

  describe("Transfer data display", () => {
    it("displays transfer data with proper formatting", () => {
      const mockTransfers = [
        {
          date: dayjs("2025-01-15"),
          fromTeam: 1,
          toTeam: 2,
          fromShiftType: "M" as const,
          toShiftType: "L" as const,
          type: "handover",
        },
        {
          date: dayjs("2025-01-16"),
          fromTeam: 2,
          toTeam: 1,
          fromShiftType: "L" as const,
          toShiftType: "N" as const,
          type: "takeover",
        },
      ];

      mockUseTransferCalculations.mockReturnValue({
        ...defaultHookReturn,
        transfers: mockTransfers,
        otherTeam: 2,
      });

      renderWithProviders(<TransferView {...defaultProps} myTeam={1} />);

      // Check that both transfers are displayed
      expect(screen.getAllByText(/Wed, Jan 15/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Thu, Jan 16/).length).toBeGreaterThan(0);

      // Check shift types
      expect(screen.getAllByText(/Morning/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Evening/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Night/).length).toBeGreaterThan(0);

      // Check for badges and icons for team direction
      expect(screen.getAllByText(/Your Team/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Team 2/).length).toBeGreaterThan(0);

      // Check handover/takeover labels
      expect(screen.getAllByText(/Handover/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Takeover/).length).toBeGreaterThan(0);
    });

    it("renders team badges when displaying limited transfers", () => {
      // Create 21 mock transfers to test the limit
      const mockTransfers = Array.from({ length: 21 }, (_, i) => ({
        date: dayjs("2025-01-15").add(i, "day"),
        fromTeam: 1,
        toTeam: 2,
        fromShiftType: "M" as const,
        toShiftType: "L" as const,
        type: "handover",
      }));

      mockUseTransferCalculations.mockReturnValue({
        ...defaultHookReturn,
        transfers: mockTransfers.slice(0, 20), // Hook should limit to 20
        otherTeam: 2,
      });

      renderWithProviders(<TransferView {...defaultProps} myTeam={1} />);

      // Check for badge-based section header
      expect(screen.getAllByText(/Your Team 1/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Team 2/).length).toBeGreaterThan(0);
    });
  });

  describe("Summary metrics", () => {
    it("shows transfer metrics, date range, and progress indicator", () => {
      const mockTransfers = [
        {
          date: dayjs("2025-01-15"),
          fromTeam: 1,
          toTeam: 2,
          fromShiftType: "M" as const,
          toShiftType: "L" as const,
          type: "handover",
        },
        {
          date: dayjs("2025-01-16"),
          fromTeam: 2,
          toTeam: 1,
          fromShiftType: "L" as const,
          toShiftType: "N" as const,
          type: "takeover",
        },
      ];

      mockUseTransferCalculations.mockReturnValue({
        ...defaultHookReturn,
        transfers: mockTransfers,
        totalTransfers: 47,
        hasMoreTransfers: true,
      });

      renderWithProviders(<TransferView {...defaultProps} myTeam={1} />);

      expect(screen.getByText("Handovers")).toBeInTheDocument();
      expect(screen.getByText("Takeovers")).toBeInTheDocument();
      expect(screen.getByText(/Displayed Date Range/)).toBeInTheDocument();
      expect(screen.getByText(/Showing 2 of 47 transfers/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Load More Transfers/i })).toBeInTheDocument();
    });

    it("uses shared empty state for no other teams", () => {
      mockUseTransferCalculations.mockReturnValue({
        ...defaultHookReturn,
        availableOtherTeams: [],
      });

      renderWithProviders(<TransferView {...defaultProps} myTeam={1} />);

      expect(screen.getByText("No Other Teams Available")).toBeInTheDocument();
      expect(
        screen.getByText("No other teams available for transfer analysis."),
      ).toBeInTheDocument();
    });
  });

  describe("Advanced interactions", () => {
    it("handles rapid team selection changes", async () => {
      const mockSetOtherTeam = vi.fn();
      mockUseTransferCalculations.mockReturnValue({
        ...defaultHookReturn,
        setOtherTeam: mockSetOtherTeam,
      });

      const user = userEvent.setup();
      renderWithProviders(<TransferView {...defaultProps} />);

      const otherTeamSelect = screen.getByLabelText("View transfers with Team:");

      // Rapid changes
      await user.selectOptions(otherTeamSelect, "3");
      await user.selectOptions(otherTeamSelect, "4");
      await user.selectOptions(otherTeamSelect, "5");

      expect(mockSetOtherTeam).toHaveBeenCalledTimes(3);
      expect(mockSetOtherTeam).toHaveBeenNthCalledWith(1, 3);
      expect(mockSetOtherTeam).toHaveBeenNthCalledWith(2, 4);
      expect(mockSetOtherTeam).toHaveBeenNthCalledWith(3, 5);
    });
  });
});
