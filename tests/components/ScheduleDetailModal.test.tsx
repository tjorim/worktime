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

  it("throws an error when team number is out of range", () => {
    expect(() =>
      renderWithSettings(
        <ScheduleDetailModal show={true} onHide={() => {}} teamNumber={0} scheduleType="5-shift" />,
      ),
    ).toThrow(/Invalid team number/);
  });
});
