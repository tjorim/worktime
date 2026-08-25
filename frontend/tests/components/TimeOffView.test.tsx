import { afterEach, describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { TimeOffView } from "@/components/TimeOffView";
import { HdayHelperProvider } from "@/contexts/HdayHelperContext";
import { EventStoreProvider } from "@/contexts/EventStoreContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { DEVICE_PREFERENCES_STORAGE_KEY, USER_STATE_STORAGE_KEY } from "@/constants/storageKeys";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import * as m from "@/paraglide/messages.js";

// Wrapper with all necessary providers
const AllProviders = ({ children }: { children: React.ReactNode }) => (
  <ToastProvider>
    <HdayHelperProvider>
      <SettingsProvider>
        <EventStoreProvider>{children}</EventStoreProvider>
      </SettingsProvider>
    </HdayHelperProvider>
  </ToastProvider>
);

describe("TimeOffView", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  describe("Empty State", () => {
    it("hides the Team view until an .hday helper is configured", () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      expect(screen.queryByRole("button", { name: "Team" })).not.toBeInTheDocument();
    });

    it("shows the Team view only after the configured helper passes its health check", async () => {
      localStorage.setItem(
        DEVICE_PREFERENCES_STORAGE_KEY,
        JSON.stringify({ hdayHelper: { url: "http://localhost:8080" } }),
      );
      server.use(
        http.get("http://localhost:8080/health", () => HttpResponse.json({ status: "ok" })),
      );

      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      expect(screen.queryByRole("button", { name: "Team" })).not.toBeInTheDocument();
      expect(await screen.findByRole("button", { name: "Team" })).toBeInTheDocument();
    });

    it("preserves a saved Team view while the initial helper probe is pending", async () => {
      localStorage.setItem(
        DEVICE_PREFERENCES_STORAGE_KEY,
        JSON.stringify({ hdayHelper: { url: "http://localhost:8080" } }),
      );
      localStorage.setItem(
        USER_STATE_STORAGE_KEY,
        JSON.stringify({ lastUsed: { timeOffView: "team" } }),
      );
      let resolveHealth!: (response: Response) => void;
      const healthResponse = new Promise<Response>((resolve) => {
        resolveHealth = resolve;
      });
      server.use(http.get("http://localhost:8080/health", () => healthResponse));

      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      expect(screen.getByText(m.team_viewer_title())).toBeInTheDocument();

      await act(async () => {
        resolveHealth(HttpResponse.json({ status: "ok" }));
      });
      expect(await screen.findByRole("button", { name: "Team" })).toHaveClass("btn-primary");
      expect(screen.getByText(m.team_viewer_title())).toBeInTheDocument();
    });

    it("keeps the Team view hidden when the configured helper is unhealthy", async () => {
      localStorage.setItem(
        DEVICE_PREFERENCES_STORAGE_KEY,
        JSON.stringify({ hdayHelper: { url: "http://localhost:8080" } }),
      );
      const healthCheck = vi.fn(() => new HttpResponse(null, { status: 503 }));
      server.use(http.get("http://localhost:8080/health", healthCheck));

      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      await waitFor(() => expect(healthCheck).toHaveBeenCalled());
      expect(screen.queryByRole("button", { name: "Team" })).not.toBeInTheDocument();
    });

    it("leaves the Team view when a later helper health check fails", async () => {
      localStorage.setItem(
        DEVICE_PREFERENCES_STORAGE_KEY,
        JSON.stringify({ hdayHelper: { url: "http://localhost:8080" } }),
      );
      let healthy = true;
      const healthCheck = vi.fn(() =>
        healthy ? HttpResponse.json({ status: "ok" }) : new HttpResponse(null, { status: 503 }),
      );
      const intervalCallbacks: TimerHandler[] = [];
      vi.spyOn(window, "setInterval").mockImplementation((handler) => {
        intervalCallbacks.push(handler);
        return intervalCallbacks.length as unknown as NodeJS.Timeout;
      });
      server.use(http.get("http://localhost:8080/health", healthCheck));
      const user = userEvent.setup();

      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      await user.click(await screen.findByRole("button", { name: "Team" }));
      expect(screen.getByText(m.team_viewer_title())).toBeInTheDocument();

      healthy = false;
      intervalCallbacks.forEach((callback) => {
        if (typeof callback === "function") callback();
      });

      await waitFor(() => expect(healthCheck).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(screen.queryByText(m.team_viewer_title())).not.toBeInTheDocument(),
      );
      expect(screen.queryByRole("button", { name: "Team" })).not.toBeInTheDocument();
      expect(screen.getByText(m.team_helper_unavailable_toast())).toBeInTheDocument();
    });

    it("should render empty state when no events", () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      expect(screen.getByText(/No time-off events yet/i)).toBeInTheDocument();
      expect(screen.getByText(/Click "Add Event"/i)).toBeInTheDocument();
    });

    it("should show Add Event button in header", () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const addButton = screen.getByRole("button", { name: /Add Event/i });
      expect(addButton).toBeInTheDocument();
    });

    it("should show the Import button but not Export until an event exists", async () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      expect(screen.getByRole("button", { name: /Import/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Export/i })).not.toBeInTheDocument();

      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /Add Event/i }));
      const startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-01-15");
      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      expect(screen.getByRole("button", { name: /Export/i })).toBeInTheDocument();
    });

    it("should show a user-visible error when .hday file import fails", async () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const user = userEvent.setup();
      const file = new File(["2025/01/15 Vacation day"], "broken.hday", { type: "text/plain" });
      vi.spyOn(file, "text").mockRejectedValue(new Error("Read failed"));

      await user.upload(screen.getByLabelText(/Import \.hday file/i), file);

      const errors = await screen.findAllByText("Failed to import file. Please check the format.");
      expect(errors.length).toBeGreaterThanOrEqual(2);
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
      await user.click(screen.getByRole("button", { name: /Add Event/i }));

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
      await user.click(screen.getByRole("button", { name: /Add Event/i }));

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
    it("opens from an external quick-action request on mount", () => {
      render(
        <AllProviders>
          <TimeOffView addEventRequest={1} />
        </AllProviders>,
      );

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText(/New event/i)).toBeInTheDocument();
    });

    it("should open modal when Add Event button is clicked", async () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const user = userEvent.setup();

      await user.click(screen.getByRole("button", { name: /Add Event/i }));

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

      await user.click(screen.getByRole("button", { name: /Add Event/i }));

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

      await user.click(screen.getByRole("button", { name: /Add Event/i }));

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

      await user.click(screen.getByRole("button", { name: /Add Event/i }));

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
      await user.click(screen.getByRole("button", { name: /Add Event/i }));
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
    it("should delete immediately without a confirmation dialog", async () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const user = userEvent.setup();

      // Add event
      await user.click(screen.getByRole("button", { name: /Add Event/i }));
      const startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-01-15");
      const titleInput = screen.getByLabelText(/Comment/i);
      await user.type(titleInput, "To be deleted");
      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      expect(screen.getByText("To be deleted")).toBeInTheDocument();

      const deleteButton = screen.getByRole("button", { name: /Delete To be deleted/i });
      await user.click(deleteButton);

      // No confirmation dialog — the entry is removed right away.
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await waitFor(() => {
        expect(screen.queryByText("To be deleted")).not.toBeInTheDocument();
      });

      // An undo toast is offered.
      expect(screen.getByText(/Event deleted successfully/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Undo/i })).toBeInTheDocument();
    });

    it("should restore the event when the undo toast action is clicked", async () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const user = userEvent.setup();

      // Add event
      await user.click(screen.getByRole("button", { name: /Add Event/i }));
      const startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-01-15");
      const titleInput = screen.getByLabelText(/Comment/i);
      await user.type(titleInput, "To be deleted");
      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      const deleteButton = screen.getByRole("button", { name: /Delete To be deleted/i });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.queryByText("To be deleted")).not.toBeInTheDocument();
      });

      // Undo restores the entry.
      await user.click(screen.getByRole("button", { name: /Undo/i }));
      await waitFor(() => {
        expect(screen.getByText("To be deleted")).toBeInTheDocument();
      });
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

      await user.click(screen.getByRole("button", { name: /Add Event/i }));

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
    it("hides the Export button when there are no events", () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      expect(screen.queryByRole("button", { name: /Export events/i })).not.toBeInTheDocument();
    });

    it("should show error when exporting with no events via keyboard shortcut", () => {
      render(
        <AllProviders>
          <TimeOffView isActive />
        </AllProviders>,
      );

      // The Export button is hidden with no events, but the Ctrl+S shortcut still
      // reaches the guarded handler directly.
      fireEvent.keyDown(document, { key: "s", ctrlKey: true });

      expect(screen.getByText("No events to export")).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("should have proper ARIA labels on buttons", async () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      expect(screen.getByRole("button", { name: /Add Event/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Import/i })).toBeInTheDocument();

      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /Add Event/i }));
      const startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-01-15");
      await user.click(screen.getByRole("button", { name: /^Add$/i }));

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
      await user.click(screen.getByRole("button", { name: /Add Event/i }));
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
    it("hides the selection toolbar until a row is selected", async () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const user = userEvent.setup();

      expect(screen.queryByRole("button", { name: /Delete Selected/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Select all events/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Clear selection/i })).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /Add Event/i }));
      const startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-01-15");
      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      expect(screen.queryByRole("button", { name: /Delete Selected/i })).not.toBeInTheDocument();

      await user.click(screen.getByRole("checkbox", { name: /Select Holiday/i }));

      expect(screen.getByRole("button", { name: /Delete Selected/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Select all events/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Clear selection/i })).toBeInTheDocument();
    });

    it("should toggle bulk selection using the header checkbox", async () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const user = userEvent.setup();

      await user.click(screen.getByRole("button", { name: /Add Event/i }));
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

    it("should bulk delete selected events after confirmation", async () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const user = userEvent.setup();

      await user.click(screen.getByRole("button", { name: /Add Event/i }));
      const startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-01-15");
      const titleInput = screen.getByLabelText(/Comment/i);
      await user.type(titleInput, "Bulk delete me");
      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      expect(screen.getByText("Bulk delete me")).toBeInTheDocument();

      await user.click(screen.getByRole("checkbox", { name: /Select Bulk delete me/i }));
      await user.click(screen.getByRole("button", { name: /Delete Selected/i }));

      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: /Delete/i }));

      await waitFor(() => {
        expect(screen.queryByText("Bulk delete me")).not.toBeInTheDocument();
      });

      // A bulk delete still offers an undo toast that restores the entries.
      await user.click(screen.getByRole("button", { name: /Undo/i }));
      await waitFor(() => {
        expect(screen.getByText("Bulk delete me")).toBeInTheDocument();
      });
    });
  });
});
