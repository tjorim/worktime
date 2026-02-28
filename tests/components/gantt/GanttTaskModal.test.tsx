import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { GanttTaskModal } from "../../../src/components/gantt/GanttTaskModal";

vi.mock("react-select", () => ({
  default: ({
    options,
    value,
    onChange,
    inputId,
    isMulti,
    placeholder,
  }: {
    options: Array<{ value: string; label: string }>;
    value: Array<{ value: string; label: string }> | { value: string; label: string } | null;
    onChange: (
      selected: Array<{ value: string; label: string }> | { value: string; label: string } | null,
    ) => void;
    inputId?: string;
    isMulti?: boolean;
    placeholder?: string;
  }) => {
    const selectedValues = Array.isArray(value)
      ? value.map((v) => v.value)
      : value
        ? [value.value]
        : [];
    return (
      <select
        multiple={isMulti}
        id={inputId}
        aria-label={placeholder}
        value={selectedValues}
        onChange={(e) => {
          if (isMulti) {
            onChange(
              Array.from(e.target.selectedOptions).map((o) => ({ value: o.value, label: o.text })),
            );
          } else {
            const selected = e.target.value
              ? { value: e.target.value, label: e.target.options[e.target.selectedIndex].text }
              : null;
            onChange(selected);
          }
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  },
}));

describe("GanttTaskModal", () => {
  it("shows validation feedback for required fields", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <GanttTaskModal
        show
        onHide={vi.fn()}
        onSave={onSave}
        existingTasks={[
          { id: "task-1", name: "Task One" },
          { id: "task-2", name: "Task Two" },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add Task" }));

    expect(screen.getByText("Task name is required.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("submits with selected dependencies", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <GanttTaskModal
        show
        onHide={vi.fn()}
        onSave={onSave}
        existingTasks={[
          { id: "task-1", name: "Task One" },
          { id: "task-2", name: "Task Two" },
          { id: "task-3", name: "Task Three" },
        ]}
      />,
    );

    await user.type(screen.getByLabelText("Name"), "Document API");
    await user.selectOptions(screen.getByLabelText("Search tasks…"), ["task-1"]);
    await user.type(screen.getByLabelText("Notes"), "  Keep this note  ");
    await user.click(screen.getByRole("button", { name: "Add Task" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Document API",
        dependencies: "task-1",
        notes: "Keep this note",
      }),
    );
  });

  it("shows edit mode title and delete action", () => {
    render(
      <GanttTaskModal
        show
        onHide={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        existingTasks={[{ id: "task-1", name: "Task One" }]}
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

  it("preserves orphaned dependency ID on save", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <GanttTaskModal
        show
        onHide={vi.fn()}
        onSave={onSave}
        existingTasks={[{ id: "task-1", name: "Task One" }]}
        task={{
          id: "editing-task",
          name: "Editing",
          start: "2026-03-01",
          end: "2026-03-03",
          progress: 0,
          dependencies: "orphaned-id",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        dependencies: "orphaned-id",
      }),
    );
  });
});
