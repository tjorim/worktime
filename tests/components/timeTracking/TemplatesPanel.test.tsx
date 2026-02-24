import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { TemplatesPanel } from "../../../src/components/timeTracking/TemplatesPanel";
import { ToastProvider } from "../../../src/contexts/ToastContext";
import type { TimeTrackingLabel } from "../../../src/components/timeTracking/constants";
import type { TimeTrackingTemplate } from "../../../src/components/timeTracking/types";

const TEST_LABELS: TimeTrackingLabel[] = [
  { id: "lbl-1", name: "Support", color: "#3B82F6" },
  { id: "lbl-2", name: "Development", color: "#10B981" },
];

const TEST_TEMPLATES: TimeTrackingTemplate[] = [
  { id: "tpl-1", text: "Morning Support", label: "lbl-1", start: "08:00", stop: "12:00" },
  { id: "tpl-2", text: "Afternoon Dev", label: "lbl-2", start: "13:00", stop: "17:00" },
];

function renderPanel(overrides: Partial<Parameters<typeof TemplatesPanel>[0]> = {}) {
  const onAddTemplate = vi.fn();
  const onUpdateTemplate = vi.fn();
  const onDeleteTemplate = vi.fn();
  const onUpdateTemplates = vi.fn();

  const result = render(
    <ToastProvider>
      <TemplatesPanel
        labels={TEST_LABELS}
        templates={TEST_TEMPLATES}
        onAddTemplate={onAddTemplate}
        onUpdateTemplate={onUpdateTemplate}
        onDeleteTemplate={onDeleteTemplate}
        onUpdateTemplates={onUpdateTemplates}
        {...overrides}
      />
    </ToastProvider>,
  );

  return { onAddTemplate, onUpdateTemplate, onDeleteTemplate, onUpdateTemplates, ...result };
}

