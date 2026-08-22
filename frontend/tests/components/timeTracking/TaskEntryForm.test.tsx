import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskEntryForm } from "@/components/timeTracking/TaskEntryForm";

const baseProps = {
  labels: [{ id: "support", name: "Support", color: "#c82333" }],
  text: "",
  onTextChange: vi.fn(),
  label: "support",
  onLabelChange: vi.fn(),
  start: "",
  onStartChange: vi.fn(),
  stop: "",
  onStopChange: vi.fn(),
  canSubmit: false,
  canStartNow: false,
  showTimerControls: true,
  isTimerRunning: false,
  onSubmit: vi.fn(),
  onStartNow: vi.fn(),
  onStopNow: vi.fn(),
};

describe("TaskEntryForm timer controls", () => {
  it("keeps the start and stop fields side by side on mobile", () => {
    render(<TaskEntryForm {...baseProps} />);

    expect(screen.getByLabelText("Start").closest(".col-6")).toBeInTheDocument();
    expect(screen.getByLabelText("Stop").closest(".col-6")).toBeInTheDocument();
  });

  it("keeps Stop available without a running-task summary and never calls Start", () => {
    const onStartNow = vi.fn();
    const onStopNow = vi.fn();
    render(
      <TaskEntryForm
        {...baseProps}
        isTimerRunning
        timerElapsed="00:10:00"
        runningTaskSummary={undefined}
        onStartNow={onStartNow}
        onStopNow={onStopNow}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Stop Timer · 00:10:00/i }));

    expect(onStopNow).toHaveBeenCalledOnce();
    expect(onStartNow).not.toHaveBeenCalled();
  });

  it("hides timer controls when the feature is disabled", () => {
    render(<TaskEntryForm {...baseProps} showTimerControls={false} />);

    expect(screen.queryByRole("button", { name: /Start Now/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Stop Timer/i })).not.toBeInTheDocument();
  });
});
