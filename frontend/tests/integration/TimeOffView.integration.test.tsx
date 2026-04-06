import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { TimeOffView } from "../../src/components/TimeOffView";
import { DeveloperOptionsProvider } from "../../src/contexts/DeveloperOptionsContext";
import { EventStoreProvider } from "../../src/contexts/EventStoreContext";
import { SettingsProvider } from "../../src/contexts/SettingsContext";
import { ToastProvider } from "../../src/contexts/ToastContext";
import { TIME_OFF_STORAGE_KEY } from "../../src/contexts/EventStoreContext";
import {
  SIMPLE_HDAY,
  MULTI_TYPE_HDAY,
  WEEKLY_EVENTS_HDAY,
  EVENT_FLAGS_HDAY,
  COMPLEX_HDAY,
} from "../fixtures/hday";

function renderWithProviders() {
  return render(
    <ToastProvider>
      <DeveloperOptionsProvider>
        <SettingsProvider>
          <EventStoreProvider>
            <TimeOffView />
          </EventStoreProvider>
        </SettingsProvider>
      </DeveloperOptionsProvider>
    </ToastProvider>,
  );
}

describe("TimeOffView Integration Tests", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("View Switching", () => {
    it("switches between table and statistics views", async () => {
      const user = userEvent.setup();
      renderWithProviders();

      // Table view starts active
      expect(screen.getByText(/No time-off events yet/i)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /Statistics/i }));
      expect(screen.getByRole("region", { name: /Vacation statistics/i })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /^Table$/i }));
      expect(screen.getByText(/No time-off events yet/i)).toBeInTheDocument();
    });

    it("restores the last used Time Off view from settings state", () => {
      localStorage.setItem(
        "worktime_user_state",
        JSON.stringify({
          version: 2,
          hasCompletedOnboarding: true,
          myTeam: null,
          scheduleType: "9-5",
          settings: {
            timeFormat: "24h",
            theme: "auto",
            notifications: "off",
            vacationAllowance: { yearlyAmounts: {}, unit: "days", hoursPerDay: 8 },
            enableTimeOff: true,
            enableTimeTracking: true,
          },
          lastUsed: {
            activeTab: "timeoff",
            scheduleView: "today",
            otherSchedule: null,
            timeOffView: "stats",
            timeTrackingView: "daily",
            otherTeam: null,
          },
        }),
      );

      renderWithProviders();

      expect(screen.getByRole("region", { name: /Vacation statistics/i })).toBeInTheDocument();
    });
  });

  describe("Import and Display Workflow", () => {
    it("imports simple .hday content via import and renders events correctly", async () => {
      const user = userEvent.setup();
      renderWithProviders();

      // Import content via file import
      const fileInput = screen.getByLabelText(/Import \.hday file/i);
      const file = new File([SIMPLE_HDAY], "test.hday", { type: "text/plain" });
      await user.upload(fileInput, file);

      // Verify all events are rendered in table view
      expect(screen.getByText("Vacation day")).toBeInTheDocument();
      expect(screen.getByText("Week vacation")).toBeInTheDocument();
      expect(screen.getByText("Doctor appointment")).toBeInTheDocument();

      // Verify dates appear in table
      expect(within(screen.getByRole("table")).getByText("2025/01/15")).toBeInTheDocument();
      expect(within(screen.getByRole("table")).getByText(/2025\/02\/10/)).toBeInTheDocument();
      expect(within(screen.getByRole("table")).getByText("2025/03/20")).toBeInTheDocument();
    });

    it("imports .hday content via file upload and renders events correctly", async () => {
      const user = userEvent.setup();
      renderWithProviders();

      // Create a mock file with .hday content
      const fileContent = SIMPLE_HDAY;
      const file = new File([fileContent], "test.hday", { type: "text/plain" });

      // Find the file input by its accessible name and upload the file
      const fileInput = screen.getByLabelText(/Import \.hday file/i);
      await user.upload(fileInput, file);

      // Wait for import toast
      await screen.findByText(/Imported test.hday/i);

      // Verify events are rendered in table
      expect(screen.getByText("Vacation day")).toBeInTheDocument();
      expect(screen.getByText("Week vacation")).toBeInTheDocument();
      expect(screen.getByText("Doctor appointment")).toBeInTheDocument();
    });

    it("imports content with multiple event types and displays type badges", async () => {
      const user = userEvent.setup();
      renderWithProviders();

      // Import via file
      const fileInput = screen.getByLabelText(/Import \.hday file/i);
      const file = new File([MULTI_TYPE_HDAY], "test.hday", { type: "text/plain" });
      await user.upload(fileInput, file);

      // Verify different event types are present (use getAllByText since titles can appear multiple times)
      expect(screen.getAllByText("Regular vacation").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Business trip").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Training course").length).toBeGreaterThan(0);
      expect(screen.getAllByText("In office").length).toBeGreaterThan(0);

      // Verify type labels appear in badges  - note that badges show title if present
      // Check the flags column which shows the raw flag names
      const table = screen.getByRole("table");
      expect(within(table).getByText("business")).toBeInTheDocument();
      expect(within(table).getByText("course")).toBeInTheDocument();
    });

    it("imports weekly events and displays them correctly", async () => {
      const user = userEvent.setup();
      renderWithProviders();

      // Import weekly events
      const fileInput = screen.getByLabelText(/Import \.hday file/i);
      const file = new File([WEEKLY_EVENTS_HDAY], "test.hday", { type: "text/plain" });
      await user.upload(fileInput, file);

      // Verify weekly events show pattern instead of dates
      expect(screen.getByText("Every Mon")).toBeInTheDocument();
      expect(screen.getByText("Every Fri")).toBeInTheDocument();
    });

    it("imports events with flags and displays flag symbols", async () => {
      const user = userEvent.setup();
      renderWithProviders();

      // Import events with flags
      const fileInput = screen.getByLabelText(/Import \.hday file/i);
      const file = new File([EVENT_FLAGS_HDAY], "test.hday", { type: "text/plain" });
      await user.upload(fileInput, file);

      // Verify events are displayed
      expect(screen.getByText("Half day AM")).toBeInTheDocument();
      expect(screen.getByText("Half day PM")).toBeInTheDocument();
      expect(screen.getByText("Business trip onsite")).toBeInTheDocument();

      // Verify flag symbols (◐ = AM symbol, ◑ = PM symbol)
      const table = screen.getByRole("table");
      // The symbols appear in the type badge
      expect(within(table).getByText(/◐/)).toBeInTheDocument(); // Half day AM symbol
      expect(within(table).getByText(/◑/)).toBeInTheDocument(); // Half day PM symbol
    });

    it("keeps the raw editor synced with imported content", async () => {
      const user = userEvent.setup();
      renderWithProviders();

      const fileInput = screen.getByLabelText(/Import \.hday file/i);
      const file = new File([SIMPLE_HDAY], "test.hday", { type: "text/plain" });
      await user.upload(fileInput, file);

      await user.click(screen.getByRole("button", { name: /Raw \.hday Editor/i }));

      const textarea = screen.getByLabelText(/Raw \.hday content/i);
      expect((textarea as HTMLTextAreaElement).value.trim()).toBe(SIMPLE_HDAY.trim());
    });

    it("applies pasted raw .hday text through the explicit raw editor", async () => {
      const user = userEvent.setup();
      renderWithProviders();

      await user.click(screen.getByRole("button", { name: /Raw \.hday Editor/i }));

      const textarea = screen.getByLabelText(/Raw \.hday content/i);
      await user.clear(textarea);
      await user.type(textarea, "2025/12/24 # Christmas Eve");

      await user.click(screen.getByRole("button", { name: /Apply raw content/i }));

      expect(screen.getByText("Christmas Eve")).toBeInTheDocument();
      expect(within(screen.getByRole("table")).getByText("2025/12/24")).toBeInTheDocument();
    });
  });

  describe("Full CRUD Workflow", () => {
    it("completes full CRUD lifecycle: create, read, update, delete", async () => {
      const user = userEvent.setup();
      renderWithProviders();

      // === CREATE ===
      // Add a new event via UI
      await user.click(screen.getByRole("button", { name: /Add Event/i }));

      const startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-06-15");

      const titleInput = screen.getByLabelText(/Comment/i);
      await user.type(titleInput, "Summer vacation");

      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      // === READ ===
      // Verify event appears in table
      expect(screen.getByText("Summer vacation")).toBeInTheDocument();
      expect(within(screen.getByRole("table")).getByText("2025/06/15")).toBeInTheDocument();

      // Verify localStorage persistence
      const stored = localStorage.getItem(TIME_OFF_STORAGE_KEY);
      expect(stored).toContain("Summer vacation");
      expect(stored).toContain("2025/06/15");

      // === UPDATE ===
      // Find and click edit button using accessible name
      const editButton = screen.getByRole("button", { name: /Edit Summer vacation/i });
      await user.click(editButton);

      // Modify the event
      const editTitleInput = screen.getByDisplayValue("Summer vacation");
      await user.clear(editTitleInput);
      await user.type(editTitleInput, "Updated summer vacation");

      // Save changes
      await user.click(screen.getByRole("button", { name: /Update/i }));

      // Verify updated event appears
      expect(screen.getByText("Updated summer vacation")).toBeInTheDocument();
      expect(screen.queryByText("Summer vacation")).not.toBeInTheDocument();

      // Verify updated localStorage
      const updatedStored = localStorage.getItem(TIME_OFF_STORAGE_KEY);
      expect(updatedStored).toContain("Updated summer vacation");
      expect(updatedStored).not.toContain("# Summer vacation");

      // === DELETE ===
      // Click delete button
      const deleteButton = screen.getByRole("button", {
        name: /Delete Updated summer vacation/i,
      });
      await user.click(deleteButton);

      // Confirm deletion in dialog
      const dialog = await screen.findByRole("dialog");
      const confirmButton = within(dialog).getByRole("button", { name: /Delete/i });
      await user.click(confirmButton);

      // Verify event is removed
      expect(screen.queryByText("Updated summer vacation")).not.toBeInTheDocument();
      expect(screen.getByText(/No time-off events yet/i)).toBeInTheDocument();

      // Verify localStorage is updated (should be empty or not contain the event)
      const finalStored = localStorage.getItem(TIME_OFF_STORAGE_KEY);
      if (finalStored) {
        expect(finalStored).not.toContain("Updated summer vacation");
      }
    }, 15000);

    it("creates event with flags and persists them correctly", async () => {
      const user = userEvent.setup();
      renderWithProviders();

      // Create business trip with flags
      await user.click(screen.getByRole("button", { name: /Add Event/i }));

      const startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-07-20");

      const endInput = screen.getByLabelText(/End \(YYYY\/MM\/DD\)/i);
      await user.clear(endInput);
      await user.type(endInput, "2025-07-25");

      const titleInput = screen.getByLabelText(/Comment/i);
      await user.type(titleInput, "Conference");

      // Select business trip type
      await user.click(screen.getByLabelText(/Business trip/i));

      // Select onsite flag
      await user.click(screen.getByLabelText(/Onsite/i));

      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      // Verify event in table
      expect(screen.getByText("Conference")).toBeInTheDocument();

      // Verify localStorage has correctly persisted flags in .hday format
      const stored = localStorage.getItem(TIME_OFF_STORAGE_KEY);
      expect(stored).toBeTruthy();
      // The event should be serialized as: bw2025/07/20-2025/07/25 # Conference
      expect(stored).toMatch(/bw2025\/07\/20-2025\/07\/25 # Conference/);

      // Verify the Business type badge appears in the table
      const badges = screen.getAllByText(/Business/i);
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  describe("Persistence and Serialization", () => {
    it("persists modified events to localStorage in .hday format", async () => {
      const user = userEvent.setup();
      renderWithProviders();

      // Create a few events via UI
      await user.click(screen.getByRole("button", { name: /Add Event/i }));
      let startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-08-10");
      let titleInput = screen.getByLabelText(/Comment/i);
      await user.type(titleInput, "First event");
      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      await user.click(screen.getByRole("button", { name: /Add Event/i }));
      startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-08-15");
      titleInput = screen.getByLabelText(/Comment/i);
      await user.type(titleInput, "Second event");
      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      // Verify localStorage has both events in correct .hday format
      const stored = localStorage.getItem(TIME_OFF_STORAGE_KEY);
      expect(stored).toContain("2025/08/10");
      expect(stored).toContain("First event");
      expect(stored).toContain("2025/08/15");
      expect(stored).toContain("Second event");

      // Verify .hday format structure (date # comment)
      expect(stored).toMatch(/2025\/08\/10 # First event/);
      expect(stored).toMatch(/2025\/08\/15 # Second event/);
    }, 15000);

    it("serializes complex events with correct .hday format", async () => {
      const user = userEvent.setup();
      renderWithProviders();

      // Import complex content
      const fileInput = screen.getByLabelText(/Import \.hday file/i);
      const file = new File([COMPLEX_HDAY], "test.hday", { type: "text/plain" });
      await user.upload(fileInput, file);

      // Verify localStorage contains all event types in correct format
      const stored = localStorage.getItem(TIME_OFF_STORAGE_KEY);

      // Check range events
      expect(stored).toContain("2025/01/15");
      expect(stored).toContain("New Year vacation");

      // Check business trip with date range
      expect(stored).toContain("b2025/02/10-2025/02/14");
      expect(stored).toContain("Conference trip");

      // Check weekly events
      expect(stored).toContain("d1k"); // Monday in office
      expect(stored).toContain("d5"); // Friday

      // Check events with flags
      expect(stored).toContain("a2025/03/20"); // Half day AM
      expect(stored).toContain("p2025/05/10"); // Half day PM
      expect(stored).toContain("s2025/04/05-2025/04/07"); // Training
    });
  });

  describe("State Management", () => {
    it("persists events across component remounts", async () => {
      const user = userEvent.setup();
      const { unmount } = renderWithProviders();

      // Add an event
      await user.click(screen.getByRole("button", { name: /Add Event/i }));
      const startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-09-01");
      const titleInput = screen.getByLabelText(/Comment/i);
      await user.type(titleInput, "Persistent event");
      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      // Verify event exists
      expect(screen.getByText("Persistent event")).toBeInTheDocument();

      // Unmount and remount
      unmount();
      renderWithProviders();

      // Event should still be there after remount
      expect(screen.getByText("Persistent event")).toBeInTheDocument();
    });

    it("loads events from localStorage on initial render", () => {
      // Pre-populate localStorage
      localStorage.setItem(TIME_OFF_STORAGE_KEY, SIMPLE_HDAY);

      renderWithProviders();

      // Events should be loaded and displayed
      expect(screen.getByText("Vacation day")).toBeInTheDocument();
      expect(screen.getByText("Week vacation")).toBeInTheDocument();
      expect(screen.getByText("Doctor appointment")).toBeInTheDocument();
    });

    it("maintains undo/redo state through multiple operations", async () => {
      const user = userEvent.setup();
      renderWithProviders();

      const undoButton = screen.getByRole("button", { name: /Undo last change/i });
      const redoButton = screen.getByRole("button", { name: /Redo last change/i });

      // Initially both should be disabled
      expect(undoButton).toBeDisabled();
      expect(redoButton).toBeDisabled();

      // Add first event
      await user.click(screen.getByRole("button", { name: /Add Event/i }));
      let startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-10-01");
      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      // Undo should be enabled
      expect(undoButton).toBeEnabled();
      expect(redoButton).toBeDisabled();

      // Add second event
      await user.click(screen.getByRole("button", { name: /Add Event/i }));
      startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-10-02");
      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      // Undo first operation
      await user.click(undoButton);

      // Redo should now be enabled
      expect(undoButton).toBeEnabled();
      expect(redoButton).toBeEnabled();

      // Redo the undone operation
      await user.click(redoButton);

      // Both events should be present
      expect(within(screen.getByRole("table")).getByText("2025/10/01")).toBeInTheDocument();
      expect(within(screen.getByRole("table")).getByText("2025/10/02")).toBeInTheDocument();
    });
  });

  describe("Display and Grouping", () => {
    it("displays all imported events in table view without date filtering", async () => {
      // Table view shows all events without date-range filtering.
      // Date-range filtering is handled by CalendarView when using getEventsInRange.
      const user = userEvent.setup();
      renderWithProviders();

      // Import events with various dates
      const fileInput = screen.getByLabelText(/Import \.hday file/i);
      const file = new File([SIMPLE_HDAY], "test.hday", { type: "text/plain" });
      await user.upload(fileInput, file);

      // All three events should be visible (no date filtering in table view)
      expect(screen.getByText("Vacation day")).toBeInTheDocument();
      expect(screen.getByText("Week vacation")).toBeInTheDocument();
      expect(screen.getByText("Doctor appointment")).toBeInTheDocument();
    });

    it("displays events grouped by type in statistics view", async () => {
      const user = userEvent.setup();
      renderWithProviders();

      // Import multi-type events
      const fileInput = screen.getByLabelText(/Import \.hday file/i);
      const file = new File([MULTI_TYPE_HDAY], "test.hday", { type: "text/plain" });
      await user.upload(fileInput, file);

      // Switch to statistics view
      await user.click(screen.getByRole("button", { name: /Statistics/i }));

      // Verify statistics view groups events by type
      const statsRegion = screen.getByRole("region", { name: /Vacation statistics/i });
      expect(statsRegion).toBeInTheDocument();

      // Statistics should show breakdown by event type
      // (The exact text depends on the implementation, but we're verifying the view renders)
      expect(within(statsRegion).getByText(/Holiday/i)).toBeInTheDocument();
    });
  });

  describe("Bulk Operations", () => {
    it("bulk deletes selected events and updates localStorage", async () => {
      const user = userEvent.setup();
      renderWithProviders();

      // Add multiple events
      await user.click(screen.getByRole("button", { name: /Add Event/i }));
      let startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-11-01");
      let titleInput = screen.getByLabelText(/Comment/i);
      await user.type(titleInput, "Event 1");
      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      await user.click(screen.getByRole("button", { name: /Add Event/i }));
      startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-11-02");
      titleInput = screen.getByLabelText(/Comment/i);
      await user.type(titleInput, "Event 2");
      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      await user.click(screen.getByRole("button", { name: /Add Event/i }));
      startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-11-03");
      titleInput = screen.getByLabelText(/Comment/i);
      await user.type(titleInput, "Event 3");
      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      // Select first two events
      await user.click(screen.getByRole("checkbox", { name: /Select Event 1/i }));
      await user.click(screen.getByRole("checkbox", { name: /Select Event 2/i }));

      // Delete selected
      await user.click(screen.getByRole("button", { name: /Delete Selected/i }));

      // Confirm in dialog
      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: /Delete/i }));

      // Verify only Event 3 remains
      expect(screen.queryByText("Event 1")).not.toBeInTheDocument();
      expect(screen.queryByText("Event 2")).not.toBeInTheDocument();
      expect(screen.getByText("Event 3")).toBeInTheDocument();

      // Verify localStorage updated correctly
      const stored = localStorage.getItem(TIME_OFF_STORAGE_KEY);
      expect(stored).not.toContain("Event 1");
      expect(stored).not.toContain("Event 2");
      expect(stored).toContain("Event 3");
    }, 15000);
  });
});
