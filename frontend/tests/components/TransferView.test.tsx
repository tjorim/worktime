import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransferView } from "@/components/TransferView";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { EventStoreProvider } from "@/contexts/EventStoreContext";
import { useTransferCalculations, TransferType } from "@/hooks/useTransferCalculations";
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
  return render(
    <SettingsProvider>
      <EventStoreProvider>{ui}</EventStoreProvider>
    </SettingsProvider>,
  );
}

// Mock the useTransferCalculations hook
vi.mock("@/hooks/useTransferCalculations", () => ({
  useTransferCalculations: vi.fn(),
}));

const mockUseTransferCalculations = vi.mocked(useTransferCalculations);

vi.mock("@/utils/shiftCalculations", () => ({
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
  getWorkingShiftTypes: vi.fn(() => ["M", "L", "N"]),
}));

vi.mock("@/utils/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/config")>();

  return {
    ...actual,
    CONFIG: {
      ...actual.CONFIG,
      TEAMS_COUNT: 5,
    },
  };
});

let mockConsoleWarn: ReturnType<typeof vi.spyOn>;

// Default hook return value
const defaultHookReturn = {
  transfers: [],
  hasMoreTransfers: false,
  overlaps: [],
  hasMoreOverlaps: false,
  availableOtherTeams: [2, 3, 4, 5],
  otherTeam: 2,
  setOtherTeam: vi.fn(),
  validatedMyTeam: 1, // Add validated team
  otherScheduleType: "5-shift", // Same as the mocked scheduleType — same-schedule by default
};

const defaultProps = {
  myTeam: 1,
};

const TEAM_TRANSFERS_HEADER = "Team Transfers";
const getTeamBadgeRegex = (teamNumber: number) => new RegExp(`^Your Team:\\s*${teamNumber}$`);

