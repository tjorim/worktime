import { render, screen } from "@testing-library/react";
import type { Dayjs } from "dayjs";
import type React from "react";
import { describe, expect, it } from "vitest";
import { ShiftTimeline } from "../../src/components/ShiftTimeline";
import { SettingsProvider } from "../../src/contexts/SettingsContext";
import { dayjs } from "../../src/utils/dateTimeUtils";
import type { ShiftResult } from "../../src/utils/shiftCalculations";

// Helper to render component with required providers
const renderWithProviders = (component: React.ReactElement) => {
  return render(<SettingsProvider>{component}</SettingsProvider>);
};

// Mock data for testing
const createMockShiftResult = (
  teamNumber: number,
  shiftCode: "M" | "L" | "N" | "O",
  date: Dayjs,
): ShiftResult => ({
  teamNumber,
  date,
  code: `${date.format("YYWW.d")}${shiftCode}`,
  shift: {
    code: shiftCode,
    emoji: shiftCode === "M" ? "🌅" : shiftCode === "L" ? "🌆" : shiftCode === "N" ? "🌙" : "🏠",
    name: shiftCode === "M" ? "Morning" : shiftCode === "L" ? "Late" : shiftCode === "N" ? "Night" : "Off",
    hours:
      shiftCode === "M"
        ? "07:00-15:00"
        : shiftCode === "L"
          ? "15:00-23:00"
          : shiftCode === "N"
            ? "23:00-07:00"
            : "Not working",
    start: shiftCode === "M" ? 7 : shiftCode === "L" ? 15 : shiftCode === "N" ? 23 : null,
    end: shiftCode === "M" ? 15 : shiftCode === "L" ? 23 : shiftCode === "N" ? 7 : null,
    isWorking: shiftCode !== "O",
    className:
      shiftCode === "M"
        ? "shift-morning"
        : shiftCode === "L"
          ? "shift-late"
          : shiftCode === "N"
            ? "shift-night"
            : "shift-off",
  },
});

describe("ShiftTimeline", () => {
  const today = dayjs("2025-01-15"); // Wednesday

  it("renders timeline header", () => {
    const currentWorkingTeam = createMockShiftResult(1, "M", today);

    renderWithProviders(<ShiftTimeline currentWorkingTeam={currentWorkingTeam} today={today} />);

    expect(screen.getByText("Today's Shift Timeline")).toBeInTheDocument();
    expect(document.querySelector(".bi-clock")).toBeInTheDocument(); // Bootstrap icon
  });

  it("displays current working team with active indicator", () => {
    const currentWorkingTeam = createMockShiftResult(3, "L", today);

    const { container } = renderWithProviders(
      <ShiftTimeline currentWorkingTeam={currentWorkingTeam} today={today} />,
    );

    expect(screen.getByText("T3")).toBeInTheDocument();

    // Find the current working team badge specifically
    const currentBadge = container.querySelector(".timeline-current-badge");
    expect(currentBadge).toBeInTheDocument();
    expect(currentBadge?.textContent).toBe("T3");
  });

  it("applies timeline-current-badge class to current team", () => {
    const currentWorkingTeam = createMockShiftResult(2, "N", today);

    renderWithProviders(<ShiftTimeline currentWorkingTeam={currentWorkingTeam} today={today} />);

    const currentBadge = document.querySelector(".timeline-current-badge");
    expect(currentBadge).toBeInTheDocument();
    expect(currentBadge).toHaveTextContent("T2");
  });

  it("applies correct shift styling classes", () => {
    const morningTeam = createMockShiftResult(1, "M", today);

    renderWithProviders(<ShiftTimeline currentWorkingTeam={morningTeam} today={today} />);

    const badge = screen.getByText("T1");
    expect(badge).toHaveClass("timeline-current-badge");
    expect(badge).toHaveClass("timeline-badge");
  });

  it("renders timeline flow structure", () => {
    const currentWorkingTeam = createMockShiftResult(1, "M", today);

    const { container } = renderWithProviders(
      <ShiftTimeline currentWorkingTeam={currentWorkingTeam} today={today} />,
    );

    expect(container.querySelector(".timeline-flow")).toBeInTheDocument();
    expect(container.querySelector(".timeline-team")).toBeInTheDocument();
  });

  it("handles different shift codes correctly", () => {
    const nightTeam = createMockShiftResult(5, "N", today);

    const { container } = renderWithProviders(
      <ShiftTimeline currentWorkingTeam={nightTeam} today={today} />,
    );

    expect(screen.getByText("T5")).toBeInTheDocument();

    // Find the current working team badge specifically
    const currentBadge = container.querySelector(".timeline-current-badge");
    expect(currentBadge).toBeInTheDocument();
    expect(currentBadge?.textContent).toBe("T5");
  });
});
