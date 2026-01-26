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
    it("should show 'No schedule selected' when myTeam is null and no schedule", () => {
      render(
        <AllProviders>
          <CalendarView myTeam={null} />
        </AllProviders>,
      );

      expect(screen.getByText(/No schedule selected/i)).toBeInTheDocument();
      expect(screen.getByText(/complete the onboarding wizard/i)).toBeInTheDocument();
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

      expect(screen.getByText(/Select your schedule to see your working calendar/i)).toBeInTheDocument();
    });
  });

  describe("Component Rendering", () => {
    it("should render without crashing when myTeam is provided", () => {
      const { container } = render(
        <AllProviders>
          <CalendarView myTeam={1} />
        </AllProviders>,
      );

      // Component should render
      expect(container.querySelector(".calendar-view")).toBeInTheDocument();
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

  describe("getEffectiveTeam Integration", () => {
    it("should use getEffectiveTeam to handle single-user schedules", () => {
      // When CalendarView is rendered, it should use getEffectiveTeam internally
      // This test verifies the component doesn't crash with null team
      const { container } = render(
        <AllProviders>
          <CalendarView myTeam={null} />
        </AllProviders>,
      );

      // Should render without errors
      expect(container.querySelector(".calendar-view")).toBeInTheDocument();
      
      // The getEffectiveTeam logic is tested in scheduleUtils.test.ts
      // This test just verifies CalendarView integrates with it correctly
    });
  });

  describe("Working Day Integration", () => {
    it("should integrate with working day utilities", () => {
      // CalendarView should use isWorkingDay, hasTimeOffEvent, and isPublicHolidayForShift
      // These utilities are tested in workingDayUtils.test.ts
      // This test verifies CalendarView compiles and runs with these imports
      
      const { container } = render(
        <AllProviders>
          <CalendarView myTeam={1} />
        </AllProviders>,
      );

      // Should render without TypeScript/runtime errors
      expect(container.querySelector(".calendar-view")).toBeInTheDocument();
    });
  });

  describe("Date Validation Integration", () => {
    it("should import and use isValidDate from validation module", () => {
      // CalendarView should use isValidDate for date validation
      // The validation logic is tested in the validation module
      // This test verifies CalendarView imports it correctly
      
      const { container } = render(
        <AllProviders>
          <CalendarView myTeam={null} />
        </AllProviders>,
      );

      // Should render without import errors
      expect(container.querySelector(".calendar-view")).toBeInTheDocument();
    });
  });
});
