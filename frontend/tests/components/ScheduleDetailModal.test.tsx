import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
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

  it("throws an error when team number is out of range", () => {
    expect(() =>
      renderWithSettings(
        <ScheduleDetailModal show={true} onHide={() => {}} teamNumber={0} scheduleType="5-shift" />,
      ),
    ).toThrow(/Invalid team number/);
  });

  it("shows team information section with schedule details", () => {
    renderWithSettings(
      <ScheduleDetailModal show={true} onHide={() => {}} teamNumber={1} scheduleType="9-5" />,
    );

    expect(screen.getByText("Schedule Information")).toBeInTheDocument();
    expect(screen.getByText("Schedule Type")).toBeInTheDocument();
    expect(screen.getByText("9-5")).toBeInTheDocument();
    expect(screen.getByText("Cycle Length")).toBeInTheDocument();
    expect(screen.getByText("7 days")).toBeInTheDocument();
    expect(screen.getByText("Shifts per Day")).toBeInTheDocument();
    expect(screen.getByText("Available Shifts")).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
  });

  it("shows team number and count for multi-team schedules", () => {
    renderWithSettings(
      <ScheduleDetailModal show={true} onHide={() => {}} teamNumber={2} scheduleType="5-shift" />,
    );

    expect(screen.getByText("Team")).toBeInTheDocument();
    expect(screen.getByText("Team 2 of 5")).toBeInTheDocument();
    expect(screen.getByText("10 days")).toBeInTheDocument();
  });

  it("renders export to calendar button", () => {
    renderWithSettings(
      <ScheduleDetailModal show={true} onHide={() => {}} teamNumber={1} scheduleType="9-5" />,
    );

    expect(screen.getByRole("button", { name: /Export to Calendar/i })).toBeInTheDocument();
  });

  it("triggers .ics download when export button is clicked", () => {
    // Mock URL APIs used by exportToIcs
    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    const revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    // Prevent actual navigation during the click
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderWithSettings(
      <ScheduleDetailModal show={true} onHide={() => {}} teamNumber={1} scheduleType="9-5" />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Export to Calendar/i }));

    expect(createObjectURLSpy).toHaveBeenCalledOnce();
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(revokeObjectURLSpy).toHaveBeenCalledOnce();

    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
    clickSpy.mockRestore();
  });
});