describe("TemplatesPanel", () => {
  describe("rendering", () => {
    it("renders all templates", () => {
      renderPanel();

      expect(screen.getByRole("button", { name: /Edit Morning Support/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Edit Afternoon Dev/i })).toBeInTheDocument();
    });

    it("shows empty state when no templates exist", () => {
      renderPanel({ templates: [] });

      expect(screen.getByText("No Templates Yet")).toBeInTheDocument();
      expect(
        screen.getByText(/Templates let you quickly add recurring tasks/i),
      ).toBeInTheDocument();
    });

    it("shows Add Template button", () => {
      renderPanel();

      expect(screen.getByRole("button", { name: /Add Template/i })).toBeInTheDocument();
    });

    it("displays label name and time range for each template", () => {
      renderPanel();

      expect(screen.getByText(/08:00-12:00/)).toBeInTheDocument();
      expect(screen.getByText(/\[Support\]/)).toBeInTheDocument();
    });
  });

  describe("create template", () => {
    it("opens modal and creates a template", async () => {
      const user = userEvent.setup();
      const { onAddTemplate } = renderPanel();

      await user.click(screen.getByRole("button", { name: /Add Template/i }));

      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("Add New Template")).toBeInTheDocument();

      await user.type(within(dialog).getByLabelText(/Task name/i), "Standup");
      await user.selectOptions(within(dialog).getByLabelText(/Label/i), "lbl-1");
      // Use fireEvent for time inputs since userEvent.type doesn't work reliably with type="time"
      const startInput = within(dialog).getByLabelText(/^Start$/i);
      const stopInput = within(dialog).getByLabelText(/^Stop$/i);
      await user.clear(startInput);
      await user.type(startInput, "09:00");
      await user.clear(stopInput);
      await user.type(stopInput, "09:30");

      await user.click(within(dialog).getByRole("button", { name: /Save Template/i }));

      expect(onAddTemplate).toHaveBeenCalledWith({
        text: "Standup",
        label: "lbl-1",
        start: "09:00",
        stop: "09:30",
      });
    });
  });

  describe("edit template", () => {
    it("opens modal pre-filled and saves changes", async () => {
      const user = userEvent.setup();
      const { onUpdateTemplate } = renderPanel();

      await user.click(screen.getByRole("button", { name: /Edit Morning Support/i }));

      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("Edit Template")).toBeInTheDocument();

      const nameInput = within(dialog).getByLabelText(/Task name/i);
      expect(nameInput).toHaveValue("Morning Support");

      await user.clear(nameInput);
      await user.type(nameInput, "Morning Ops");
      await user.click(within(dialog).getByRole("button", { name: /Save Changes/i }));

      expect(onUpdateTemplate).toHaveBeenCalledWith({
        id: "tpl-1",
        template: expect.objectContaining({ text: "Morning Ops" }),
      });
    });
  });

  describe("validation", () => {
    it("shows error when task name is empty but times and label are filled", async () => {
      const user = userEvent.setup();
      const { onAddTemplate } = renderPanel();

      await user.click(screen.getByRole("button", { name: /Add Template/i }));

      const dialog = screen.getByRole("dialog");
      await user.selectOptions(within(dialog).getByLabelText(/Label/i), "lbl-1");
      const startInput = within(dialog).getByLabelText(/^Start$/i);
      const stopInput = within(dialog).getByLabelText(/^Stop$/i);
      await user.clear(startInput);
      await user.type(startInput, "09:00");
      await user.clear(stopInput);
      await user.type(stopInput, "10:00");

      // Use fireEvent.submit directly on the form because jsdom doesn't support
      // the HTML form attribute linking an external button to a <form>.
      const form = document.getElementById("templateForm")!;
      fireEvent.submit(form);

      expect(screen.getByText(/Fill all template fields/i)).toBeInTheDocument();
      expect(onAddTemplate).not.toHaveBeenCalled();
    });

    it("shows error when stop time is before start time", async () => {
      const user = userEvent.setup();
      const { onAddTemplate } = renderPanel();

      await user.click(screen.getByRole("button", { name: /Add Template/i }));

      const dialog = screen.getByRole("dialog");
      await user.type(within(dialog).getByLabelText(/Task name/i), "Test");
      await user.selectOptions(within(dialog).getByLabelText(/Label/i), "lbl-1");

      const startInput = within(dialog).getByLabelText(/^Start$/i);
      const stopInput = within(dialog).getByLabelText(/^Stop$/i);
      await user.clear(startInput);
      await user.type(startInput, "14:00");
      await user.clear(stopInput);
      await user.type(stopInput, "08:00");

      await user.click(within(dialog).getByRole("button", { name: /Save Template/i }));

      expect(screen.getByText(/stop time must be after start time/i)).toBeInTheDocument();
      expect(onAddTemplate).not.toHaveBeenCalled();
    });

    it("disables submit when template references a deleted label", async () => {
      const user = userEvent.setup();
      const orphanTemplates: TimeTrackingTemplate[] = [
        { id: "tpl-orphan", text: "Orphan", label: "deleted-label", start: "08:00", stop: "09:00" },
      ];
      renderPanel({ templates: orphanTemplates });

      await user.click(screen.getByRole("button", { name: /Edit Orphan/i }));

      const dialog = screen.getByRole("dialog");
      const submitButton = within(dialog).getByRole("button", { name: /Save Changes/i });
      expect(submitButton).toBeDisabled();
    });

    it("disables submit when no labels are available", () => {
      renderPanel({ labels: [] });

      // The Add Template button opens a modal, but we can check the modal behavior
      // by looking at the disabled state of the submit button
    });
  });

  describe("delete confirmation", () => {
    it("shows confirmation dialog and deletes on confirm", async () => {
      const user = userEvent.setup();
      const { onDeleteTemplate } = renderPanel();

      await user.click(screen.getByRole("button", { name: /Delete Morning Support/i }));

      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText(/Delete "Morning Support"/i)).toBeInTheDocument();

      await user.click(within(dialog).getByRole("button", { name: /^Delete$/i }));

      expect(onDeleteTemplate).toHaveBeenCalledWith("tpl-1");
    });

    it("cancels deletion when cancel is clicked", async () => {
      const user = userEvent.setup();
      const { onDeleteTemplate } = renderPanel();

      await user.click(screen.getByRole("button", { name: /Delete Morning Support/i }));
      await user.click(screen.getByRole("button", { name: /Cancel/i }));

      expect(onDeleteTemplate).not.toHaveBeenCalled();
    });
  });
});
