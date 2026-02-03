import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import type { Dayjs } from "dayjs";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShiftTimeline } from "../../src/components/ShiftTimeline";
import { SettingsProvider, useSettings } from "../../src/contexts/SettingsContext";
import { dayjs } from "../../src/utils/dateTimeUtils";
import type { ShiftResult } from "../../src/utils/shiftCalculations";
import * as shiftCalculations from "../../src/utils/shiftCalculations";

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
    displayCode: shiftCode,
    emoji: shiftCode === "M" ? "🌅" : shiftCode === "L" ? "🌆" : shiftCode === "N" ? "🌙" : "🏠",
    name:
      shiftCode === "M"
        ? "Morning"
        : shiftCode === "L"
          ? "Late"
          : shiftCode === "N"
            ? "Night"
            : "Off",
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
    const { container } = renderWithProviders(
      <ShiftTimeline currentWorkingTeam={currentWorkingTeam} />,
    );
    expect(screen.getByText("Today's Shift Timeline")).toBeInTheDocument();
    expect(container.querySelector(".bi-clock")).toBeInTheDocument();
  });

  it("displays current working team with active indicator", () => {
    const currentWorkingTeam = createMockShiftResult(3, "L", today);
    const { container } = renderWithProviders(
      <ShiftTimeline currentWorkingTeam={currentWorkingTeam} />,
    );
    expect(screen.getByText("T3")).toBeInTheDocument();
    const currentBadge = container.querySelector(".timeline-current-badge");
    expect(currentBadge).toBeInTheDocument();
    expect(currentBadge?.textContent).toBe("T3");
  });

  it("applies timeline-current-badge class to current team", () => {
    const currentWorkingTeam = createMockShiftResult(2, "N", today);
    renderWithProviders(<ShiftTimeline currentWorkingTeam={currentWorkingTeam} />);
    const currentBadge = document.querySelector(".timeline-current-badge");
    expect(currentBadge).toBeInTheDocument();
    expect(currentBadge).toHaveTextContent("T2");
  });

  it("applies correct shift styling classes", () => {
    const morningTeam = createMockShiftResult(1, "M", today);
    renderWithProviders(<ShiftTimeline currentWorkingTeam={morningTeam} />);
    const badge = screen.getByText("T1");
    expect(badge).toHaveClass("timeline-current-badge");
    expect(badge).toHaveClass("timeline-badge");
  });

  it("renders timeline flow structure", () => {
    const currentWorkingTeam = createMockShiftResult(1, "M", today);
    const { container } = renderWithProviders(
      <ShiftTimeline currentWorkingTeam={currentWorkingTeam} />,
    );
    expect(container.querySelector(".timeline-flow")).toBeInTheDocument();
    expect(container.querySelector(".timeline-team")).toBeInTheDocument();
  });

  it("handles different shift codes correctly", () => {
    const nightTeam = createMockShiftResult(5, "N", today);
    const { container } = renderWithProviders(<ShiftTimeline currentWorkingTeam={nightTeam} />);
    expect(screen.getByText("T5")).toBeInTheDocument();
    const currentBadge = container.querySelector(".timeline-current-badge");
    expect(currentBadge).toBeInTheDocument();
    expect(currentBadge?.textContent).toBe("T5");
  });

  // Tests for single-team and parallel shift scenarios (#119)
  describe("single-team and parallel shift scenarios", () => {
    const defaultSettings = {
      settings: {
        timeFormat: "24h" as const,
        theme: "auto" as const,
        notifications: "off" as const,
        vacationAllowance: { amount: 0, unit: "days" as const, hoursPerDay: 8 },
      },
      scheduleType: "5-shift" as const,
    };

    beforeEach(() => {
      // Reset to default 5-shift before each test
      vi.mocked(useSettings).mockReturnValue(defaultSettings as ReturnType<typeof useSettings>);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("hides timeline for single-team schedules based on roster config", () => {
      // Mock useSettings to return a single-team schedule (9-5)
      vi.mocked(useSettings).mockReturnValue({
        ...defaultSettings,
        scheduleType: "9-5", // Single-team schedule
      } as ReturnType<typeof useSettings>);

      const currentWorkingTeam = createMockShiftResult(1, "M", today);
      const { container } = renderWithProviders(
        <ShiftTimeline currentWorkingTeam={currentWorkingTeam} />,
      );
      expect(container.querySelector(".card-timeline")).not.toBeInTheDocument();
    });

    it("shows arrows for sequential shifts", () => {
      // Mock getAllTeamsShifts to return sequential shifts (different start times)
      vi.spyOn(shiftCalculations, "getAllTeamsShifts").mockReturnValue([
        createMockShiftResult(1, "M", today), // start: 7
        createMockShiftResult(2, "L", today), // start: 15 (sequential)
      ]);

      const currentWorkingTeam = createMockShiftResult(1, "M", today);
      const { container } = renderWithProviders(
        <ShiftTimeline currentWorkingTeam={currentWorkingTeam} />,
      );

      expect(container.querySelectorAll(".timeline-arrow").length).toBeGreaterThan(0);
    });

    it("hides arrows when parallel shifts are detected", () => {
      // Mock getAllTeamsShifts to return teams with same start time
      vi.spyOn(shiftCalculations, "getAllTeamsShifts").mockReturnValue([
        createMockShiftResult(1, "M", today), // start: 7
        createMockShiftResult(2, "M", today), // start: 7 (parallel)
      ]);

      const currentWorkingTeam = createMockShiftResult(1, "M", today);
      const { container } = renderWithProviders(
        <ShiftTimeline currentWorkingTeam={currentWorkingTeam} />,
      );

      // Should render timeline but without arrows
      expect(container.querySelector(".card-timeline")).toBeInTheDocument();
      expect(container.querySelector(".timeline-arrow")).not.toBeInTheDocument();
    });
  });
});
