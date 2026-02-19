import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { RecentTransfersList } from "../../src/components/transfer/RecentTransfersList";
import { dayjs } from "../../src/utils/dateTimeUtils";

describe("RecentTransfersList", () => {
  it("renders transfer entries", () => {
    render(
      <RecentTransfersList
        myTeam={1}
        scheduleType="5-shift"
        transfers={[
          {
            date: dayjs("2025-01-15"),
            fromTeam: 1,
            toTeam: 2,
            fromShiftType: "M",
            toShiftType: "L",
            type: "handover",
          },
        ]}
      />,
    );

    expect(screen.getByText("Recent Transfers")).toBeInTheDocument();
    expect(screen.getByText("2503.3")).toBeInTheDocument();
    expect(screen.getByText("Team 1 → Team 2")).toBeInTheDocument();
    expect(screen.getByText("Handover")).toBeInTheDocument();
    expect(screen.getByText("Morning → Evening")).toBeInTheDocument();
  });

  it("renders empty state", () => {
    render(<RecentTransfersList myTeam={1} transfers={[]} />);

    expect(screen.getByText("No Transfers Found")).toBeInTheDocument();
  });

  it("renders loading and error states", () => {
    const { rerender } = render(<RecentTransfersList myTeam={1} transfers={[]} isLoading />);

    expect(screen.getByText(/Loading transfer history/i)).toBeInTheDocument();

    rerender(<RecentTransfersList myTeam={1} transfers={[]} error="Unable to load transfers" />);

    expect(screen.getByText("Unable to load transfers")).toBeInTheDocument();
  });
});
