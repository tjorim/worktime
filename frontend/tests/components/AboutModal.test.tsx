import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AboutModal } from "../../src/components/AboutModal";
import { SettingsProvider } from "../../src/contexts/SettingsContext";

function renderWithScheduleType(scheduleType: "5-shift" | "9-5") {
  // Seed localStorage with the schedule type
  window.localStorage.setItem(
    "worktime_user_state",
    JSON.stringify({
      hasCompletedOnboarding: true,
      myTeam: null,
      scheduleType,
      settings: {
        timeFormat: "24h",
        theme: "auto",
        notifications: "off",
        vacationAllowance: {
          amount: 0,
          unit: "days",
          hoursPerDay: 8,
        },
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

  return render(
    <SettingsProvider>
      <AboutModal show onHide={vi.fn()} />
    </SettingsProvider>,
  );
}

describe("AboutModal", () => {
  afterEach(() => {
    window.localStorage.removeItem("worktime_user_state");
  });

  it("shows 5-shift features when scheduleType is 5-shift", () => {
    renderWithScheduleType("5-shift");

    expect(screen.getByText("5-team shift tracking")).toBeInTheDocument();
    expect(screen.getByText("Transfer detection")).toBeInTheDocument();
    expect(screen.queryByText(/Schedule type:/)).not.toBeInTheDocument();
  });

  it("shows schedule-specific features for non-5-shift schedules", () => {
    renderWithScheduleType("9-5");

    expect(screen.getByText("Schedule type: 9-5")).toBeInTheDocument();
    expect(screen.queryByText("5-team shift tracking")).not.toBeInTheDocument();
    expect(screen.queryByText("Transfer detection")).not.toBeInTheDocument();
  });
});
