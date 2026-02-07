import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import React from "react";
import { TimeTrackingView } from "../../../src/components/timeTracking/TimeTrackingView";
import { SettingsProvider } from "../../../src/contexts/SettingsContext";

// Mock the hooks
vi.mock("../../../src/hooks/useTimeTrackingStorage", () => ({
  useTimeTrackingStorage: vi.fn(() => ({
    tasks: [],
    templates: [],
    addTask: vi.fn(),
    updateTaskTimes: vi.fn(),
    removeTask: vi.fn(),
    addTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    exportData: vi.fn(),
    importData: vi.fn(),
  })),
}));

describe("TimeTrackingView", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const renderWithSettings = () =>
    render(
      <SettingsProvider>
        <TimeTrackingView />
      </SettingsProvider>,
    );

  describe("View Toggle", () => {
    it("should render view toggle buttons", () => {
      renderWithSettings();

      const dailyButton = screen.getByRole("button", { name: /Daily Log/i });
      const weeklyButton = screen.getByRole("button", { name: /Weekly Summary/i });

      expect(dailyButton).toBeInTheDocument();
      expect(weeklyButton).toBeInTheDocument();
    });

    it("should show daily view by default", () => {
      renderWithSettings();

      expect(screen.getByText("Daily Time Tracking")).toBeInTheDocument();
    });

    it("should have icons in view toggle buttons", () => {
      renderWithSettings();

      const dailyButton = screen.getByRole("button", { name: /Daily Log/i });
      const weeklyButton = screen.getByRole("button", { name: /Weekly Summary/i });

      const dailyIcon = dailyButton.querySelector("i");
      const weeklyIcon = weeklyButton.querySelector("i");

      expect(dailyIcon).toHaveClass("bi-list-check");
      expect(weeklyIcon).toHaveClass("bi-bar-chart-line");
    });
  });

  describe("Daily View", () => {
    it("should render TimeTrackerPanel in daily view", () => {
      renderWithSettings();

      expect(screen.getByText("Daily Time Tracking")).toBeInTheDocument();
    });
  });

  describe("Weekly View", () => {
    it("should render WeeklyOverviewPanel when weekly view is selected", () => {
      window.localStorage.setItem(
        "worktime_user_state",
        JSON.stringify({
          hasCompletedOnboarding: true,
          myTeam: null,
          scheduleType: "9-5",
          settings: {
            timeFormat: "24h",
            theme: "auto",
            notifications: "off",
            vacationAllowance: { amount: 0, unit: "days", hoursPerDay: 8 },
            enableTimeOff: false,
            enableTimeTracking: true,
            timeTrackingWeeklyTargetHours: 40,
          },
          lastUsed: {
            activeTab: "timetracking",
            scheduleView: "today",
            otherSchedule: null,
            timeOffView: "table",
            timeTrackingView: "weekly",
            otherTeam: null,
          },
        }),
      );

      renderWithSettings();

      expect(screen.getByText("Weekly Overview")).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("should have aria-label on button group", () => {
      renderWithSettings();

      const buttonGroup = screen.getByRole("group", { name: /Toggle time tracking view/i });
      expect(buttonGroup).toBeInTheDocument();
    });

    it("should use semantic Card structure", () => {
      const { container } = renderWithSettings();

      const card = container.querySelector(".card");
      expect(card).toBeInTheDocument();
    });

    it("should have proper heading structure", () => {
      renderWithSettings();

      const header = screen.getByText("Daily Time Tracking");
      expect(header).toBeInTheDocument();
    });
  });

  describe("Layout", () => {
    it("should have flex layout with gap", () => {
      const { container } = renderWithSettings();

      const viewContainer = container.querySelector(".time-tracking-view");
      expect(viewContainer).toHaveClass("d-flex", "flex-column", "gap-3");
    });

    it("should render buttons in a ButtonGroup", () => {
      renderWithSettings();

      const buttonGroup = screen.getByRole("group");
      expect(buttonGroup).toBeInTheDocument();
    });
  });
});
