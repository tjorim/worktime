import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { TimeOffView } from "../../src/components/TimeOffView";
import { EventStoreProvider } from "../../src/contexts/EventStoreContext";
import { SettingsProvider } from "../../src/contexts/SettingsContext";
import { ToastProvider } from "../../src/contexts/ToastContext";

// Wrapper with all necessary providers
const AllProviders = ({ children }: { children: React.ReactNode }) => (
  <SettingsProvider>
    <ToastProvider>
      <EventStoreProvider>{children}</EventStoreProvider>
    </ToastProvider>
  </SettingsProvider>
);

describe("TimeOffView", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("Empty State", () => {
    it("should render empty state when no events", () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      expect(screen.getByText(/No time-off events yet/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Create your first event or import an existing .hday file to get started/i),
      ).toBeInTheDocument();
      // Should have Add Event button in empty state
      expect(screen.getAllByRole("button", { name: /Add Event/i }).length).toBeGreaterThan(0);
    });

    it("should show Add Event button in header", () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const addButtons = screen.getAllByRole("button", { name: /Add Event/i });
      // Should have at least one Add Event button (in header and possibly in empty state)
      expect(addButtons.length).toBeGreaterThan(0);
      // First one should be in the toolbar
      expect(addButtons[0]).toHaveAttribute("aria-label", "Add event");
    });

    it("should show Import and Export buttons", () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      expect(screen.getByRole("button", { name: /Import/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Export/i })).toBeInTheDocument();
    });
  });

  describe("Event List", () => {
    it("should render events in a table", async () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const user = userEvent.setup();

      // Open add modal
      await user.click(screen.getAllByRole("button", { name: /Add Event/i })[0]);

      // Fill in event details
      const startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-01-15");

      const titleInput = screen.getByLabelText(/Comment/i);
      await user.type(titleInput, "Test vacation");

      // Submit
      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      // Check event appears in table
      expect(screen.getByText("Test vacation")).toBeInTheDocument();
      expect(within(screen.getByRole("table")).getByText("2025/01/15")).toBeInTheDocument();
    });

    it("should display event type badge", async () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const user = userEvent.setup();

      // Add a business trip event
      await user.click(screen.getAllByRole("button", { name: /Add Event/i })[0]);

      const startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-01-15");

      // Select business trip type
      await user.click(screen.getByLabelText(/Business trip/i));

      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      // Check badge shows business type - use getAllByText since it appears in both badge and flags column
      const matches = screen.getAllByText(/business/i);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0]).toBeInTheDocument();
    });
  });

  describe("Add Event Modal", () => {
    it("should open modal when Add Event button is clicked", async () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const user = userEvent.setup();

      await user.click(screen.getAllByRole("button", { name: /Add Event/i })[0]);

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText(/New event/i)).toBeInTheDocument();
    });

    it("should close modal when cancelled", async () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const user = userEvent.setup();

      await user.click(screen.getAllByRole("button", { name: /Add Event/i })[0]);

      const modal = screen.getByRole("dialog");
      const closeButton = within(modal).getByLabelText(/Close/i);
      await user.click(closeButton);

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("should validate required start date", async () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const user = userEvent.setup();

      await user.click(screen.getAllByRole("button", { name: /Add Event/i })[0]);

      // Try to submit without start date
      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      // Should show validation error
      expect(screen.getByText(/Start date is required/i)).toBeInTheDocument();
    });

    it("should show live preview of .hday line", async () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const user = userEvent.setup();

      await user.click(screen.getAllByRole("button", { name: /Add Event/i })[0]);

      const startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-01-15");

      const titleInput = screen.getByLabelText(/Comment/i);
      await user.type(titleInput, "Preview test");

      // Check preview section - use getAllByText since date might appear multiple times
      expect(screen.getByText(/Raw line/i)).toBeInTheDocument();
      const dateMatches = screen.getAllByText(/2025\/01\/15/i);
      expect(dateMatches.length).toBeGreaterThan(0);
    });
  });

  describe("Edit Event", () => {
    it("should open edit modal with pre-filled data", async () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const user = userEvent.setup();

      // Add event first
      await user.click(screen.getAllByRole("button", { name: /Add Event/i })[0]);
      const startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-01-15");
      const titleInput = screen.getByLabelText(/Comment/i);
      await user.type(titleInput, "Original title");
      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      // Click edit button - find by icon class
      const editButtons = screen.getAllByRole("button");
      const editButton = editButtons.find((btn) => btn.querySelector(".bi-pencil"));
      if (editButton) {
        await user.click(editButton);
      }

      // Modal should show "Edit event" and have the original data - use getAllByText since title might appear in table too
      const editTexts = screen.getAllByText(/Edit event/i);
      expect(editTexts.length).toBeGreaterThan(0);
      const titleInputs = screen.getAllByDisplayValue(/Original title/i);
      expect(titleInputs.length).toBeGreaterThan(0);
    });
  });

  describe("Delete Event", () => {
    it("should show confirmation dialog before deleting", async () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const user = userEvent.setup();

      // Add event
      await user.click(screen.getAllByRole("button", { name: /Add Event/i })[0]);
      const startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-01-15");
      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      const deleteButton = screen.getByRole("button", { name: /Delete Holiday/i });
      await user.click(deleteButton);

      // Confirmation dialog should appear
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText(/Delete Event/i)).toBeInTheDocument();
      expect(within(dialog).getByText(/Are you sure/i)).toBeInTheDocument();
    });

    it("should delete event when confirmed", async () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const user = userEvent.setup();

      // Add event
      await user.click(screen.getAllByRole("button", { name: /Add Event/i })[0]);
      const startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-01-15");
      const titleInput = screen.getByLabelText(/Comment/i);
      await user.type(titleInput, "To be deleted");
      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      expect(screen.getByText("To be deleted")).toBeInTheDocument();

      const deleteButton = screen.getByRole("button", { name: /Delete To be deleted/i });
      await user.click(deleteButton);

      // Confirm deletion - scope to modal to avoid matching table delete buttons
      const modal = await screen.findByRole("dialog");
      const confirmButton = within(modal).getByRole("button", { name: /Delete/i });
      await user.click(confirmButton);

      // Event should be removed
      expect(screen.queryByText("To be deleted")).not.toBeInTheDocument();
      expect(screen.getByText(/No time-off events yet/i)).toBeInTheDocument();
    });
  });

  describe("Weekly Events", () => {
    it("should allow creating weekly events", async () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const user = userEvent.setup();

      await user.click(screen.getAllByRole("button", { name: /Add Event/i })[0]);

      // Select weekly event type
      const eventTypeSelect = screen.getByLabelText(/Event type/i);
      await user.selectOptions(eventTypeSelect, "weekly");

      // Select weekday (e.g., Monday)
      const weekdaySelect = screen.getByLabelText(/Weekday/i);
      await user.selectOptions(weekdaySelect, "1");

      const titleInput = screen.getByLabelText(/Comment/i);
      await user.type(titleInput, "Every Monday");

      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      // Check event appears in table - use getAllByText since title might appear in multiple places
      const matches = screen.getAllByText(/Every Monday/i);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0]).toBeInTheDocument();
    });
  });

  describe("Export", () => {
    it("should show error when exporting with no events", async () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const user = userEvent.setup();

      await user.click(screen.getByRole("button", { name: /Export/i }));

      // Verify error toast appears
      expect(screen.getByText("No events to export")).toBeInTheDocument();
    });
  });

  describe("Import", () => {
    it("should reset raw editor state after file import", async () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const user = userEvent.setup();

      // Switch to raw editor tab and make unsaved changes
      await user.click(screen.getByRole("button", { name: /Raw \.hday/i }));
      const textarea = screen.getByRole("textbox", { name: /Raw \.hday content/i });
      await user.clear(textarea);
      await user.type(textarea, "2025/01/10 # Unsaved edit");

      // Verify Reset button is enabled (indicating dirty state)
      expect(screen.getByRole("button", { name: /Reset/i })).toBeEnabled();

      // Import a file with different content
      const fileContent = "2025/02/15 # Imported event";
      const file = new File([fileContent], "test.hday", { type: "text/plain" });

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) {
        await user.upload(fileInput, file);
      }

      // Wait for import toast
      await screen.findByText(/Imported test.hday/i);

      // Switch to table view to verify import
      await user.click(screen.getByRole("button", { name: /^Table$/i }));

      // Verify event was imported
      expect(screen.getByText("Imported event")).toBeInTheDocument();

      // Switch back to Raw tab to verify editor state
      await user.click(screen.getByRole("button", { name: /Raw \.hday/i }));

      // Verify raw editor is reset (Reset button should be disabled)
      const resetButton = screen.getByRole("button", { name: /Reset/i });
      expect(resetButton).toBeDisabled();

      // Verify raw editor shows imported content (not unsaved edits)
      const updatedTextarea = screen.getByRole("textbox", { name: /Raw \.hday content/i });
      expect(updatedTextarea.value.trim()).toBe(fileContent.trim());
    });
  });

  describe("Accessibility", () => {
    it("should have proper ARIA labels on buttons", () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      expect(screen.getAllByRole("button", { name: /Add Event/i })[0]).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Import/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Export/i })).toBeInTheDocument();
    });

    it("should have proper table structure", async () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const user = userEvent.setup();

      // Add an event to display table
      await user.click(screen.getAllByRole("button", { name: /Add Event/i })[0]);
      const startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-01-15");
      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      // Table should have proper column headers
      expect(screen.getByRole("columnheader", { name: /Type/i })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: /Date \/ Pattern/i })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: /Title/i })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: /Flags/i })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: /Actions/i })).toBeInTheDocument();
    });
  });

  describe("Bulk Actions", () => {
    it("should toggle bulk selection using the header checkbox", async () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const user = userEvent.setup();

      await user.click(screen.getAllByRole("button", { name: /Add Event/i })[0]);
      const startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-01-15");
      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      const headerCheckbox = screen.getByRole("checkbox", { name: /Select all events/i });
      const rowCheckbox = screen.getByRole("checkbox", { name: /Select Holiday/i });

      expect(headerCheckbox).not.toBeChecked();
      expect(rowCheckbox).not.toBeChecked();

      await user.click(headerCheckbox);

      expect(headerCheckbox).toBeChecked();
      expect(rowCheckbox).toBeChecked();

      await user.click(headerCheckbox);

      expect(headerCheckbox).not.toBeChecked();
      expect(rowCheckbox).not.toBeChecked();
    });

    it("should enable undo and redo buttons after adding and undoing", async () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const user = userEvent.setup();

      const undoButton = screen.getByRole("button", { name: /Undo last change/i });
      const redoButton = screen.getByRole("button", { name: /Redo last change/i });

      expect(undoButton).toBeDisabled();
      expect(redoButton).toBeDisabled();

      await user.click(screen.getAllByRole("button", { name: /Add Event/i })[0]);
      const startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-01-15");
      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      expect(undoButton).toBeEnabled();
      expect(redoButton).toBeDisabled();

      await user.click(undoButton);

      expect(redoButton).toBeEnabled();
    });

    it("should bulk delete selected events after confirmation", async () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const user = userEvent.setup();

      await user.click(screen.getAllByRole("button", { name: /Add Event/i })[0]);
      const startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-01-15");
      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      expect(within(screen.getByRole("table")).getByText("2025/01/15")).toBeInTheDocument();

      await user.click(screen.getByRole("checkbox", { name: /Select Holiday/i }));
      await user.click(screen.getByRole("button", { name: /Delete Selected/i }));

      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: /Delete/i }));

      expect(screen.getByText(/No time-off events yet/i)).toBeInTheDocument();
    });
  });

  describe("Raw Content Editor", () => {
    it("should allow applying raw .hday content", async () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const user = userEvent.setup();

      await user.click(screen.getByRole("button", { name: /Raw \.hday/i }));

      const textarea = screen.getByRole("textbox", { name: /Raw \.hday content/i });
      await user.type(textarea, "2025/01/15 # Raw vacation");

      await user.click(screen.getByRole("button", { name: /Apply raw content/i }));

      // Switch to table view to verify event was created
      await user.click(screen.getByRole("button", { name: /^Table$/i }));

      expect(screen.getByText("Raw vacation")).toBeInTheDocument();
    });

    it("should reset raw content back to the stored value", async () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const user = userEvent.setup();

      await user.click(screen.getByRole("button", { name: /Raw \.hday/i }));

      const textarea = screen.getByRole("textbox", { name: /Raw \.hday content/i });
      await user.type(textarea, "2025/01/15 # Raw vacation");

      await user.click(screen.getByRole("button", { name: /Reset/i }));

      expect(textarea).toHaveValue("");
    });

    it("should clear selected indices after applying raw content", async () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const user = userEvent.setup();

      // Add initial events using the UI
      await user.click(screen.getAllByRole("button", { name: /Add Event/i })[0]);
      const startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-01-10");
      const titleInput = screen.getByLabelText(/Comment/i);
      await user.type(titleInput, "Old event 1");
      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      await user.click(screen.getAllByRole("button", { name: /Add Event/i })[0]);
      const startInput2 = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput2);
      await user.type(startInput2, "2025-01-11");
      const titleInput2 = screen.getByLabelText(/Comment/i);
      await user.type(titleInput2, "Old event 2");
      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      // Verify old events exist
      expect(screen.getByText("Old event 1")).toBeInTheDocument();
      expect(screen.getByText("Old event 2")).toBeInTheDocument();

      // Select both events
      await user.click(screen.getByRole("checkbox", { name: /Select Old event 1/i }));
      await user.click(screen.getByRole("checkbox", { name: /Select Old event 2/i }));

      // Verify selections are active (Delete Selected button should be enabled)
      const deleteSelectedButton = screen.getByRole("button", { name: /Delete Selected/i });
      expect(deleteSelectedButton).toBeEnabled();

      // Apply new raw content that replaces all events
      await user.click(screen.getByRole("button", { name: /Raw \.hday/i }));
      const textarea = screen.getByRole("textbox", { name: /Raw \.hday content/i });
      await user.clear(textarea);
      await user.type(textarea, "2025/02/20 # New event from raw");
      await user.click(screen.getByRole("button", { name: /Apply raw content/i }));

      // Switch to table view to verify events
      await user.click(screen.getByRole("button", { name: /^Table$/i }));

      // Verify old events are gone
      expect(screen.queryByText("Old event 1")).not.toBeInTheDocument();
      expect(screen.queryByText("Old event 2")).not.toBeInTheDocument();

      // Verify new event is present
      expect(screen.getByText("New event from raw")).toBeInTheDocument();

      // Crucially: verify no events are selected after applying raw content
      const deleteSelectedButtonAfter = screen.getByRole("button", { name: /Delete Selected/i });
      expect(deleteSelectedButtonAfter).toBeDisabled();
    });

    it("should show unsaved changes indicator when switching away from raw tab with dirty content", async () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const user = userEvent.setup();

      // Switch to raw tab
      await user.click(screen.getByRole("button", { name: /Raw \.hday/i }));

      // Make changes without applying
      const textarea = screen.getByRole("textbox", { name: /Raw \.hday content/i });
      await user.type(textarea, "2025/01/15 # Unsaved changes");

      // Switch to table view
      await user.click(screen.getByRole("button", { name: /^Table$/i }));

      // Verify the Raw .hday button shows unsaved changes indicator
      const rawButton = screen.getByRole("button", { name: /Raw \.hday/i });
      expect(rawButton).toHaveTextContent("•");

      // Switch back to raw tab
      await user.click(rawButton);

      // Indicator should disappear when on raw tab
      expect(rawButton).not.toHaveTextContent("•");
    });
  });
});
