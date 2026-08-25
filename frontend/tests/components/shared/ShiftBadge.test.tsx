import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom";
import { ShiftBadge } from "@/components/shared/ShiftBadge";
import { SettingsProvider } from "@/contexts/SettingsContext";
import type { Shift } from "@/utils/shiftCalculations";

function renderBadge(shift: Shift) {
  return render(
    <SettingsProvider>
      <ShiftBadge shift={shift} />
    </SettingsProvider>,
  );
}

const dayShift: Shift = {
  code: "D",
  displayCode: "D",
  emoji: "☀️",
  name: "Day",
  start: 9,
  end: 17,
  isWorking: true,
  className: "shift-day",
};

describe("ShiftBadge", () => {
  it("uses the shift's own color class while actually working", () => {
    renderBadge(dayShift);
    expect(screen.getByText("D")).toHaveClass("shift-day");
    expect(screen.getByText("D")).not.toHaveClass("shift-off");
  });

  it("falls back to the muted off style when isWorking is overridden to false", () => {
    // e.g. CalendarView.getShiftForDate overrides isWorking for a day with
    // a time-off entry or public holiday, without changing the underlying
    // roster shift code/className - the badge should still reflect that
    // this day isn't actually worked rather than showing it as a normal
    // vividly-colored working shift.
    renderBadge({ ...dayShift, isWorking: false, name: "Time Off" });
    expect(screen.getByText("D")).toHaveClass("shift-off");
    expect(screen.getByText("D")).not.toHaveClass("shift-day");
  });

  it("keeps the off style for a genuinely scheduled-off day", () => {
    const offShift: Shift = {
      code: "O",
      displayCode: "O",
      emoji: "🏠",
      name: "Off",
      start: null,
      end: null,
      isWorking: false,
      className: "shift-off",
    };
    renderBadge(offShift);
    expect(screen.getByText("O")).toHaveClass("shift-off");
  });
});
