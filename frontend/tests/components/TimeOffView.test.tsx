import { afterEach, describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { TimeOffView } from "@/components/TimeOffView";
import { HdayHelperProvider, useHdayHelper } from "@/contexts/HdayHelperContext";
import { useSettings } from "@/contexts/SettingsContext";
import { EventStoreProvider } from "@/contexts/EventStoreContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { DEVICE_PREFERENCES_STORAGE_KEY, USER_STATE_STORAGE_KEY } from "@/constants/storageKeys";
import { http, HttpResponse } from "msw";
import { hdayChangeEmitter } from "@/mocks/data/hdayChangeEmitter";
import { server } from "@/mocks/server";
import * as m from "@/paraglide/messages.js";

/**
 * Mocks the helper's `GET /hday/:username/events` change-notification stream
 * so tests that connect a helper don't hit an unhandled-request error the
 * moment TimeOffView subscribes. Silent until a test calls
 * `hdayChangeEmitter.emit(username, etag)`.
 */
function mockHdayChangeEventsStream() {
  server.use(
    http.get("http://localhost:8080/hday/:username/events", ({ params }) => {
      const username = String(params.username);
      let ctrl: ReadableStreamDefaultController<Uint8Array> | undefined;
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          ctrl = c;
          hdayChangeEmitter._add(username, c);
        },
        cancel() {
          if (ctrl) hdayChangeEmitter._remove(username, ctrl);
        },
      });
      return new HttpResponse(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
    }),
  );
}

/** Seeds a connected helper (health check ok) with the given .hday username and mocks its change stream. */
function seedConnectedHelperWithUsername(username: string | null) {
  localStorage.setItem(
    DEVICE_PREFERENCES_STORAGE_KEY,
    JSON.stringify({ hdayHelper: { url: "http://localhost:8080" } }),
  );
  localStorage.setItem(
    USER_STATE_STORAGE_KEY,
    JSON.stringify({ settings: { hdayUsername: username } }),
  );
  server.use(http.get("http://localhost:8080/health", () => HttpResponse.json({ status: "ok" })));
  mockHdayChangeEventsStream();
}

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

// Test-only harness for driving updateHdayHelperUrl() from outside TimeOffView,
// sharing the same HdayHelperContext instance as the rendered TimeOffView —
// simulates the helper becoming reachable after the component already mounted.
function HelperUrlSwitcher({ url }: { url: string }) {
  const { updateHdayHelperUrl } = useHdayHelper();
  return (
    <button type="button" onClick={() => updateHdayHelperUrl(url)}>
      switch helper
    </button>
  );
}

