import { screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { AboutModal } from "../../src/components/AboutModal";
import { renderWithSettings } from "../testUtils/renderWithProviders";

function renderWithScheduleType(scheduleType: "5-shift" | "9-5") {
  return renderWithSettings(<AboutModal show onHide={vi.fn()} />, { scheduleType });
}

describe("AboutModal", () => {
  it("shows 5-shift features when scheduleType is 5-shift", () => {
    renderWithScheduleType("5-shift");

    expect(screen.getByText("5-team shift tracking")).toBeInTheDocument();
    expect(screen.getByText("Transfer detection")).toBeInTheDocument();
    expect(screen.queryByText(/Schedule type:/)).not.toBeInTheDocument();
    expect(screen.queryByText("More schedule views coming soon")).not.toBeInTheDocument();
  });

  it("shows schedule-specific features for non-5-shift schedules", () => {
    renderWithScheduleType("9-5");

    expect(screen.getByText("Schedule type: 9-5")).toBeInTheDocument();
    expect(screen.getByText("More schedule views coming soon")).toBeInTheDocument();
    expect(screen.queryByText("5-team shift tracking")).not.toBeInTheDocument();
    expect(screen.queryByText("Transfer detection")).not.toBeInTheDocument();
  });
});
