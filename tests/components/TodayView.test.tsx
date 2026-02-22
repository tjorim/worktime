import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TodayView } from "../../src/components/schedule/TodayView";
import { EventStoreProvider } from "../../src/contexts/EventStoreContext";
import { SettingsProvider } from "../../src/contexts/SettingsContext";
import { ToastProvider } from "../../src/contexts/ToastContext";
import { dayjs } from "../../src/utils/dateTimeUtils";
import type { ShiftResult } from "../../src/utils/shiftCalculations";
import { getAllTeamsShifts } from "../../src/utils/shiftCalculations";
import { useIsMobile } from "../../src/hooks/useIsMobile";

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

vi.mock("../../src/utils/shiftCalculations", () => ({
  getAllTeamsShifts: vi.fn(() => mockTodayShiftsData),
  isCurrentlyWorking: vi.fn(() => false),
  getFormattedShiftTime: vi.fn(() => "07:00-15:00"),
}));

vi.mock("../../src/hooks/useIsMobile", () => ({
  useIsMobile: vi.fn(() => false),
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
  viewingScheduleType: "5-shift" as const,
};

describe("TodayView", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getAllTeamsShifts).mockReturnValue(mockTodayShiftsData);
    vi.mocked(useIsMobile).mockReturnValue(false);
  });

  it("renders team cards in desktop layout", () => {
    renderWithProviders(<TodayView {...defaultProps} />);
    expect(screen.getByText("Team 1")).toBeInTheDocument();
    expect(screen.getByText("Team 2")).toBeInTheDocument();
    expect(screen.getByText("Team 3")).toBeInTheDocument();
    expect(screen.queryByLabelText("Team schedule carousel")).not.toBeInTheDocument();
  });

  it("calls onDateSelect with the selected date when date picker changes", () => {
    const onDateSelect = vi.fn();
    renderWithProviders(<TodayView {...defaultProps} onDateSelect={onDateSelect} />);
    fireEvent.change(screen.getByLabelText(/Jump to date/i), { target: { value: "2025-01-20" } });
    expect(onDateSelect).toHaveBeenCalledOnce();
    expect(onDateSelect.mock.calls[0][0].format("YYYY-MM-DD")).toBe("2025-01-20");
  });

  it("swipes left/right between team cards on mobile", () => {
    vi.mocked(useIsMobile).mockReturnValue(true);

    renderWithProviders(<TodayView {...defaultProps} />);

    const carousel = screen.getByLabelText("Team schedule carousel");
    expect(screen.getByRole("button", { name: "Show Team 1" })).toHaveAttribute("aria-current", "true");

    fireEvent.touchStart(carousel, { changedTouches: [{ clientX: 200 }] });
    fireEvent.touchEnd(carousel, { changedTouches: [{ clientX: 100 }] });
    expect(screen.getByRole("button", { name: "Show Team 2" })).toHaveAttribute("aria-current", "true");
    expect(screen.queryByText("Team 1")).not.toBeInTheDocument();

    fireEvent.touchStart(carousel, { changedTouches: [{ clientX: 100 }] });
    fireEvent.touchEnd(carousel, { changedTouches: [{ clientX: 180 }] });
    expect(screen.getByRole("button", { name: "Show Team 1" })).toHaveAttribute("aria-current", "true");
    expect(screen.queryByText("Team 2")).not.toBeInTheDocument();
  });

  it("supports keyboard navigation and dot indicators on mobile", async () => {
    const user = userEvent.setup();
    vi.mocked(useIsMobile).mockReturnValue(true);

    renderWithProviders(<TodayView {...defaultProps} />);

    const carousel = screen.getByLabelText("Team schedule carousel");
    carousel.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "Show Team 2" })).toHaveAttribute("aria-current", "true");
    expect(screen.queryByText("Team 1")).not.toBeInTheDocument();

    const dot = screen.getByRole("button", { name: "Show Team 3" });
    await user.click(dot);
    expect(screen.getByRole("button", { name: "Show Team 3" })).toHaveAttribute("aria-current", "true");
    expect(screen.queryByText("Team 2")).not.toBeInTheDocument();
  });

  it("arrow keys work when a child button has focus", async () => {
    const user = userEvent.setup();
    vi.mocked(useIsMobile).mockReturnValue(true);

    renderWithProviders(<TodayView {...defaultProps} />);

    // Focus a child button, not the carousel container
    const nextButton = screen.getByRole("button", { name: "Show next team" });
    nextButton.focus();
    expect(nextButton).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "Show Team 2" })).toHaveAttribute("aria-current", "true");

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("button", { name: "Show Team 1" })).toHaveAttribute("aria-current", "true");
  });

  it("handles empty shifts without crashing", () => {
    vi.mocked(getAllTeamsShifts).mockReturnValueOnce([]);
    renderWithProviders(<TodayView {...defaultProps} />);
    expect(screen.getByText("All Teams")).toBeInTheDocument();
    expect(screen.queryByText("Team 1")).not.toBeInTheDocument();
  });
});
