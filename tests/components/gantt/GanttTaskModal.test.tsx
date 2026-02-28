import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { GanttTaskModal } from "../../../src/components/gantt/GanttTaskModal";

describe("GanttTaskModal", () => {
  it("shows validation feedback for required fields", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <GanttTaskModal show onHide={vi.fn()} onSave={onSave} existingTaskIds={["task-1", "task-2"]} />,
    );

    await user.click(screen.getByRole("button", { name: "Add Task" }));

    expect(screen.getByText("Task name is required.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("submits edited values with trimmed optional fields", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <GanttTaskModal
        show
        onHide={vi.fn()}
        onSave={onSave}
        existingTaskIds={["task-1", "task-2", "task-3"]}
      />,
    );

    await user.type(screen.getByLabelText("Name"), "Document API");
    await user.clear(screen.getByLabelText("Dependencies"));
    await user.type(screen.getByLabelText("Dependencies"), " task-1 , missing-id ");
    await user.type(screen.getByLabelText("Notes"), "  Keep this note  ");
    await user.click(screen.getByRole("button", { name: "Add Task" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Document API",
        dependencies: "task-1 , missing-id",
        notes: "Keep this note",
      }),
    );
    expect(screen.getByTestId("unknown-dependencies")).toHaveTextContent("missing-id");
  });

  it("shows edit mode title and delete action", () => {
    render(
      <GanttTaskModal
        show
        onHide={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        existingTaskIds={["task-1"]}
        task={{
          id: "task-1",
          name: "Existing",
          start: "2026-03-01",
          end: "2026-03-03",
          progress: 50,
        }}
      />,
    );

    expect(screen.getByText("Edit Task")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Task" })).toBeInTheDocument();
  });
});
