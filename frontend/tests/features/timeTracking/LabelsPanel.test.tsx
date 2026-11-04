import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { LabelsPanel } from "@/features/timeTracking/LabelsPanel";
import { ToastProvider } from "@/contexts/ToastContext";
import { SettingsReplacementError } from "@/utils/apiError";
import type { Label } from "@/lib/timeTracking/constants";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "@/lib/timeTracking/types";

const TEST_LABELS: Label[] = [
  { id: "lbl-1", name: "Support", color: "#3B82F6" },
  { id: "lbl-2", name: "Development", color: "#10B981" },
];

const EMPTY_TEMPLATES: TimeTrackingTemplate[] = [];
const EMPTY_TASKS: StoredTimeTrackingTask[] = [];

function renderPanel(overrides: Partial<Parameters<typeof LabelsPanel>[0]> = {}) {
  const onUpdateLabels = vi.fn();
  const onReassignAndDeleteLabel = vi.fn().mockResolvedValue(undefined);
  const result = render(
    <ToastProvider>
      <LabelsPanel
        labels={TEST_LABELS}
        templates={EMPTY_TEMPLATES}
        tasks={EMPTY_TASKS}
        ganttTasks={[]}
        onUpdateLabels={onUpdateLabels}
        onReassignAndDeleteLabel={onReassignAndDeleteLabel}
        {...overrides}
      />
    </ToastProvider>,
  );
  return { onUpdateLabels, onReassignAndDeleteLabel, ...result };
}

