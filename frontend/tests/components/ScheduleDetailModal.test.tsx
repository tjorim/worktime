import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import type React from "react";
import { describe, expect, it } from "vitest";
import { ScheduleDetailModal } from "@/components/schedule/ScheduleDetailModal";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { getLocale, setLocale } from "@/paraglide/runtime.js";

function renderWithSettings(ui: React.ReactElement) {
  return render(
    <ToastProvider>
      <SettingsProvider>{ui}</SettingsProvider>
    </ToastProvider>,
  );
}

describe("ScheduleDetailModal", () => {
  const originalLocale = getLocale();

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

  afterEach(async () => {
    window.localStorage.clear();
    await setLocale(originalLocale, { reload: false });
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
    expect(screen.getByText(/40h/)).toBeInTheDocument();
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

  it("shows responsive schedule information for a multi-team roster", () => {
    renderWithSettings(
      <ScheduleDetailModal show={true} onHide={() => {}} teamNumber={2} scheduleType="5-shift" />,
    );

    expect(screen.getByText("Schedule information")).toBeInTheDocument();
    expect(screen.getByText("5-shift")).toBeInTheDocument();
    expect(screen.getByText("Team 2 of 5")).toBeInTheDocument();
    expect(screen.getByText("10 days")).toBeInTheDocument();
    expect(screen.getByText("Continuous rotating shifts across multiple teams.")).toBeInTheDocument();
    expect(screen.getAllByText("07:00–15:00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("15:00–23:00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("23:00–07:00").length).toBeGreaterThan(0);
  });

  it("localizes schedule metadata", async () => {
    await setLocale("nl", { reload: false });

    renderWithSettings(
      <ScheduleDetailModal
        show={true}
        onHide={() => {}}
        teamNumber={2}
        scheduleType="5-shift"
      />,
    );

    expect(screen.getByText("5-ploegenrooster")).toBeInTheDocument();
    expect(screen.getByText("Continu roterende diensten voor meerdere teams.")).toBeInTheDocument();
  });

  it("throws an error when team number is out of range", () => {
    expect(() =>
      renderWithSettings(
        <ScheduleDetailModal show={true} onHide={() => {}} teamNumber={0} scheduleType="5-shift" />,
      ),
    ).toThrow(/Invalid team number/);
  });
});
