import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { StopTimerConflictDialog } from "@/features/timeTracking/StopTimerConflictDialog";
import type { StoredTimeTrackingTask } from "@/lib/timeTracking/types";

const running: StoredTimeTrackingTask = {
  id: "running",
  text: "Current work",
  label: "Support",
  startTime: "2025-01-01T16:50",
};
const planned: StoredTimeTrackingTask = {
  id: "planned",
  text: "Prepare report",
  label: "Support",
  startTime: "2025-01-01T18:00",
  stopTime: "2025-01-01T19:00",
};

function renderDialog(onConfirm = vi.fn()) {
  render(
    <StopTimerConflictDialog
      isOpen
      runningTask={running}
      conflictingTasks={[planned]}
      initialStopTime="18:05"
      onConfirm={onConfirm}
      onClose={vi.fn()}
    />,
  );
  return onConfirm;
}

describe("StopTimerConflictDialog", () => {
  it("labels the stop time field and describes its allowed range", () => {
    renderDialog();

    const input = screen.getByLabelText("Stop time");
    expect(input).toHaveAttribute("type", "time");
    expect(input).toHaveAccessibleDescription(/16:50/);
  });

  it("previews the effect on the planned task and confirms the chosen time", () => {
    const onConfirm = renderDialog();

    fireEvent.change(screen.getByLabelText("Stop time"), { target: { value: "17:30" } });

    expect(screen.getByText(/Prepare report/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /apply changes/i }));
    expect(onConfirm).toHaveBeenCalledWith("17:30");
  });

  it("flags an out-of-range time as invalid and disables confirmation", () => {
    const onConfirm = renderDialog();
    const input = screen.getByLabelText("Stop time");

    fireEvent.change(input, { target: { value: "16:50" } });

    expect(input).toHaveAttribute("aria-invalid", "true");
    const confirm = screen.getByRole("button", { name: /apply changes/i });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