describe("LabelsPanel", () => {
  describe("rendering", () => {
    it("renders all labels", () => {
      renderPanel();

      expect(screen.getByText("Support")).toBeInTheDocument();
      expect(screen.getByText("Development")).toBeInTheDocument();
    });

    it("shows label count", () => {
      renderPanel();

      expect(screen.getByText("2 labels configured.")).toBeInTheDocument();
    });

    it("shows singular label count", () => {
      renderPanel({ labels: [TEST_LABELS[0]!] });

      expect(screen.getByText("1 label configured.")).toBeInTheDocument();
    });

    it("shows empty state when no labels exist", () => {
      renderPanel({ labels: [] });

      expect(screen.getByText("No Labels Yet")).toBeInTheDocument();
      expect(screen.getByText(/Labels help categorize your time entries/i)).toBeInTheDocument();
    });

    it("shows Add Label button", () => {
      renderPanel();

      expect(screen.getByRole("button", { name: /Add Label/i })).toBeInTheDocument();
    });
  });

  describe("create label", () => {
    it("opens modal and creates a label", async () => {
      const user = userEvent.setup();
      const { onUpdateLabels } = renderPanel();

      await user.click(screen.getByRole("button", { name: /Add Label/i }));

      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("Add New Label")).toBeInTheDocument();

      await user.type(within(dialog).getByLabelText(/Label name/i), "Meeting");
      await user.click(within(dialog).getByRole("button", { name: /Save Label/i }));

      expect(onUpdateLabels).toHaveBeenCalledTimes(1);
      const newLabels = onUpdateLabels.mock.calls[0]![0];
      expect(newLabels).toHaveLength(3);
      expect(newLabels[2]!.name).toBe("Meeting");
    });
  });

  describe("edit label", () => {
    it("opens modal pre-filled and saves changes", async () => {
      const user = userEvent.setup();
      const { onUpdateLabels } = renderPanel();

      await user.click(screen.getByRole("button", { name: /Edit Support/i }));

      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("Edit Label")).toBeInTheDocument();

      const nameInput = within(dialog).getByLabelText(/Label name/i);
      expect(nameInput).toHaveValue("Support");

      await user.clear(nameInput);
      await user.type(nameInput, "Operations");
      await user.click(within(dialog).getByRole("button", { name: /Save Changes/i }));

      expect(onUpdateLabels).toHaveBeenCalledTimes(1);
      const updatedLabels = onUpdateLabels.mock.calls[0]![0];
      expect(updatedLabels[0]!.name).toBe("Operations");
      expect(updatedLabels[0]!.id).toBe("lbl-1");
    });
  });

  describe("duplicate detection", () => {
    it("shows error when creating a label with a duplicate name", async () => {
      const user = userEvent.setup();
      const { onUpdateLabels } = renderPanel();

      await user.click(screen.getByRole("button", { name: /Add Label/i }));

      const dialog = screen.getByRole("dialog");
      await user.type(within(dialog).getByLabelText(/Label name/i), "support");
      await user.click(within(dialog).getByRole("button", { name: /Save Label/i }));

      expect(screen.getByText("Label name must be unique.")).toBeInTheDocument();
      expect(onUpdateLabels).not.toHaveBeenCalled();
    });
  });

  describe("usage tracking", () => {
    it("shows usage counts when label is referenced by templates and tasks", () => {
      const templates: TimeTrackingTemplate[] = [
        { id: "tpl-1", text: "Template", label: "lbl-1", start: "08:00", stop: "09:00" },
      ];
      const tasks: StoredTimeTrackingTask[] = [
        {
          id: "task-1",
          text: "Task A",
          label: "lbl-1",
          startTime: "2026-02-07T08:00",
          stopTime: "2026-02-07T09:00",
        },
        {
          id: "task-2",
          text: "Task B",
          label: "lbl-1",
          startTime: "2026-02-07T10:00",
          stopTime: "2026-02-07T11:00",
        },
      ];

      renderPanel({ templates, tasks });

      expect(screen.getByText("Used by 1 template and 2 tasks")).toBeInTheDocument();
    });
  });

  describe("delete protection", () => {
    const supportTask: StoredTimeTrackingTask = {
      id: "task-1",
      text: "Task",
      label: "lbl-1",
      startTime: "2026-02-07T08:00",
      stopTime: "2026-02-07T09:00",
    };

    it("keeps delete disabled for an in-use label when there is nothing to move it to", async () => {
      const user = userEvent.setup();
      renderPanel({ labels: [TEST_LABELS[0]!], tasks: [supportTask] });

      const deleteButton = screen.getByRole("button", { name: /Delete Support/i });
      expect(deleteButton).toBeDisabled();

      await user.hover(deleteButton.parentElement!);
      expect(await screen.findByText(/Add another label to move them to/i)).toBeVisible();
    });

    it("lets an in-use label be deleted once another label exists", () => {
      renderPanel({ tasks: [supportTask] });

      expect(screen.getByRole("button", { name: /Delete Support/i })).toBeEnabled();
    });

    it("counts Gantt tasks as usage", () => {
      renderPanel({ ganttTasks: [{ label: "lbl-2" }, { label: "lbl-2" }, {}] });

      expect(screen.getByText("Used by 2 Gantt tasks")).toBeInTheDocument();
    });

    it("enables delete button for unused labels", () => {
      renderPanel();

      const deleteButton = screen.getByRole("button", { name: /Delete Support/i });
      expect(deleteButton).toBeEnabled();
    });
  });

  describe("reassign and delete", () => {
    const templates: TimeTrackingTemplate[] = [
      { id: "tpl-1", text: "Template", label: "lbl-1", start: "08:00", stop: "09:00" },
    ];
    const tasks: StoredTimeTrackingTask[] = [
      {
        id: "task-1",
        text: "Task",
        label: "lbl-1",
        startTime: "2026-02-07T08:00",
        stopTime: "2026-02-07T09:00",
      },
    ];
    const ganttTasks = [{ label: "lbl-1" }];

    it("shows what will move and waits for a replacement before enabling the confirm button", async () => {
      const user = userEvent.setup();
      renderPanel({ templates, tasks, ganttTasks });

      await user.click(screen.getByRole("button", { name: /Delete Support/i }));

      const dialog = screen.getByRole("alertdialog");
      expect(
        within(dialog).getByText(/used by 1 template, 1 task, and 1 Gantt task/i),
      ).toBeInTheDocument();
      const confirm = within(dialog).getByRole("button", { name: "Move and delete" });
      expect(confirm).toBeDisabled();

      const select = within(dialog).getByLabelText("Move them to");
      // The label being deleted cannot be its own replacement.
      expect(within(select).queryByRole("option", { name: "Support" })).toBeNull();
      await user.selectOptions(select, "lbl-2");
      expect(confirm).toBeEnabled();
    });

    it("reassigns to the chosen label instead of deleting it directly", async () => {
      const user = userEvent.setup();
      const { onUpdateLabels, onReassignAndDeleteLabel } = renderPanel({
        templates,
        tasks,
        ganttTasks,
      });

      await user.click(screen.getByRole("button", { name: /Delete Support/i }));
      const dialog = screen.getByRole("alertdialog");
      await user.selectOptions(within(dialog).getByLabelText("Move them to"), "lbl-2");
      await user.click(within(dialog).getByRole("button", { name: "Move and delete" }));

      expect(onReassignAndDeleteLabel).toHaveBeenCalledExactlyOnceWith("lbl-1", "lbl-2");
      expect(onUpdateLabels).not.toHaveBeenCalled();
      expect(
        await screen.findByText(
          'Moved 1 template, 1 task, and 1 Gantt task to "Development" and deleted "Support".',
        ),
      ).toBeVisible();
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    });

    it("keeps the label and explains a partial failure", async () => {
      const user = userEvent.setup();
      const { onReassignAndDeleteLabel } = renderPanel({ templates, tasks, ganttTasks });
      onReassignAndDeleteLabel.mockRejectedValue(new SettingsReplacementError(1, 2));

      await user.click(screen.getByRole("button", { name: /Delete Support/i }));
      const dialog = screen.getByRole("alertdialog");
      await user.selectOptions(within(dialog).getByLabelText("Move them to"), "lbl-2");
      await user.click(within(dialog).getByRole("button", { name: "Move and delete" }));

      expect(await screen.findByText(/this label was not deleted/i)).toBeVisible();
      expect(screen.getByText("Support")).toBeInTheDocument();
    });

    it("does not offer a replacement for an unused label", async () => {
      const user = userEvent.setup();
      renderPanel();

      await user.click(screen.getByRole("button", { name: /Delete Support/i }));

      const dialog = screen.getByRole("alertdialog");
      expect(within(dialog).queryByLabelText("Move them to")).toBeNull();
      expect(within(dialog).getByRole("button", { name: /^Delete$/ })).toBeEnabled();
    });
  });

  describe("delete confirmation", () => {
    it("shows confirmation dialog and deletes on confirm", async () => {
      const user = userEvent.setup();
      const { onUpdateLabels } = renderPanel();

      await user.click(screen.getByRole("button", { name: /Delete Support/i }));

      const dialog = screen.getByRole("alertdialog");
      expect(within(dialog).getByText(/Delete "Support"/i)).toBeInTheDocument();

      await user.click(within(dialog).getByRole("button", { name: /^Delete$/i }));

      expect(onUpdateLabels).toHaveBeenCalledTimes(1);
      const remainingLabels = onUpdateLabels.mock.calls[0]![0];
      expect(remainingLabels).toHaveLength(1);
      expect(remainingLabels[0]!.id).toBe("lbl-2");
    });

    it("cancels deletion when cancel is clicked", async () => {
      const user = userEvent.setup();
      const { onUpdateLabels } = renderPanel();

      await user.click(screen.getByRole("button", { name: /Delete Support/i }));
      await user.click(screen.getByRole("button", { name: /Cancel/i }));

      expect(onUpdateLabels).not.toHaveBeenCalled();
    });
  });
});
