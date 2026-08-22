import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  DEVICE_PREFERENCES_STORAGE_KEY,
  USER_STATE_STORAGE_KEY,
} from "@/constants/storageKeys";
import { CalendarView } from "@/features/calendar/CalendarView";
import { TestProviders } from "@tests/utils/testProviders";

function setUserState(overrides: { myTeam: number | null; scheduleType: string | null }) {
  localStorage.setItem(
    USER_STATE_STORAGE_KEY,
    JSON.stringify({
      hasCompletedOnboarding: true,
      myTeam: overrides.myTeam,
      scheduleType: overrides.scheduleType,
      settings: {
        timeFormat: "24h",
        theme: "system",
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
}

describe("CalendarView (unified calendar) roster warning", () => {
  it("persists dismissal and lets the user restore calendar help", () => {
    setUserState({ myTeam: 1, scheduleType: "5-shift" });
    render(
      <TestProviders>
        <CalendarView />
      </TestProviders>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close alert" }));
    expect(JSON.parse(localStorage.getItem(DEVICE_PREFERENCES_STORAGE_KEY) ?? "{}"))
      .toMatchObject({ dismissedHints: { unifiedCalendar: true } });
    expect(screen.queryByText(/Shifts, time off, and time tracking/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show calendar help" }));
    expect(JSON.parse(localStorage.getItem(DEVICE_PREFERENCES_STORAGE_KEY) ?? "{}"))
      .toMatchObject({ dismissedHints: { unifiedCalendar: false } });
    expect(screen.getByText(/Shifts, time off, and time tracking/i)).toBeInTheDocument();
  });

  it("does not warn for a single-team schedule even when myTeam is null", () => {
    setUserState({ myTeam: null, scheduleType: "9-5" });

    render(
      <TestProviders>
        <CalendarView />
      </TestProviders>,
    );

    expect(screen.queryByText(/No roster configured/i)).not.toBeInTheDocument();
  });

  it("warns when no schedule is selected", () => {
    setUserState({ myTeam: null, scheduleType: null });

    render(
      <TestProviders>
        <CalendarView />
      </TestProviders>,
    );

    expect(screen.getByText(/No roster configured/i)).toBeInTheDocument();
  });

  it("warns for a multi-team schedule when no team is selected", () => {
    setUserState({ myTeam: null, scheduleType: "5-shift" });

    render(
      <TestProviders>
        <CalendarView />
      </TestProviders>,
    );

    expect(screen.getByText(/No roster configured/i)).toBeInTheDocument();
  });

  it("does not warn for a multi-team schedule once a team is selected", () => {
    setUserState({ myTeam: 1, scheduleType: "5-shift" });

    render(
      <TestProviders>
        <CalendarView />
      </TestProviders>,
    );

    expect(screen.queryByText(/No roster configured/i)).not.toBeInTheDocument();
  });
});
