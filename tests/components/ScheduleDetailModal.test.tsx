import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import type React from "react";
import { describe, expect, it } from "vitest";
import { ScheduleDetailModal } from "../../src/components/schedule/ScheduleDetailModal";
import { SettingsProvider } from "../../src/contexts/SettingsContext";
import { ToastProvider } from "../../src/contexts/ToastContext";

function renderWithSettings(ui: React.ReactElement) {
  return render(
    <ToastProvider>
      <SettingsProvider>{ui}</SettingsProvider>
    </ToastProvider>,
  );
}

describe("ScheduleDetailModal", () => {
  beforeEach(() => {
    // Set user state with the unified storage structure
    window.localStorage.setItem(
      "worktime_user_state",
      JSON.stringify({
        hasCompletedOnboarding: true,
        myTeam: 2,
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
      }),
    );
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("shows Schedule Details for single-user schedules", () => {
    renderWithSettings(
      <ScheduleDetailModal show={true} onHide={() => {}} teamNumber={1} scheduleType="9-5" />,
    );

    expect(screen.getByText("Schedule Details")).toBeInTheDocument();
  });

  it("shows enhanced analytics and accessible table metadata", () => {
    renderWithSettings(
      <ScheduleDetailModal show={true} onHide={() => {}} teamNumber={1} scheduleType="9-5" />,
    );

    expect(screen.getByLabelText("Personal 7-day schedule table")).toBeInTheDocument();
    expect(screen.getByText("Working vs Rest Days")).toBeInTheDocument();
    expect(screen.getByText("Total Weekly Hours")).toBeInTheDocument();
    expect(screen.getByText(/40\.0h/)).toBeInTheDocument();
    expect(screen.getByText(/5\/7 \(71%\)/)).toBeInTheDocument();
  });

  it("only shows shift types defined by the selected schedule", () => {
    renderWithSettings(
      <ScheduleDetailModal show={true} onHide={() => {}} teamNumber={1} scheduleType="9-5" />,
    );

    expect(screen.getByText("Day Shifts")).toBeInTheDocument();
    expect(screen.queryByText("Morning Shifts")).not.toBeInTheDocument();
    expect(screen.queryByText("Evening Shifts")).not.toBeInTheDocument();
    expect(screen.queryByText("Night Shifts")).not.toBeInTheDocument();
  });

  it("throws an error when team number is out of range", () => {
    expect(() =>
      renderWithSettings(
        <ScheduleDetailModal show={true} onHide={() => {}} teamNumber={0} scheduleType="5-shift" />,
      ),
    ).toThrow(/Invalid team number/);
  });
});
