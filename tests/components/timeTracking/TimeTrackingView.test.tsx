import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import React from "react";
import { TimeTrackingView } from "../../../src/components/timeTracking/TimeTrackingView";

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

vi.mock("../../../src/hooks/useViewMode", () => ({
  useViewMode: vi.fn(() => ["daily", vi.fn()]),
}));

describe("TimeTrackingView", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("View Toggle", () => {
    it("should render view toggle buttons", () => {
      render(<TimeTrackingView />);

      const dailyButton = screen.getByRole("button", { name: /Daily Log/i });
      const weeklyButton = screen.getByRole("button", { name: /Weekly Summary/i });

      expect(dailyButton).toBeInTheDocument();
      expect(weeklyButton).toBeInTheDocument();
    });

    it("should show daily view by default", () => {
      render(<TimeTrackingView />);

      expect(screen.getByText("Daily Time Tracking")).toBeInTheDocument();
    });

    it("should have icons in view toggle buttons", () => {
      const { container } = render(<TimeTrackingView />);

      const dailyButton = screen.getByRole("button", { name: /Daily Log/i });
      const weeklyButton = screen.getByRole("button", { name: /Weekly Summary/i });

      const dailyIcon = dailyButton.querySelector('i');
      const weeklyIcon = weeklyButton.querySelector('i');

      expect(dailyIcon).toHaveClass("bi-list-check");
      expect(weeklyIcon).toHaveClass("bi-bar-chart-line");
    });
  });

  describe("Daily View", () => {
    it("should render TimeTrackerPanel in daily view", () => {
      render(<TimeTrackingView />);

      expect(screen.getByText("Daily Time Tracking")).toBeInTheDocument();
    });
  });

  describe("Weekly View", () => {
    it("should render WeeklyOverviewPanel when weekly view is selected", async () => {
      const { useViewMode } = await import("../../../src/hooks/useViewMode");
      const mockUseViewMode = vi.mocked(useViewMode);
      mockUseViewMode.mockReturnValueOnce(["weekly", vi.fn()]);

      render(<TimeTrackingView />);

      expect(screen.getByText("Weekly Overview")).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("should have aria-label on button group", () => {
      render(<TimeTrackingView />);

      const buttonGroup = screen.getByRole("group", { name: /Toggle time tracking view/i });
      expect(buttonGroup).toBeInTheDocument();
    });

    it("should use semantic Card structure", () => {
      const { container } = render(<TimeTrackingView />);

      const card = container.querySelector(".card");
      expect(card).toBeInTheDocument();
    });

    it("should have proper heading structure", () => {
      render(<TimeTrackingView />);

      const header = screen.getByText("Daily Time Tracking");
      expect(header).toBeInTheDocument();
    });
  });

  describe("Layout", () => {
    it("should have flex layout with gap", () => {
      const { container } = render(<TimeTrackingView />);

      const viewContainer = container.querySelector(".time-tracking-view");
      expect(viewContainer).toHaveClass("d-flex", "flex-column", "gap-3");
    });

    it("should render buttons in a ButtonGroup", () => {
      render(<TimeTrackingView />);

      const buttonGroup = screen.getByRole("group");
      expect(buttonGroup).toBeInTheDocument();
    });
  });
});
