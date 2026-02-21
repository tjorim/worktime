import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpcomingShiftsList } from "../../src/components/schedule/UpcomingShiftsList";
import { getNextShift } from "../../src/utils/shiftCalculations";
import { dayjs } from "../../src/utils/dateTimeUtils";

vi.mock("../../src/contexts/SettingsContext", () => ({
  useSettings: () => ({
    settings: {
      timeFormat: "24h",
    },
  }),
}));

vi.mock("../../src/utils/shiftCalculations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/utils/shiftCalculations")>();
  return {
    ...actual,
    getNextShift: vi.fn(),
  };
});

const mockGetNextShift = vi.mocked(getNextShift);

beforeEach(() => {
  mockGetNextShift.mockReset();
});

describe("UpcomingShiftsList", () => {
  it("renders upcoming shifts", () => {
    mockGetNextShift
      .mockReturnValueOnce({
        date: dayjs("2025-01-10"),
        shift: {
          name: "Morning",
          code: "M",
          displayCode: "M",
          emoji: "🌅",
          start: 7,
          end: 15,
          isWorking: true,
          className: "shift-morning",
        },
        code: "2502.5M",
      })
      .mockReturnValueOnce({
        date: dayjs("2025-01-11"),
        shift: {
          name: "Late",
          code: "L",
          displayCode: "E",
          emoji: "🌆",
          start: 15,
          end: 23,
          isWorking: true,
          className: "shift-late",
        },
        code: "2502.6L",
      })
      .mockReturnValue(null);

    render(<UpcomingShiftsList teamNumber={1} scheduleType="5-shift" itemCount={6} />);

    expect(screen.getByText("Upcoming Shifts")).toBeInTheDocument();
    expect(screen.getByText("2502.5")).toBeInTheDocument();
    expect(screen.queryByText("2502.5M")).not.toBeInTheDocument();
    expect(screen.getByText("Morning")).toBeInTheDocument();
    expect(screen.getByText("07:00")).toBeInTheDocument();
    expect(screen.getByText("2502.6")).toBeInTheDocument();
    expect(screen.queryByText("2502.6L")).not.toBeInTheDocument();
    expect(screen.getByText("Late")).toBeInTheDocument();
  });

  it("renders empty state", () => {
    mockGetNextShift.mockReturnValue(null);

    render(<UpcomingShiftsList teamNumber={1} scheduleType="5-shift" itemCount={6} />);

    expect(screen.getByText("No Upcoming Shifts")).toBeInTheDocument();
  });

  it("renders loading and error states", () => {
    const { rerender } = render(
      <UpcomingShiftsList teamNumber={1} scheduleType="5-shift" isLoading itemCount={6} />,
    );

    expect(screen.getByText(/Loading upcoming shifts/i)).toBeInTheDocument();

    rerender(
      <UpcomingShiftsList
        teamNumber={1}
        scheduleType="5-shift"
        error="Unable to load shifts"
        itemCount={6}
      />,
    );

    expect(screen.getByText("Unable to load shifts")).toBeInTheDocument();
  });
});
