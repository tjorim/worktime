import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { CalendarView } from "../../src/components/CalendarView";
import { EventStoreProvider } from "../../src/contexts/EventStoreContext";
import { SettingsProvider } from "../../src/contexts/SettingsContext";
import { ToastProvider } from "../../src/contexts/ToastContext";

// Wrapper with all necessary providers
const AllProviders = ({ children }: { children: React.ReactNode }) => (
  <SettingsProvider>
    <ToastProvider>
      <EventStoreProvider>{children}</EventStoreProvider>
    </ToastProvider>
  </SettingsProvider>
);

describe("CalendarView", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("Empty State", () => {
    it("should show empty-state guidance when myTeam is null and no schedule", () => {
      render(
        <AllProviders>
          <CalendarView myTeam={null} />
        </AllProviders>,
      );

      expect(screen.getByText(/Welcome to Your Working Calendar/i)).toBeInTheDocument();
      expect(screen.getByText(/select your work schedule/i)).toBeInTheDocument();
      expect(screen.getByText(/explore the Today and Week schedule views/i)).toBeInTheDocument();
    });

    it("should render calendar title", () => {
      render(
        <AllProviders>
          <CalendarView myTeam={null} />
        </AllProviders>,
      );

      expect(screen.getByText(/My Working Calendar/i)).toBeInTheDocument();
    });

    it("should show schedule selection message when no team selected", () => {
      render(
        <AllProviders>
          <CalendarView myTeam={null} />
        </AllProviders>,
      );

      expect(
        screen.getByText(/Select your schedule to see your working calendar/i),
      ).toBeInTheDocument();
    });
  });

  describe("Component Rendering", () => {
    it("should render without crashing when myTeam is provided", () => {
      // Setup: configure schedule so getShiftForDate returns a value
      localStorage.setItem(
        "worktime_user_state",
        JSON.stringify({
          hasCompletedOnboarding: true,
          myTeam: 1,
          scheduleType: "5-shift",
          settings: {
            timeFormat: "24h",
            theme: "system",
            notifications: "off",
            vacationAllowance: { amount: 0, unit: "days", hoursPerDay: 8 },
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

      const { container } = render(
        <AllProviders>
          <CalendarView myTeam={1} />
        </AllProviders>,
      );

      // Component should render with calendar grid (not empty state)
      expect(container.querySelector(".calendar-view")).toBeInTheDocument();
      expect(container.querySelector(".month-calendar")).toBeInTheDocument();
    });

    it("should render calendar card structure", () => {
      render(
        <AllProviders>
          <CalendarView myTeam={null} />
        </AllProviders>,
      );

      // Should have card structure with title
      expect(screen.getByText(/My Working Calendar/i)).toBeInTheDocument();
    });
  });

  describe("Working Day Integration", () => {
    it("should display shift badges when team is selected and schedule configured", () => {
      // Setup: configure user state with a 5-shift schedule and team
      localStorage.setItem(
        "worktime_user_state",
        JSON.stringify({
          hasCompletedOnboarding: true,
          myTeam: 1,
          scheduleType: "5-shift",
          settings: {
            timeFormat: "24h",
            theme: "system",
            notifications: "off",
            vacationAllowance: { amount: 0, unit: "days", hoursPerDay: 8 },
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

      render(
        <AllProviders>
          <CalendarView myTeam={1} />
        </AllProviders>,
      );

      // Assert: shift badges should be visible in the calendar with valid shift codes
      // M=Morning, L=Late, N=Night, D=Day, O=Off
      expect(screen.getAllByText(/^[MLNDO]$/).length).toBeGreaterThan(0);
    });
  });
});
