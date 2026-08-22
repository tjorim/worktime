import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { MobileQuickActions } from "@/components/MobileQuickActions";
import { TestProviders } from "@tests/utils/testProviders";

const { mockAddTask } = vi.hoisted(() => ({ mockAddTask: vi.fn().mockResolvedValue(true) }));

vi.mock("@/hooks/useTimeTrackingStorage", () => ({
  useTimeTrackingStorage: () => ({
    tasks: [],
    labels: [{ id: "support", name: "Support", color: "#0d6efd" }],
    addTask: mockAddTask,
  }),
}));

describe("MobileQuickActions", () => {
  it("starts a timer directly from the quick sheet", async () => {
    const user = userEvent.setup();
    render(
      <TestProviders>
        <MobileQuickActions
          canAddTimeOff
          canTrackTime
          onAddTimeOff={vi.fn()}
          onTrackTime={vi.fn()}
          onOpenCalendar={vi.fn()}
        />
      </TestProviders>,
    );

    await user.click(screen.getByRole("button", { name: "Open quick actions" }));
    await user.type(screen.getByRole("textbox", { name: "Task" }), "Customer support");
    await user.click(screen.getByRole("button", { name: "Start Now" }));

    expect(mockAddTask).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Customer support", label: "support" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens an accessible dialog and runs an action", async () => {
    const user = userEvent.setup();
    const onAddTimeOff = vi.fn();
    render(
      <TestProviders>
        <MobileQuickActions
          canAddTimeOff
          canTrackTime
          onAddTimeOff={onAddTimeOff}
          onTrackTime={vi.fn()}
          onOpenCalendar={vi.fn()}
        />
      </TestProviders>,
    );

    const trigger = screen.getByRole("button", { name: "Open quick actions" });
    await user.click(trigger);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Add time off" }));

    expect(onAddTimeOff).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("hides actions that are unavailable", async () => {
    const user = userEvent.setup();
    const onOpenCalendar = vi.fn();
    render(
      <TestProviders>
        <MobileQuickActions
          canAddTimeOff={false}
          canTrackTime={false}
          onAddTimeOff={vi.fn()}
          onTrackTime={vi.fn()}
          onOpenCalendar={onOpenCalendar}
        />
      </TestProviders>,
    );

    await user.click(screen.getByRole("button", { name: "Open quick actions" }));

    expect(screen.queryByRole("button", { name: "Add time off" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Track time & location" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open calendar" }));
    expect(onOpenCalendar).toHaveBeenCalledOnce();
  });
});