function expectMyTeamBadgeInTransferHeader(teamNumber: number) {
  const header = screen.getByText(TEAM_TRANSFERS_HEADER).closest(".card-header");
  expect(header).toBeInstanceOf(HTMLElement);
  expect(
    within(header as HTMLElement).getByText(getTeamBadgeRegex(teamNumber)),
  ).toBeInTheDocument();
}

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
      renderWithProviders(<TransferView {...defaultProps} />);
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

    it("shows validation feedback for reversed custom date range", async () => {
      const user = userEvent.setup();
      renderWithProviders(<TransferView {...defaultProps} />);

      const filterCheckbox = screen.getByLabelText(/Filter by custom date range/i);
      await user.click(filterCheckbox);

      const startDateInput = screen.getByLabelText(/Start Date/i);
      const endDateInput = screen.getByLabelText(/End Date/i);
      await user.type(startDateInput, "2025-02-01");
      await user.type(endDateInput, "2025-01-01");

      expect(startDateInput).toHaveClass("is-invalid");
      expect(endDateInput).toHaveClass("is-invalid");
      expect(
        screen.getByText(
          /Please select a valid date range\. Start date must be on or before end date\./i,
        ),
      ).toBeInTheDocument();
    });
  });

  describe("Transfer results display", () => {
    it("shows no transfers message when transfers array is empty", () => {
      mockUseTransferCalculations.mockReturnValue({
        ...defaultHookReturn,
        transfers: [],
        otherTeam: 2,
      });

      renderWithProviders(<TransferView {...defaultProps} />);

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
          type: "handover" as TransferType,
        },
      ];

      mockUseTransferCalculations.mockReturnValue({
        ...defaultHookReturn,
        transfers: mockTransfers,
        otherTeam: 2,
      });

      renderWithProviders(<TransferView {...defaultProps} />);

      // Check for badges and icons for team direction
      expectMyTeamBadgeInTransferHeader(1);
      expect(screen.getAllByText(/Team 2/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Wed, Jan 15/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Morning/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Evening/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Handover/).length).toBeGreaterThan(0);
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
          type: "handover" as TransferType,
        },
        {
          date: dayjs("2025-01-16"),
          fromTeam: 2,
          toTeam: 1,
          fromShiftType: "L" as const,
          toShiftType: "N" as const,
          type: "takeover" as TransferType,
        },
      ];

      mockUseTransferCalculations.mockReturnValue({
        ...defaultHookReturn,
        transfers: mockTransfers,
        otherTeam: 2,
      });

      renderWithProviders(<TransferView {...defaultProps} />);

      // Check that both transfers are displayed
      expect(screen.getAllByText(/Wed, Jan 15/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Thu, Jan 16/).length).toBeGreaterThan(0);

      // Check shift types
      expect(screen.getAllByText(/Morning/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Evening/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Night/).length).toBeGreaterThan(0);

      // Check for badges and icons for team direction
      expectMyTeamBadgeInTransferHeader(1);
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
        type: "handover" as TransferType,
      }));

      mockUseTransferCalculations.mockReturnValue({
        ...defaultHookReturn,
        transfers: mockTransfers.slice(0, 20), // Hook should limit to 20
        otherTeam: 2,
      });

      renderWithProviders(<TransferView {...defaultProps} />);

      // Check for badge-based section header
      expectMyTeamBadgeInTransferHeader(1);
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
          type: "handover" as TransferType,
        },
        {
          date: dayjs("2025-01-16"),
          fromTeam: 2,
          toTeam: 1,
          fromShiftType: "L" as const,
          toShiftType: "N" as const,
          type: "takeover" as TransferType,
        },
      ];

      mockUseTransferCalculations.mockReturnValue({
        ...defaultHookReturn,
        transfers: mockTransfers,
        hasMoreTransfers: true,
      });

      renderWithProviders(<TransferView {...defaultProps} />);

      expect(screen.getByText(/Handovers:\s*1/)).toBeInTheDocument();
      expect(screen.getByText(/Takeovers:\s*1/)).toBeInTheDocument();
      expect(screen.getByText(/Displayed Date Range/)).toBeInTheDocument();
      expect(screen.getByText(/Showing 2 transfers \(more available\)/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Load More Transfers/i })).toBeInTheDocument();
    });

    it("shows a single date in metrics when only one transfer is visible", () => {
      const mockTransfers = [
        {
          date: dayjs("2025-01-15"),
          fromTeam: 1,
          toTeam: 2,
          fromShiftType: "M" as const,
          toShiftType: "L" as const,
          type: "handover" as TransferType,
        },
      ];

      mockUseTransferCalculations.mockReturnValue({
        ...defaultHookReturn,
        transfers: mockTransfers,
      });

      renderWithProviders(<TransferView {...defaultProps} />);

      expect(screen.getAllByText(/Wed, Jan 15/).length).toBeGreaterThan(0);
      expect(screen.queryByText(/Wed, Jan 15 to Wed, Jan 15/)).not.toBeInTheDocument();
    });

    it("groups transfer history into accordion buckets", () => {
      vi.useFakeTimers();
      const referenceNow = new Date("2025-01-15T12:00:00Z");
      vi.setSystemTime(referenceNow);
      try {
        const mockTransfers = [
          {
            date: dayjs(referenceNow).add(2, "day"),
            fromTeam: 1,
            toTeam: 2,
            fromShiftType: "M" as const,
            toShiftType: "L" as const,
            type: "handover" as TransferType,
          },
          {
            date: dayjs(referenceNow).add(14, "day"),
            fromTeam: 2,
            toTeam: 1,
            fromShiftType: "L" as const,
            toShiftType: "N" as const,
            type: "takeover" as TransferType,
          },
          {
            date: dayjs(referenceNow).add(50, "day"),
            fromTeam: 1,
            toTeam: 2,
            fromShiftType: "N" as const,
            toShiftType: "M" as const,
            type: "handover" as TransferType,
          },
        ];

        mockUseTransferCalculations.mockReturnValue({
          ...defaultHookReturn,
          transfers: mockTransfers,
        });

        renderWithProviders(<TransferView {...defaultProps} />);

        expect(screen.getAllByText(/Next 7 Days/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Next 30 Days/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Further Ahead/).length).toBeGreaterThan(0);
        // Empty buckets are intentionally filtered out in TransferView.
        expect(screen.queryByText(/Past Transfers/)).not.toBeInTheDocument();

        const next7Header = screen.getByRole("button", { name: /Next 7 Days/i });
        const next30Header = screen.getByRole("button", { name: /Next 30 Days/i });
        const furtherHeader = screen.getByRole("button", { name: /Further Ahead/i });

        const next7Item = next7Header.closest(".accordion-item");
        const next30Item = next30Header.closest(".accordion-item");
        const furtherItem = furtherHeader.closest(".accordion-item");

        expect(next7Item).toBeInstanceOf(HTMLElement);
        expect(next30Item).toBeInstanceOf(HTMLElement);
        expect(furtherItem).toBeInstanceOf(HTMLElement);

        const next7ItemElement = next7Item as HTMLElement;
        const next30ItemElement = next30Item as HTMLElement;
        const furtherItemElement = furtherItem as HTMLElement;

        // Verify each bucket renders its own transfer content.
        expect(within(next7ItemElement).getAllByText(/Team\s+1/).length).toBeGreaterThan(0);
        expect(within(next7ItemElement).getByText(/Team\s+2/)).toBeInTheDocument();
        expect(within(next7ItemElement).getByText(/Morning/)).toBeInTheDocument();
        expect(within(next7ItemElement).getByText(/Evening/)).toBeInTheDocument();
        expect(within(next30ItemElement).getByText("Takeover")).toBeInTheDocument();
        expect(within(next30ItemElement).getByText(/Night/)).toBeInTheDocument();
        expect(within(furtherItemElement).getByText("Handover")).toBeInTheDocument();
        expect(within(furtherItemElement).getByText(/Night/)).toBeInTheDocument();
        expect(within(furtherItemElement).getByText(/Morning/)).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it("uses shared empty state for no other teams", () => {
      mockUseTransferCalculations.mockReturnValue({
        ...defaultHookReturn,
        availableOtherTeams: [],
      });

      renderWithProviders(<TransferView {...defaultProps} />);

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

  describe("Cross-schedule overlaps (#1111)", () => {
    it("shows the comparing-schedule note and overlaps instead of handover/takeover results", () => {
      mockUseTransferCalculations.mockReturnValue({
        ...defaultHookReturn,
        transfers: [],
        overlaps: [
          {
            start: dayjs("2025-01-15 09:00"),
            end: dayjs("2025-01-15 15:00"),
          },
        ],
        otherScheduleType: "9-5",
      });

      renderWithProviders(<TransferView {...defaultProps} />);

      // Comparing-schedule note names the other schedule
      expect(screen.getByText(/Comparing your schedule with 9-5/)).toBeInTheDocument();

      // Overlap row is shown with its time range
      expect(screen.getByText("Overlapping Hours")).toBeInTheDocument();
      expect(screen.getByText(/09:00.*15:00/)).toBeInTheDocument();

      // No handover/takeover UI — that vocabulary doesn't apply across schedules
      expect(screen.queryByText("Handover")).not.toBeInTheDocument();
      expect(screen.queryByText("Takeover")).not.toBeInTheDocument();
      expect(screen.queryByText("Transfer Flow")).not.toBeInTheDocument();
    });

    it("shows a dedicated empty state when no overlaps are found across schedules", () => {
      mockUseTransferCalculations.mockReturnValue({
        ...defaultHookReturn,
        transfers: [],
        overlaps: [],
        otherScheduleType: "9-5",
      });

      renderWithProviders(<TransferView {...defaultProps} />);

      expect(screen.getByText("No Overlapping Hours")).toBeInTheDocument();
      // Not the same-schedule "No Transfers Found" empty state
      expect(screen.queryByText("No Transfers Found")).not.toBeInTheDocument();
    });

    it("relabels the team selector for overlap comparisons", () => {
      mockUseTransferCalculations.mockReturnValue({
        ...defaultHookReturn,
        overlaps: [],
        otherScheduleType: "9-5",
      });

      renderWithProviders(<TransferView {...defaultProps} />);

      expect(screen.getByLabelText("View overlapping hours with Team:")).toBeInTheDocument();
      expect(screen.queryByLabelText("View transfers with Team:")).not.toBeInTheDocument();
    });

    it("does not show the comparing-schedule note for a same-schedule comparison", () => {
      mockUseTransferCalculations.mockReturnValue(defaultHookReturn);

      renderWithProviders(<TransferView {...defaultProps} />);

      expect(screen.queryByText(/Comparing your schedule with/)).not.toBeInTheDocument();
    });
  });

  describe("Teamless shift-type lookups", () => {
    it("still blocks with the team prompt when the user has no team — only the other side can be teamless", () => {
      mockUseTransferCalculations.mockReturnValue({
        ...defaultHookReturn,
        validatedMyTeam: null,
      });

      renderWithProviders(<TransferView {...defaultProps} myTeam={null} />);

      expect(screen.getByText(/Please select your team/)).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /match by your current shift type/i }),
      ).not.toBeInTheDocument();
    });

    it("toggles the other side to shift-type mode", async () => {
      mockUseTransferCalculations.mockReturnValue(defaultHookReturn);
      const user = userEvent.setup();
      renderWithProviders(<TransferView {...defaultProps} />);

      expect(screen.getByLabelText("View transfers with Team:")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Shift type" }));

      expect(screen.queryByLabelText("View transfers with Team:")).not.toBeInTheDocument();
      expect(screen.getByLabelText(/View overlapping hours with shift:/i)).toBeInTheDocument();
    });

    it("shows the shift-type comparing note once toggled, even on the same schedule", async () => {
      mockUseTransferCalculations.mockReturnValue(defaultHookReturn);
      const user = userEvent.setup();
      renderWithProviders(<TransferView {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: "Shift type" }));

      expect(screen.getByText(/Matching by shift type instead of a fixed team/i)).toBeInTheDocument();
    });

    it("shows a shift-type-specific empty state when no overlaps are found in shift mode", async () => {
      mockUseTransferCalculations.mockReturnValue({
        ...defaultHookReturn,
        overlaps: [],
      });
      const user = userEvent.setup();
      renderWithProviders(<TransferView {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: "Shift type" }));

      expect(screen.getByText("No Overlapping Hours")).toBeInTheDocument();
      expect(screen.getByText(/No overlapping working hours found for/i)).toBeInTheDocument();
    });

    it("labels overlap rows by shift type instead of team number in shift mode", async () => {
      mockUseTransferCalculations.mockReturnValue({
        ...defaultHookReturn,
        overlaps: [{ start: dayjs("2025-01-15 09:00"), end: dayjs("2025-01-15 15:00") }],
      });
      const user = userEvent.setup();
      renderWithProviders(<TransferView {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: "Shift type" }));

      // Default shift-type selection is the first working type ("M" -> Morning per the mock)
      expect(screen.getAllByText(/Morning/).length).toBeGreaterThan(0);
      expect(screen.queryByText(/^Team 2$/)).not.toBeInTheDocument();
    });
  });
});