// Test-only harness for driving updateHdayUsername() from outside TimeOffView,
// sharing the same SettingsContext instance as the rendered TimeOffView —
// simulates the user switching their configured .hday username mid-sync.
function UsernameSwitcher({ username }: { username: string | null }) {
  const { updateHdayUsername } = useSettings();
  return (
    <button type="button" onClick={() => updateHdayUsername(username)}>
      switch username
    </button>
  );
}

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

  describe("Pull from helper", () => {
    it("hides the Pull button when no helper is configured", () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      expect(
        screen.queryByRole("button", { name: m.timeoff_pull_events_aria() }),
      ).not.toBeInTheDocument();
    });

    it("hides the Pull button when the helper is connected but no username is saved", async () => {
      seedConnectedHelperWithUsername(null);

      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      // Wait for the helper health probe to resolve before asserting absence.
      expect(await screen.findByRole("button", { name: "Team" })).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: m.timeoff_pull_events_aria() }),
      ).not.toBeInTheDocument();
    });

    it("pulls the user's .hday file from the helper and imports it", async () => {
      seedConnectedHelperWithUsername("jsmith");
      server.use(
        http.get("http://localhost:8080/hday/jsmith", () =>
          HttpResponse.json({
            username: "jsmith",
            raw: "2025/01/15 # Day off\n",
            etag: "sha256:abc",
            events: [],
          }),
        ),
      );

      const user = userEvent.setup();
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const pullButton = await screen.findByRole("button", {
        name: m.timeoff_pull_events_aria(),
      });
      await user.click(pullButton);

      expect(
        await screen.findByText(m.timeoff_pulled({ username: "jsmith" })),
      ).toBeInTheDocument();
      expect(within(screen.getByRole("table")).getByText("2025/01/15")).toBeInTheDocument();
    });

    it("shows a not-found message when the helper has no file for the username yet", async () => {
      seedConnectedHelperWithUsername("newuser");
      server.use(
        http.get(
          "http://localhost:8080/hday/newuser",
          () => new HttpResponse(null, { status: 404 }),
        ),
      );

      const user = userEvent.setup();
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const pullButton = await screen.findByRole("button", {
        name: m.timeoff_pull_events_aria(),
      });
      await user.click(pullButton);

      expect(
        await screen.findByText(m.timeoff_pull_not_found({ username: "newuser" })),
      ).toBeInTheDocument();
    });

    it("surfaces the server's detail message when the pull request fails", async () => {
      seedConnectedHelperWithUsername("jsmith");
      server.use(
        http.get("http://localhost:8080/hday/jsmith", () =>
          HttpResponse.json({ detail: "share unreachable" }, { status: 503 }),
        ),
      );

      const user = userEvent.setup();
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const pullButton = await screen.findByRole("button", {
        name: m.timeoff_pull_events_aria(),
      });
      await user.click(pullButton);

      expect(
        await screen.findByText(m.timeoff_pull_failed({ error: "share unreachable" })),
      ).toBeInTheDocument();
    });
  });

  describe("Push to helper", () => {
    it("hides the Push button when no helper is configured", () => {
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      expect(
        screen.queryByRole("button", { name: m.timeoff_push_events_aria() }),
      ).not.toBeInTheDocument();
    });

    it("hides the Push button when the helper is connected but no username is saved", async () => {
      seedConnectedHelperWithUsername(null);

      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      expect(await screen.findByRole("button", { name: "Team" })).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: m.timeoff_push_events_aria() }),
      ).not.toBeInTheDocument();
    });

    it("pushes without an etag on the first push, then remembers the etag the helper returns", async () => {
      seedConnectedHelperWithUsername("jsmith");
      const receivedBodies: unknown[] = [];
      server.use(
        http.put("http://localhost:8080/hday/jsmith", async ({ request }) => {
          receivedBodies.push(await request.json());
          return HttpResponse.json({ etag: "sha256:first" });
        }),
      );

      const user = userEvent.setup();
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const pushButton = await screen.findByRole("button", {
        name: m.timeoff_push_events_aria(),
      });
      await user.click(pushButton);

      expect(
        await screen.findByText(m.timeoff_pushed({ username: "jsmith" })),
      ).toBeInTheDocument();
      expect(receivedBodies).toEqual([{ raw: "" }]);

      // A second push now includes the etag the helper returned from the first one.
      await user.click(pushButton);
      await waitFor(() => expect(receivedBodies).toHaveLength(2));
      expect(receivedBodies[1]).toEqual({ raw: "", etag: "sha256:first" });
    });

    it("sends the last-pulled etag on push", async () => {
      seedConnectedHelperWithUsername("jsmith");
      server.use(
        http.get("http://localhost:8080/hday/jsmith", () =>
          HttpResponse.json({
            username: "jsmith",
            raw: "2025/01/15 # Day off\n",
            etag: "sha256:pulled",
            events: [],
          }),
        ),
      );
      const receivedBodies: unknown[] = [];
      server.use(
        http.put("http://localhost:8080/hday/jsmith", async ({ request }) => {
          receivedBodies.push(await request.json());
          return HttpResponse.json({ etag: "sha256:pushed" });
        }),
      );

      const user = userEvent.setup();
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      await user.click(
        await screen.findByRole("button", { name: m.timeoff_pull_events_aria() }),
      );
      await screen.findByText(m.timeoff_pulled({ username: "jsmith" }));

      await user.click(screen.getByRole("button", { name: m.timeoff_push_events_aria() }));

      await waitFor(() => expect(receivedBodies).toHaveLength(1));
      expect(receivedBodies[0]).toMatchObject({ etag: "sha256:pulled" });
    });

    it("shows a conflict message on a 409 without overwriting the helper's file", async () => {
      seedConnectedHelperWithUsername("jsmith");
      server.use(
        http.put(
          "http://localhost:8080/hday/jsmith",
          () => new HttpResponse(null, { status: 409 }),
        ),
      );

      const user = userEvent.setup();
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      await user.click(
        await screen.findByRole("button", { name: m.timeoff_push_events_aria() }),
      );

      expect(await screen.findByText(m.timeoff_push_conflict())).toBeInTheDocument();
    });

    it("surfaces the server's detail message when the push request fails", async () => {
      seedConnectedHelperWithUsername("jsmith");
      server.use(
        http.put("http://localhost:8080/hday/jsmith", () =>
          HttpResponse.json({ detail: "share unreachable" }, { status: 503 }),
        ),
      );

      const user = userEvent.setup();
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      await user.click(
        await screen.findByRole("button", { name: m.timeoff_push_events_aria() }),
      );

      expect(
        await screen.findByText(m.timeoff_push_failed({ error: "share unreachable" })),
      ).toBeInTheDocument();
    });

    it("queues an edit that arrives mid-push instead of racing, and sends it with the latest etag once free", async () => {
      seedConnectedHelperWithUsername("jsmith");
      let resolveFirstPut!: (response: Response) => void;
      const firstPutResponse = new Promise<Response>((resolve) => {
        resolveFirstPut = resolve;
      });
      const receivedBodies: unknown[] = [];
      let callCount = 0;
      server.use(
        http.put("http://localhost:8080/hday/jsmith", async ({ request }) => {
          receivedBodies.push(await request.json());
          callCount += 1;
          return callCount === 1 ? firstPutResponse : HttpResponse.json({ etag: "sha256:second" });
        }),
      );

      const user = userEvent.setup();
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const pushButton = await screen.findByRole("button", {
        name: m.timeoff_push_events_aria(),
      });
      await user.click(pushButton); // manual push starts, pending on firstPutResponse
      await waitFor(() => expect(callCount).toBe(1));

      // A local edit while that push is still in flight schedules an
      // auto-push after the debounce — it must queue behind the in-flight
      // one instead of racing it with a now-stale etag.
      await user.click(screen.getByRole("button", { name: /Add Event/i }));
      const startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-12-01");
      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      // Wait past the debounce while the first push is still deliberately
      // unresolved: the queued push must not fire as a second concurrent
      // request.
      await new Promise((resolve) => setTimeout(resolve, 3500));
      expect(callCount).toBe(1);

      await act(async () => {
        resolveFirstPut(HttpResponse.json({ etag: "sha256:first" }));
      });

      await waitFor(() => expect(callCount).toBe(2), { timeout: 5000 });
      expect(receivedBodies[1]).toMatchObject({
        etag: "sha256:first",
        raw: expect.stringContaining("2025/12/01"),
      });
    }, 15000);

    it("does not race a push against an in-flight pull, and runs the queued push once the pull completes", async () => {
      seedConnectedHelperWithUsername("jsmith");
      let resolveGet!: (response: Response) => void;
      const pullResponse = new Promise<Response>((resolve) => {
        resolveGet = resolve;
      });
      server.use(http.get("http://localhost:8080/hday/jsmith", () => pullResponse));
      let putCallCount = 0;
      server.use(
        http.put("http://localhost:8080/hday/jsmith", () => {
          putCallCount += 1;
          return HttpResponse.json({ etag: "sha256:queued" });
        }),
      );

      const user = userEvent.setup();
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      const pullButton = await screen.findByRole("button", {
        name: m.timeoff_pull_events_aria(),
      });
      await user.click(pullButton); // pull starts, pending on pullResponse

      // Both toolbar buttons must be disabled while any sync operation is
      // running, not just the one that started it — otherwise a click here
      // would bypass the in-flight guard's own race window.
      expect(pullButton).toBeDisabled();
      expect(screen.getByRole("button", { name: m.timeoff_push_events_aria() })).toBeDisabled();

      // A local edit while the pull is in flight schedules an auto-push; it
      // must queue behind the pull rather than firing a concurrent PUT.
      await user.click(screen.getByRole("button", { name: /Add Event/i }));
      const startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-10-15");
      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      await new Promise((resolve) => setTimeout(resolve, 3500)); // past the debounce
      expect(putCallCount).toBe(0); // still queued behind the in-flight pull

      await act(async () => {
        resolveGet(
          HttpResponse.json({
            username: "jsmith",
            raw: "2025/01/01 # From share\n",
            etag: "sha256:from-share",
            events: [],
          }),
        );
      });
      await screen.findByText(m.timeoff_pulled({ username: "jsmith" }));

      // The queued push isn't stuck forever — it runs once the pull's lock
      // is released.
      await waitFor(() => expect(putCallCount).toBe(1), { timeout: 5000 });
    }, 15000);
  });

  describe("Auto-push on edit", () => {
    it("silently pushes after a debounced pause following a local edit", async () => {
      seedConnectedHelperWithUsername("jsmith");
      const receivedBodies: unknown[] = [];
      server.use(
        http.put("http://localhost:8080/hday/jsmith", async ({ request }) => {
          receivedBodies.push(await request.json());
          return HttpResponse.json({ etag: "sha256:auto" });
        }),
      );

      const user = userEvent.setup();
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );
      await screen.findByRole("button", { name: m.timeoff_push_events_aria() });

      await user.click(screen.getByRole("button", { name: /Add Event/i }));
      const startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-08-01");
      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      // Still debouncing immediately after the edit.
      expect(receivedBodies).toHaveLength(0);

      await waitFor(() => expect(receivedBodies).toHaveLength(1), { timeout: 5000 });
      expect(receivedBodies[0]).toMatchObject({ raw: expect.stringContaining("2025/08/01") });
      // Auto-push is silent on success — no toast, unlike a manual push.
      expect(
        screen.queryByText(m.timeoff_pushed({ username: "jsmith" })),
      ).not.toBeInTheDocument();
    }, 10000);

    it("the auto-push that follows a pull is an idempotent no-op, not a conflict", async () => {
      // The auto-push effect fires after any entries change, pulls included —
      // deliberately not suppressed (see TimeOffView.tsx) since suppressing
      // it via a "skip once" flag previously stranded genuine edits whenever
      // that flag went unconsumed. Sending the just-pulled content back with
      // the just-pulled etag is safe: the helper sees matching content and
      // etag, so it succeeds rather than conflicting.
      seedConnectedHelperWithUsername("jsmith");
      server.use(
        http.get("http://localhost:8080/hday/jsmith", () =>
          HttpResponse.json({
            username: "jsmith",
            raw: "2025/09/01 # Day off\n",
            etag: "sha256:from-share",
            events: [],
          }),
        ),
      );
      const receivedBodies: unknown[] = [];
      server.use(
        http.put("http://localhost:8080/hday/jsmith", async ({ request }) => {
          receivedBodies.push(await request.json());
          return HttpResponse.json({ etag: "sha256:from-share" });
        }),
      );

      const user = userEvent.setup();
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      await user.click(
        await screen.findByRole("button", { name: m.timeoff_pull_events_aria() }),
      );
      await screen.findByText(m.timeoff_pulled({ username: "jsmith" }));

      await waitFor(() => expect(receivedBodies).toHaveLength(1), { timeout: 5000 });
      expect(receivedBodies[0]).toMatchObject({ etag: "sha256:from-share" });
      // Silent: no push-success toast, and no conflict warning either.
      expect(
        screen.queryByText(m.timeoff_pushed({ username: "jsmith" })),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(m.timeoff_push_conflict())).not.toBeInTheDocument();
    }, 10000);

    it("pushes a genuine edit that follows a pull, not just the pulled content", async () => {
      seedConnectedHelperWithUsername("jsmith");
      server.use(
        http.get("http://localhost:8080/hday/jsmith", () =>
          HttpResponse.json({
            username: "jsmith",
            raw: "2025/09/01 # Day off\n",
            etag: "sha256:from-share",
            events: [],
          }),
        ),
      );
      const receivedBodies: unknown[] = [];
      server.use(
        http.put("http://localhost:8080/hday/jsmith", async ({ request }) => {
          receivedBodies.push(await request.json());
          return HttpResponse.json({ etag: `sha256:v${receivedBodies.length}` });
        }),
      );

      const user = userEvent.setup();
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      await user.click(
        await screen.findByRole("button", { name: m.timeoff_pull_events_aria() }),
      );
      await screen.findByText(m.timeoff_pulled({ username: "jsmith" }));

      await user.click(screen.getByRole("button", { name: /Add Event/i }));
      const startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-10-10");
      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      // Both the post-pull no-op push and the push for the new edit land —
      // the important thing is the edit is never stranded.
      await waitFor(
        () =>
          expect(
            receivedBodies.some(
              (body) =>
                typeof body === "object"
                && body !== null
                && "raw" in body
                && typeof body.raw === "string"
                && body.raw.includes("2025/10/10"),
            ),
          ).toBe(true),
        { timeout: 5000 },
      );
    }, 10000);

    it("auto-pushes an edit made before the helper was connected, once it connects", async () => {
      // No helper URL configured yet — canUseHdayHelperSync starts false, so
      // the edit below must not be silently stranded once it does connect.
      localStorage.setItem(
        USER_STATE_STORAGE_KEY,
        JSON.stringify({ settings: { hdayUsername: "jsmith" } }),
      );
      server.use(
        http.get("http://localhost:8080/health", () => HttpResponse.json({ status: "ok" })),
      );
      mockHdayChangeEventsStream();
      const receivedBodies: unknown[] = [];
      server.use(
        http.put("http://localhost:8080/hday/jsmith", async ({ request }) => {
          receivedBodies.push(await request.json());
          return HttpResponse.json({ etag: "sha256:later" });
        }),
      );

      const user = userEvent.setup();
      render(
        <AllProviders>
          <HelperUrlSwitcher url="http://localhost:8080" />
          <TimeOffView />
        </AllProviders>,
      );

      await user.click(screen.getByRole("button", { name: /Add Event/i }));
      const startInput = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
      await user.clear(startInput);
      await user.type(startInput, "2025-11-01");
      await user.click(screen.getByRole("button", { name: /^Add$/i }));

      expect(receivedBodies).toHaveLength(0);

      await user.click(screen.getByRole("button", { name: "switch helper" }));

      await waitFor(() => expect(receivedBodies.length).toBeGreaterThan(0), { timeout: 5000 });
      expect(receivedBodies[0]).toMatchObject({ raw: expect.stringContaining("2025/11/01") });
    }, 10000);
  });

  describe("Stale target guard", () => {
    it("discards a pull response for a username the user has since switched away from", async () => {
      seedConnectedHelperWithUsername("alice");
      let resolveGet!: (response: Response) => void;
      const pullResponse = new Promise<Response>((resolve) => {
        resolveGet = resolve;
      });
      server.use(http.get("http://localhost:8080/hday/alice", () => pullResponse));

      const user = userEvent.setup();
      render(
        <AllProviders>
          <UsernameSwitcher username="bob" />
          <TimeOffView />
        </AllProviders>,
      );

      await user.click(
        await screen.findByRole("button", { name: m.timeoff_pull_events_aria() }),
      );
      // Switch to a different username while alice's pull is still pending.
      await user.click(screen.getByRole("button", { name: "switch username" }));

      await act(async () => {
        resolveGet(
          HttpResponse.json({
            username: "alice",
            raw: "2025/03/03 # Alice's day off\n",
            etag: "sha256:alice",
            events: [],
          }),
        );
      });

      // Neither the success toast nor alice's imported entry should appear —
      // the response belongs to a target the user has already left.
      expect(
        screen.queryByText(m.timeoff_pulled({ username: "alice" })),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("2025/03/03")).not.toBeInTheDocument();
    });

    it("discards a push response for a username the user has since switched away from", async () => {
      seedConnectedHelperWithUsername("alice");
      let resolvePut!: (response: Response) => void;
      const putResponse = new Promise<Response>((resolve) => {
        resolvePut = resolve;
      });
      server.use(http.put("http://localhost:8080/hday/alice", () => putResponse));

      const user = userEvent.setup();
      render(
        <AllProviders>
          <UsernameSwitcher username="bob" />
          <TimeOffView />
        </AllProviders>,
      );

      await user.click(
        await screen.findByRole("button", { name: m.timeoff_push_events_aria() }),
      );
      await user.click(screen.getByRole("button", { name: "switch username" }));

      await act(async () => {
        resolvePut(HttpResponse.json({ etag: "sha256:alice" }));
      });

      expect(
        screen.queryByText(m.timeoff_pushed({ username: "alice" })),
      ).not.toBeInTheDocument();
    });
  });

  describe("Remote change notifications", () => {
    it("shows a banner when the helper reports an etag we haven't synced", async () => {
      seedConnectedHelperWithUsername("jsmith");

      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );
      await screen.findByRole("button", { name: m.timeoff_pull_events_aria() });

      act(() => {
        hdayChangeEmitter.emit("jsmith", "sha256:new-on-share");
      });

      expect(await screen.findByText(m.timeoff_hday_changed_remotely())).toBeInTheDocument();
    });

    it("does not show a banner for an echo of this device's own push, but does for a genuine remote change", async () => {
      seedConnectedHelperWithUsername("jsmith");
      server.use(
        http.put("http://localhost:8080/hday/jsmith", () =>
          HttpResponse.json({ etag: "sha256:mine" }),
        ),
      );

      const user = userEvent.setup();
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );

      await user.click(
        await screen.findByRole("button", { name: m.timeoff_push_events_aria() }),
      );
      await screen.findByText(m.timeoff_pushed({ username: "jsmith" }));

      act(() => {
        hdayChangeEmitter.emit("jsmith", "sha256:mine");
      });

      // The echo above travels through an async pipeline (fetch -> TextDecoderStream ->
      // EventSourceParserStream), so checking absence immediately after act() could pass
      // vacuously just because processing hasn't happened yet, not because it was suppressed.
      // Give it a real chance to run before trusting the absence check below.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(screen.queryByText(m.timeoff_hday_changed_remotely())).not.toBeInTheDocument();

      // Further prove the stream is live end-to-end: a genuine remote change (distinguishable
      // etag) delivered over the same connection should still surface the banner.
      act(() => {
        hdayChangeEmitter.emit("jsmith", "sha256:someone-elses-change");
      });

      expect(await screen.findByText(m.timeoff_hday_changed_remotely())).toBeInTheDocument();
    });

    it("pulling from the banner clears it and imports the file", async () => {
      seedConnectedHelperWithUsername("jsmith");
      server.use(
        http.get("http://localhost:8080/hday/jsmith", () =>
          HttpResponse.json({
            username: "jsmith",
            raw: "2025/07/04 # Day off\n",
            etag: "sha256:new-on-share",
            events: [],
          }),
        ),
      );

      const user = userEvent.setup();
      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );
      await screen.findByRole("button", { name: m.timeoff_pull_events_aria() });

      act(() => {
        hdayChangeEmitter.emit("jsmith", "sha256:new-on-share");
      });
      const banner = await screen.findByText(m.timeoff_hday_changed_remotely());

      await user.click(
        within(banner.closest(".alert") as HTMLElement).getByRole("button", {
          name: m.timeoff_pull_btn(),
        }),
      );

      expect(
        await screen.findByText(m.timeoff_pulled({ username: "jsmith" })),
      ).toBeInTheDocument();
      expect(screen.queryByText(m.timeoff_hday_changed_remotely())).not.toBeInTheDocument();
      expect(within(screen.getByRole("table")).getByText("2025/07/04")).toBeInTheDocument();
    });

    it("dismissing the banner hides it without pulling", async () => {
      seedConnectedHelperWithUsername("jsmith");

      render(
        <AllProviders>
          <TimeOffView />
        </AllProviders>,
      );
      await screen.findByRole("button", { name: m.timeoff_pull_events_aria() });

      act(() => {
        hdayChangeEmitter.emit("jsmith", "sha256:new-on-share");
      });
      const banner = await screen.findByText(m.timeoff_hday_changed_remotely());

      await userEvent.setup().click(
        within(banner.closest(".alert") as HTMLElement).getByRole("button", { name: /close/i }),
      );

      expect(screen.queryByText(m.timeoff_hday_changed_remotely())).not.toBeInTheDocument();
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
