import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TaskEditModal, type TaskEditForm } from "@/components/shared/TaskEditModal";

const initial: TaskEditForm = {
  text: "Review",
  label: "support",
  start: "09:00",
  stop: "10:00",
  includesBreak: false,
};
function Editor({
  stop = "10:00",
  onSubmit,
}: {
  stop?: string;
  onSubmit: (value: TaskEditForm) => void;
}) {
  const [value, setValue] = useState({ ...initial, stop });
  return (
    <TaskEditModal
      show
      labels={[{ id: "support", name: "Support", color: "#0055aa" }]}
      value={value}
      onChange={setValue}
      onClose={() => {}}
      onSubmit={() => onSubmit(value)}
      error=""
    />
  );
}

describe("TaskEditModal", () => {
  it("keeps field labels, keyboard checkbox activation and the footer submit connected", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Editor onSubmit={onSubmit} />);
    await user.clear(screen.getByLabelText("Task"));
    await user.type(screen.getByLabelText("Task"), "Updated task");
    const checkbox = screen.getByRole("checkbox", { name: "Includes 30min break" });
    checkbox.focus();
    await user.keyboard(" ");
    expect(checkbox).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(onSubmit).toHaveBeenCalledWith({
      ...initial,
      text: "Updated task",
      includesBreak: true,
    });
  });
  it("disables adding a break to a short task", async () => {
    const user = userEvent.setup();
    render(<Editor stop="09:20" onSubmit={vi.fn()} />);
    const checkbox = screen.getByRole("checkbox", { name: "Includes 30min break" });
    expect(checkbox).toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByText("Includes 30min break"));
    expect(checkbox).not.toBeChecked();
    expect(screen.getByTestId("break-too-short-help")).toBeVisible();
  });
});
