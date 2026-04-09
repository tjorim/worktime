import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOngoingSync } from "@/hooks/useOngoingSync";
import {
  appendToSyncOutbox,
  getSyncOutboxSize,
  storeSyncCursor,
} from "@/utils/syncClient";
import { getSyncCursorKey, getSyncOutboxKey } from "@/constants/storageKeys";

const mockFetch = vi.fn();

const emptySyncPayload = () => ({
  labels: [],
  tasks: [],
  templates: [],
  work_locations: [],
  time_off_entries: [],
});

const emptyPushResponse = { results: {} };

const incrementalPullResponse = {
  labels: [],
  tasks: [],
  templates: [],
  work_locations: [],
  time_off_entries: [],
  server_timestamp: "2026-02-01T00:00:00.000Z",
};

describe("useOngoingSync", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("navigator", { ...navigator, onLine: true });
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("returns no-op state when isSyncEstablished is false", () => {
    const { result } = renderHook(() =>
      useOngoingSync(false, "user-1", mockFetch),
    );
    expect(result.current.isSyncing).toBe(false);
    expect(result.current.lastSyncedAt).toBeNull();
    expect(result.current.outboxCount).toBe(0);
    // enqueueChange should be a no-op (no fetch calls)
    result.current.enqueueChange(emptySyncPayload());
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns no-op state when userId is null", () => {
    const { result } = renderHook(() => useOngoingSync(true, null, mockFetch));
    result.current.enqueueChange(emptySyncPayload());
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns no-op state when fetchFn is null", () => {
    const { result } = renderHook(() => useOngoingSync(true, "user-1", null));
    result.current.enqueueChange(emptySyncPayload());
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("initialises lastSyncedAt from existing cursor in localStorage", () => {
    storeSyncCursor("user-1", "2026-01-15T00:00:00.000Z");
    const { result } = renderHook(() =>
      useOngoingSync(true, "user-1", mockFetch),
    );
    expect(result.current.lastSyncedAt).toBe("2026-01-15T00:00:00.000Z");
  });

  it("initialises outboxCount from existing outbox in localStorage", () => {
    appendToSyncOutbox("user-1", emptySyncPayload());
    appendToSyncOutbox("user-1", emptySyncPayload());
    // Prevent the initial flush by marking the device as offline.
    vi.stubGlobal("navigator", { ...navigator, onLine: false });

    storeSyncCursor("user-1", "2026-01-01T00:00:00.000Z");
    const { result } = renderHook(() =>
      useOngoingSync(true, "user-1", mockFetch),
    );
    expect(result.current.outboxCount).toBe(2);
  });

  describe("enqueueChange", () => {
    it("pushes the change immediately when online and updates lastSyncedAt", async () => {
      storeSyncCursor("user-1", "2026-01-01T00:00:00.000Z");
      const refreshedStatus = {
        labels_updated_at: null,
        tasks_updated_at: "2026-01-02T00:00:00.000Z",
        templates_updated_at: null,
        work_locations_updated_at: null,
        time_off_entries_updated_at: null,
        preferences_updated_at: null,
        server_timestamp: "2026-01-02T00:00:00.000Z",
      };
      // Mocks are consumed in order:
      // 1. Initial flush on mount: no outbox push, but pulls incremental changes
      // 2. enqueueChange: push succeeds
      // 3. enqueueChange: status refresh returns new cursor
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => incrementalPullResponse }) // initial pull
        .mockResolvedValueOnce({ ok: true, json: async () => emptyPushResponse }) // enqueueChange push
        .mockResolvedValueOnce({ ok: true, json: async () => refreshedStatus }); // status refresh

      const { result } = renderHook(() =>
        useOngoingSync(true, "user-1", mockFetch),
      );

      // Wait for initial flush to complete.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      const change = emptySyncPayload();
      change.tasks.push({
        id: "task-1",
        action: "create",
        client_updated_at: "2026-01-02T00:00:00.000Z",
        text: "Test task",
        label_id: null,
        start_time: "2026-01-02T08:00:00.000Z",
        stop_time: null,
        includes_break: false,
      });

      await act(async () => {
        result.current.enqueueChange(change);
      });

      await waitFor(() => {
        expect(result.current.lastSyncedAt).toBe("2026-01-02T00:00:00.000Z");
      });

      const pushCall = mockFetch.mock.calls.find(
        ([url]: [string]) => url === "/db/sync/push",
      );
      expect(pushCall).toBeDefined();
      // Outbox should remain empty after successful push
      expect(result.current.outboxCount).toBe(0);
      expect(getSyncOutboxSize("user-1")).toBe(0);
    });

    it("queues the change in the outbox when push fails", async () => {
      storeSyncCursor("user-1", "2026-01-01T00:00:00.000Z");
      mockFetch.mockResolvedValue({ ok: false });

      const { result } = renderHook(() =>
        useOngoingSync(true, "user-1", mockFetch),
      );

      const change = emptySyncPayload();
      change.tasks.push({
        id: "task-offline",
        action: "create",
        client_updated_at: "2026-01-02T00:00:00.000Z",
        text: "Offline task",
        label_id: null,
        start_time: "2026-01-02T08:00:00.000Z",
        stop_time: null,
        includes_break: false,
      });

      await act(async () => {
        result.current.enqueueChange(change);
      });

      await waitFor(() => {
        expect(result.current.outboxCount).toBe(1);
      });

      expect(getSyncOutboxSize("user-1")).toBe(1);
      const outboxRaw = localStorage.getItem(getSyncOutboxKey("user-1"));
      expect(outboxRaw).not.toBeNull();
      const outbox = JSON.parse(outboxRaw!);
      expect(outbox[0].tasks[0].id).toBe("task-offline");
    });
  });

  describe("flush and pull on visibility change", () => {
    it("flushes outbox and pulls incremental data when tab becomes visible", async () => {
      storeSyncCursor("user-1", "2026-01-01T00:00:00.000Z");
      appendToSyncOutbox("user-1", {
        ...emptySyncPayload(),
        tasks: [
          {
            id: "queued-task",
            action: "create",
            client_updated_at: "2026-01-01T12:00:00.000Z",
            text: "Queued",
            label_id: null,
            start_time: "2026-01-01T09:00:00.000Z",
            stop_time: null,
            includes_break: false,
          },
        ],
      });

      // Initial flush (navigator.onLine=true) fires on mount — respond with failure
      // to keep outbox intact, then flush on visibility-change succeeds.
      let callCount = 0;
      mockFetch.mockImplementation(async (url: string) => {
        callCount++;
        if (url === "/db/sync/push") {
          if (callCount <= 1) {
            // First push attempt (initial flush on mount) — fail
            return { ok: false };
          }
          // Second push (visibility-change flush) — succeed
          return { ok: true, json: async () => emptyPushResponse };
        }
        if (url.startsWith("/db/sync/pull")) {
          return { ok: true, json: async () => incrementalPullResponse };
        }
        return { ok: false };
      });

      const pullCallback = vi.fn();
      renderHook(() =>
        useOngoingSync(true, "user-1", mockFetch, pullCallback),
      );

      // Wait for initial flush to complete.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Simulate tab becoming visible.
      await act(async () => {
        Object.defineProperty(document, "visibilityState", {
          value: "visible",
          writable: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
        await new Promise((r) => setTimeout(r, 100));
      });

      await waitFor(() => {
        expect(pullCallback).toHaveBeenCalledWith(
          expect.objectContaining({ server_timestamp: "2026-02-01T00:00:00.000Z" }),
        );
      });

      // Cursor should be updated to pull response timestamp.
      expect(localStorage.getItem(getSyncCursorKey("user-1"))).toBe(
        "2026-02-01T00:00:00.000Z",
      );
    });
  });

  describe("flush on online event", () => {
    it("triggers flush when the browser comes back online", async () => {
      storeSyncCursor("user-1", "2026-01-01T00:00:00.000Z");

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => emptyPushResponse }) // initial flush push (empty)
        .mockResolvedValueOnce({ ok: true, json: async () => incrementalPullResponse }) // initial pull
        .mockResolvedValueOnce({ ok: true, json: async () => emptyPushResponse }) // online flush push
        .mockResolvedValueOnce({ ok: true, json: async () => incrementalPullResponse }); // online pull

      const pullCallback = vi.fn();
      renderHook(() =>
        useOngoingSync(true, "user-1", mockFetch, pullCallback),
      );

      // Let initial flush complete.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });

      const initialCallCount = mockFetch.mock.calls.length;

      // Simulate coming back online.
      await act(async () => {
        window.dispatchEvent(new Event("online"));
        await new Promise((r) => setTimeout(r, 100));
      });

      await waitFor(() => {
        expect(mockFetch.mock.calls.length).toBeGreaterThan(initialCallCount);
      });
    });
  });

  describe("hasSyncError and conflictCount", () => {
    it("initialises hasSyncError as false and conflictCount as 0", () => {
      storeSyncCursor("user-1", "2026-01-01T00:00:00.000Z");
      vi.stubGlobal("navigator", { ...navigator, onLine: false });

      const { result } = renderHook(() =>
        useOngoingSync(true, "user-1", mockFetch),
      );
      expect(result.current.hasSyncError).toBe(false);
      expect(result.current.conflictCount).toBe(0);
    });

    it("returns hasSyncError false and conflictCount 0 in no-op state", () => {
      const { result } = renderHook(() =>
        useOngoingSync(false, "user-1", mockFetch),
      );
      expect(result.current.hasSyncError).toBe(false);
      expect(result.current.conflictCount).toBe(0);
    });

    it("sets hasSyncError when outbox push fails during flushAndPull", async () => {
      storeSyncCursor("user-1", "2026-01-01T00:00:00.000Z");
      appendToSyncOutbox("user-1", emptySyncPayload());

      mockFetch.mockResolvedValue({ ok: false });

      const { result } = renderHook(() =>
        useOngoingSync(true, "user-1", mockFetch),
      );

      await waitFor(() => {
        expect(result.current.hasSyncError).toBe(true);
      });
    });

    it("sets conflictCount when a push response contains conflict records", async () => {
      storeSyncCursor("user-1", "2026-01-01T00:00:00.000Z");

      const conflictPushResponse = {
        results: {
          labels: [
            { id: "label-1", status: "conflict", conflict_reason: "server version is newer" },
          ],
        },
      };
      const serverLabel = {
        id: "label-1",
        user_id: 1,
        name: "Server Label",
        color: "#ff0000",
        created_at: "2026-01-01T12:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
        deleted_at: null,
      };
      // Full pull response (no `since`) used to reconcile conflicted records.
      const fullPullResponse = {
        labels: [serverLabel],
        tasks: [],
        templates: [],
        work_locations: [],
        time_off_entries: [],
        server_timestamp: "2026-01-02T00:00:00.000Z",
      };
      const initialPullResponse = {
        labels: [],
        tasks: [],
        templates: [],
        work_locations: [],
        time_off_entries: [],
        server_timestamp: "2026-01-01T12:00:00.000Z",
      };

      // Initial flush: outbox is empty so only a pull is made (no push).
      // enqueueChange: push (conflict) then full pull to reconcile.
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => initialPullResponse }) // initial pull
        .mockResolvedValueOnce({ ok: true, json: async () => conflictPushResponse }) // enqueueChange push with conflict
        .mockResolvedValueOnce({ ok: true, json: async () => fullPullResponse }); // full pull after conflict

      const pullCallback = vi.fn();
      const { result } = renderHook(() =>
        useOngoingSync(true, "user-1", mockFetch, pullCallback),
      );

      // Wait for initial flush to complete.
      await waitFor(() => {
        expect(result.current.lastSyncedAt).toBe("2026-01-01T12:00:00.000Z");
      });

      // Trigger a change that will conflict.
      act(() => {
        result.current.enqueueChange(emptySyncPayload());
      });

      await waitFor(() => {
        expect(result.current.conflictCount).toBe(1);
      });
      expect(result.current.hasSyncError).toBe(false);

      // Verify the reconciliation pull was a full pull (no `since` param).
      const pullCall = mockFetch.mock.calls.find(
        ([url]: [string]) => url === "/db/sync/pull",
      );
      expect(pullCall).toBeDefined();

      // Verify onIncrementalPull received the server version of the conflicted record.
      expect(pullCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: [serverLabel],
        }),
      );
    });

    it("sets hasSyncError when the reconciliation pull after a conflict fails", async () => {
      storeSyncCursor("user-1", "2026-01-01T00:00:00.000Z");

      const conflictPushResponse = {
        results: {
          labels: [{ id: "label-1", status: "conflict", conflict_reason: "server version is newer" }],
        },
      };
      const initialPullResponse = {
        labels: [],
        tasks: [],
        templates: [],
        work_locations: [],
        time_off_entries: [],
        server_timestamp: "2026-01-01T12:00:00.000Z",
      };

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => initialPullResponse }) // initial pull
        .mockResolvedValueOnce({ ok: true, json: async () => conflictPushResponse }) // push with conflict
        .mockResolvedValueOnce({ ok: false }); // reconciliation full pull fails

      const { result } = renderHook(() =>
        useOngoingSync(true, "user-1", mockFetch),
      );

      await waitFor(() => {
        expect(result.current.lastSyncedAt).toBe("2026-01-01T12:00:00.000Z");
      });

      act(() => {
        result.current.enqueueChange(emptySyncPayload());
      });

      await waitFor(() => {
        expect(result.current.hasSyncError).toBe(true);
      });
      // conflictCount is set before the pull, so it should still reflect the conflict.
      expect(result.current.conflictCount).toBe(1);
    });

    it("clears conflictCount and hasSyncError after a successful conflict-free sync", async () => {
      storeSyncCursor("user-1", "2026-01-01T00:00:00.000Z");
      appendToSyncOutbox("user-1", emptySyncPayload());

      // First call fails (setting hasSyncError), second succeeds.
      let callCount = 0;
      mockFetch.mockImplementation(async (url: string) => {
        callCount++;
        if (url === "/db/sync/push") {
          if (callCount <= 1) return { ok: false };
          return { ok: true, json: async () => emptyPushResponse };
        }
        if (url.startsWith("/db/sync/pull")) {
          return {
            ok: true,
            json: async () => ({
              labels: [],
              tasks: [],
              templates: [],
              work_locations: [],
              time_off_entries: [],
              server_timestamp: "2026-01-02T00:00:00.000Z",
            }),
          };
        }
        return { ok: false };
      });

      const { result } = renderHook(() =>
        useOngoingSync(true, "user-1", mockFetch),
      );

      // Wait for the initial failed flush.
      await waitFor(() => {
        expect(result.current.hasSyncError).toBe(true);
      });

      // Trigger a successful flush via visibility change.
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        writable: true,
      });
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });

      await waitFor(() => {
        expect(result.current.hasSyncError).toBe(false);
      });
    });
  });
});
