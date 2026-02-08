import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import React from "react";
import { TimeOffView } from "../../src/components/TimeOffView";
import { EventStoreProvider } from "../../src/contexts/EventStoreContext";
import { SettingsProvider } from "../../src/contexts/SettingsContext";
import { ToastProvider } from "../../src/contexts/ToastContext";

function renderWithProviders() {
  return render(
    <SettingsProvider>
      <ToastProvider>
        <EventStoreProvider>
          <TimeOffView />
        </EventStoreProvider>
      </ToastProvider>
    </SettingsProvider>,
  );
}

describe("TimeOffView Integration Tests", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("switches between table, statistics, and raw views", async () => {
    const user = userEvent.setup();
    renderWithProviders();

    // Table view starts active
    expect(screen.getByText(/No time-off events yet/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Statistics/i }));
    expect(screen.getByRole("region", { name: /Vacation statistics/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Raw \.hday/i }));
    expect(screen.getByRole("region", { name: /Raw \.hday content editor/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Table$/i }));
    expect(screen.getByText(/No time-off events yet/i)).toBeInTheDocument();
  });

  it("restores the last used Time Off view from settings state", () => {
    localStorage.setItem(
      "worktime_user_state",
      JSON.stringify({
        version: 2,
        hasCompletedOnboarding: true,
        myTeam: null,
        scheduleType: "9-5",
        settings: {
          timeFormat: "24h",
          theme: "auto",
          notifications: "off",
          vacationAllowance: { yearlyAmounts: {}, unit: "days", hoursPerDay: 8 },
          enableTimeOff: true,
          enableTimeTracking: true,
        },
        lastUsed: {
          activeTab: "timeoff",
          scheduleView: "today",
          otherSchedule: null,
          timeOffView: "raw",
          timeTrackingView: "daily",
          otherTeam: null,
        },
      }),
    );

    renderWithProviders();

    expect(screen.getByRole("region", { name: /Raw \.hday content editor/i })).toBeInTheDocument();
  });
});
