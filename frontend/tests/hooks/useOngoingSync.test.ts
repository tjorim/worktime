import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOngoingSync, INITIAL_BACK_OFF_MS } from "@/hooks/useOngoingSync";
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
  gantt_tasks: [],
});

const emptyPushResponse = { results: {} };

const incrementalPullResponse = {
  labels: [],
  tasks: [],
  templates: [],
  work_locations: [],
  time_off_entries: [],
  gantt_tasks: [],
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
    // triggerPull should also be a no-op
    result.current.triggerPull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns no-op state when userId is null", () => {
    const { result } = renderHook(() => useOngoingSync(true, null, mockFetch));
    result.current.enqueueChange(emptySyncPayload());
    result.current.triggerPull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns no-op state when fetchFn is null", () => {
    const { result } = renderHook(() => useOngoingSync(true, "user-1", null));
    result.current.enqueueChange(emptySyncPayload());
    result.current.triggerPull();
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
      // 1. Initial flush on mount: outbox empty → no push, only a pull
      // 2. enqueueChange: immediate push succeeds (no conflicts)
      // 3. enqueueChange: fetchSyncStatus refreshes the cursor (extra round-trip
      //    because the push response does not include a server_timestamp)
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => incrementalPullResponse }) // initial pull
        .mockResolvedValueOnce({ ok: true, json: async () => emptyPushResponse }) // enqueueChange push
        .mockResolvedValueOnce({ ok: true, json: async () => refreshedStatus }); // status refresh

      const { result } = renderHook(() =>
        useOngoingSync(true, "user-1", mockFetch),
      );

      // Wait for initial flush to complete.
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
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
        ([url]: [string]) => url === "/api/sync/push",
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
        if (url === "/api/sync/push") {
          if (callCount <= 1) {
            // First push attempt (initial flush on mount) — fail
            return { ok: false };
          }
          // Second push (visibility-change flush) — succeed
          return { ok: true, json: async () => emptyPushResponse };
        }
        if (url.startsWith("/api/sync/pull")) {
          return { ok: true, json: async () => incrementalPullResponse };
        }
        return { ok: false };
      });

      const pullCallback = vi.fn();
      renderHook(() =>
        useOngoingSync(true, "user-1", mockFetch, pullCallback),
      );

      // Wait for initial flush to complete (push fails, no pull triggered).
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Advance past the initial back-off window (INITIAL_BACK_OFF_MS) so the visibility-change flush
      // is not silently skipped by the back-off guard.
      const baseTime1 = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(baseTime1 + INITIAL_BACK_OFF_MS * 2);

      // Simulate tab becoming visible.
      await act(async () => {
        Object.defineProperty(document, "visibilityState", {
          value: "visible",
          writable: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
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
      // Outbox is empty for both flushes, so no push is made — only a pull each time.
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => incrementalPullResponse }) // initial pull
        .mockResolvedValueOnce({ ok: true, json: async () => incrementalPullResponse }); // online pull

      const pullCallback = vi.fn();
      renderHook(() =>
        useOngoingSync(true, "user-1", mockFetch, pullCallback),
      );

      // Let initial flush complete.
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      const initialCallCount = mockFetch.mock.calls.length;

      // Simulate coming back online.
      await act(async () => {
        window.dispatchEvent(new Event("online"));
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
        ([url]: [string]) => url === "/api/sync/pull",
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
        if (url === "/api/sync/push") {
          if (callCount <= 1) return { ok: false };
          return { ok: true, json: async () => emptyPushResponse };
        }
        if (url.startsWith("/api/sync/pull")) {
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

      // Advance past the initial back-off window (INITIAL_BACK_OFF_MS) so the visibility-change flush
      // is not silently skipped by the back-off guard.
      const baseTime2 = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(baseTime2 + INITIAL_BACK_OFF_MS * 2);

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

    it("keeps conflictCount across subsequent conflict-free syncs until explicitly resolved", async () => {
      storeSyncCursor("user-1", "2026-01-01T00:00:00.000Z");

      const conflictPushResponse = {
        results: {
          labels: [{ id: "lbl-1", status: "conflict", conflict_reason: "server is newer" }],
        },
      };
      const pullWithConflict = {
        labels: [],
        tasks: [],
        templates: [],
        work_locations: [],
        time_off_entries: [],
        server_timestamp: "2026-01-02T00:00:00.000Z",
      };
      const cleanPull = {
        labels: [],
        tasks: [],
        templates: [],
        work_locations: [],
        time_off_entries: [],
        server_timestamp: "2026-01-03T00:00:00.000Z",
      };

      // Initial pull → conflict push + full pull → clean pull (triggered by visibility).
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => pullWithConflict }) // initial pull (empty outbox)
        .mockResolvedValueOnce({ ok: true, json: async () => conflictPushResponse }) // enqueueChange push (conflict)
        .mockResolvedValueOnce({ ok: true, json: async () => pullWithConflict }) // reconciliation full pull
        .mockResolvedValueOnce({ ok: true, json: async () => cleanPull }); // visibility-change pull

      const { result } = renderHook(() =>
        useOngoingSync(true, "user-1", mockFetch),
      );

      await waitFor(() => {
        expect(result.current.lastSyncedAt).toBe("2026-01-02T00:00:00.000Z");
      });

      // Enqueue a change that produces a conflict.
      act(() => {
        result.current.enqueueChange(emptySyncPayload());
      });

      await waitFor(() => {
        expect(result.current.conflictCount).toBe(1);
      });

      // Now trigger a clean flush via visibility change.
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        writable: true,
      });
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });

      await waitFor(() => {
        expect(result.current.lastSyncedAt).toBe("2026-01-03T00:00:00.000Z");
      });

      // conflictCount must NOT be cleared by a subsequent conflict-free flush —
      // the unresolved conflict must persist until the user explicitly resolves it.
      expect(result.current.conflictCount).toBe(1);
    });

    it("sets conflictedPayload alongside conflictCount when a conflict occurs", async () => {
      storeSyncCursor("user-1", "2026-01-01T00:00:00.000Z");

      const conflictPushResponse = {
        results: {
          labels: [{ id: "lbl-1", status: "conflict", conflict_reason: "server is newer" }],
        },
      };
      const pullResponse = {
        labels: [],
        tasks: [],
        templates: [],
        work_locations: [],
        time_off_entries: [],
        gantt_tasks: [],
        server_timestamp: "2026-01-02T00:00:00.000Z",
      };
      const labelItem = { id: "lbl-1", action: "update" as const, client_updated_at: "2026-01-01T00:00:00.000Z" };
      const changePayload = { ...emptySyncPayload(), labels: [labelItem] };

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => pullResponse }) // initial pull
        .mockResolvedValueOnce({ ok: true, json: async () => conflictPushResponse }) // push conflict
        .mockResolvedValueOnce({ ok: true, json: async () => pullResponse }); // reconciliation pull

      const { result } = renderHook(() =>
        useOngoingSync(true, "user-1", mockFetch),
      );

      await waitFor(() => {
        expect(result.current.lastSyncedAt).toBe("2026-01-02T00:00:00.000Z");
      });

      act(() => {
        result.current.enqueueChange(changePayload);
      });

      await waitFor(() => {
        expect(result.current.conflictCount).toBe(1);
      });

      // conflictedPayload should contain only the conflicted label.
      expect(result.current.conflictedPayload).not.toBeNull();
      expect(result.current.conflictedPayload?.labels).toHaveLength(1);
      expect(result.current.conflictedPayload?.labels[0].id).toBe("lbl-1");
      // Other entity arrays should be empty.
      expect(result.current.conflictedPayload?.tasks).toHaveLength(0);
    });
  });

  describe("resolveOngoingConflicts", () => {
    const setupConflict = async (mockFetch: ReturnType<typeof vi.fn>) => {
      storeSyncCursor("user-1", "2026-01-01T00:00:00.000Z");

      const conflictPushResponse = {
        results: {
          labels: [{ id: "lbl-1", status: "conflict", conflict_reason: "server is newer" }],
        },
      };
      const pullResponse = {
        labels: [],
        tasks: [],
        templates: [],
        work_locations: [],
        time_off_entries: [],
        gantt_tasks: [],
        server_timestamp: "2026-01-02T00:00:00.000Z",
      };
      const labelItem = { id: "lbl-1", action: "update" as const, client_updated_at: "2026-01-01T00:00:00.000Z" };
      const changePayload = { ...emptySyncPayload(), labels: [labelItem] };

      // Initial pull + push conflict + reconciliation pull.
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => pullResponse })
        .mockResolvedValueOnce({ ok: true, json: async () => conflictPushResponse })
        .mockResolvedValueOnce({ ok: true, json: async () => pullResponse });

      return { changePayload, pullResponse };
    };

    it("'keep-server' clears conflictCount and conflictedPayload", async () => {
      const { changePayload } = await setupConflict(mockFetch);

      const { result } = renderHook(() =>
        useOngoingSync(true, "user-1", mockFetch),
      );

      await waitFor(() => {
        expect(result.current.lastSyncedAt).toBe("2026-01-02T00:00:00.000Z");
      });

      act(() => {
        result.current.enqueueChange(changePayload);
      });

      await waitFor(() => {
        expect(result.current.conflictCount).toBe(1);
      });

      act(() => {
        result.current.resolveOngoingConflicts("keep-server");
      });

      expect(result.current.conflictCount).toBe(0);
      expect(result.current.conflictedPayload).toBeNull();
    });

    it("'keep-mine' clears conflictCount and triggers a re-push with bumped timestamps", async () => {
      const { changePayload } = await setupConflict(mockFetch);

      // After conflict + reconciliation, one more call: successful re-push.
      const statusResponse = { server_timestamp: "2026-01-03T00:00:00.000Z" };
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ results: { labels: [{ id: "lbl-1", status: "ok" }] } }) }); // re-push
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => statusResponse }); // status fetch

      const { result } = renderHook(() =>
        useOngoingSync(true, "user-1", mockFetch),
      );

      await waitFor(() => {
        expect(result.current.lastSyncedAt).toBe("2026-01-02T00:00:00.000Z");
      });

      act(() => {
        result.current.enqueueChange(changePayload);
      });

      await waitFor(() => {
        expect(result.current.conflictCount).toBe(1);
      });

      act(() => {
        result.current.resolveOngoingConflicts("keep-mine");
      });

      // conflictCount and conflictedPayload should be cleared immediately.
      expect(result.current.conflictCount).toBe(0);
      expect(result.current.conflictedPayload).toBeNull();

      // A re-push should have been triggered.
      await waitFor(() => {
        // The re-push call comes after the 3 mock calls already consumed (initial pull,
        // conflict push, reconciliation pull).
        const repushCalls = mockFetch.mock.calls.filter(([url]: [string]) => url === "/api/sync/push");
        expect(repushCalls.length).toBeGreaterThan(1);
      });

      // Verify the re-push timestamp was bumped (later than the original conflict timestamp).
      const repushCalls = mockFetch.mock.calls.filter(([url]: [string]) => url === "/api/sync/push");
      // Last push call should have a fresh timestamp
      const repushBody = JSON.parse((repushCalls[repushCalls.length - 1][1] as RequestInit).body as string) as typeof changePayload;
      expect(new Date(repushBody.labels[0].client_updated_at).getTime()).toBeGreaterThan(
        new Date(changePayload.labels[0].client_updated_at).getTime(),
      );
    });
  });

  describe("triggerPull", () => {
    it("flushes outbox and pulls incremental data when called", async () => {
      storeSyncCursor("user-1", "2026-01-01T00:00:00.000Z");

      // Initial mount flush (online): only pull (outbox is empty).
      // triggerPull: only pull (outbox still empty).
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => incrementalPullResponse }) // initial pull
        .mockResolvedValueOnce({ ok: true, json: async () => incrementalPullResponse }); // triggerPull pull

      const pullCallback = vi.fn();
      const { result } = renderHook(() =>
        useOngoingSync(true, "user-1", mockFetch, pullCallback),
      );

      // Wait for initial flush.
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Call triggerPull directly (simulates an SSE signal).
      await act(async () => {
        result.current.triggerPull();
      });

      await waitFor(() => {
        expect(pullCallback).toHaveBeenCalledTimes(2);
      });

      expect(pullCallback).toHaveBeenLastCalledWith(
        expect.objectContaining({ server_timestamp: "2026-02-01T00:00:00.000Z" }),
      );
    });

    it("updates lastSyncedAt after a successful triggerPull", async () => {
      storeSyncCursor("user-1", "2026-01-01T00:00:00.000Z");

      const laterPullResponse = {
        ...incrementalPullResponse,
        server_timestamp: "2026-03-01T00:00:00.000Z",
      };

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => incrementalPullResponse }) // initial pull
        .mockResolvedValueOnce({ ok: true, json: async () => laterPullResponse }); // triggerPull pull

      const { result } = renderHook(() =>
        useOngoingSync(true, "user-1", mockFetch),
      );

      await waitFor(() => {
        expect(result.current.lastSyncedAt).toBe("2026-02-01T00:00:00.000Z");
      });

      await act(async () => {
        result.current.triggerPull();
      });

      await waitFor(() => {
        expect(result.current.lastSyncedAt).toBe("2026-03-01T00:00:00.000Z");
      });
    });

    it("does not make network calls when sync is not established", () => {
      const { result } = renderHook(() =>
        useOngoingSync(false, "user-1", mockFetch),
      );

      result.current.triggerPull();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("is transport-neutral — caller does not need to know cursor or outbox details", async () => {
      // Set up cursor and a pending outbox entry.
      storeSyncCursor("user-1", "2026-01-10T00:00:00.000Z");
      appendToSyncOutbox("user-1", emptySyncPayload());
      // Device starts offline to prevent initial flush from clearing the outbox.
      vi.stubGlobal("navigator", { ...navigator, onLine: false });

      const pullResponse = {
        ...incrementalPullResponse,
        server_timestamp: "2026-01-11T00:00:00.000Z",
      };
      // triggerPull should flush outbox (push) then pull — caller just calls triggerPull().
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => emptyPushResponse }) // outbox flush push
        .mockResolvedValueOnce({ ok: true, json: async () => pullResponse }); // pull

      const { result } = renderHook(() =>
        useOngoingSync(true, "user-1", mockFetch),
      );

      // At this point outbox has 1 entry; no network calls yet (offline).
      expect(result.current.outboxCount).toBe(1);

      // triggerPull is all the external caller needs to invoke.
      await act(async () => {
        result.current.triggerPull();
      });

      await waitFor(() => {
        expect(result.current.outboxCount).toBe(0);
      });

      await waitFor(() => {
        expect(result.current.lastSyncedAt).toBe("2026-01-11T00:00:00.000Z");
      });

      // Assert push-before-pull call order: first call is the outbox flush
      // (push endpoint), second is the incremental pull (pull endpoint).
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const [firstCall, secondCall] = mockFetch.mock.calls as [[string], [string]];
      expect(firstCall[0]).toBe("/api/sync/push");
      expect(secondCall[0]).toMatch(/^\/api\/sync\/pull/);
    });
  });

  describe("exponential back-off", () => {
    it("sets retryAfter after a failed outbox flush", async () => {
      storeSyncCursor("user-1", "2026-01-01T00:00:00.000Z");
      appendToSyncOutbox("user-1", emptySyncPayload());

      mockFetch.mockResolvedValue({ ok: false });

      const { result } = renderHook(() =>
        useOngoingSync(true, "user-1", mockFetch),
      );

      // Initial flush fires on mount (force=true → bypasses back-off).
      await waitFor(() => {
        expect(result.current.hasSyncError).toBe(true);
      });

      // retryAfter should be set to ~1 second in the future.
      expect(result.current.retryAfter).not.toBeNull();
      expect(result.current.retryAfter).toBeGreaterThan(Date.now());
    });

    it("retryAfter is null in no-op state", () => {
      const { result } = renderHook(() =>
        useOngoingSync(false, "user-1", mockFetch),
      );
      expect(result.current.retryAfter).toBeNull();
    });

    it("resets retryAfter to null after a successful flush", async () => {
      storeSyncCursor("user-1", "2026-01-01T00:00:00.000Z");
      appendToSyncOutbox("user-1", emptySyncPayload());

      let callCount = 0;
      mockFetch.mockImplementation(async (url: string) => {
        callCount++;
        if (url === "/api/sync/push") {
          if (callCount <= 1) return { ok: false }; // First push fails.
          return { ok: true, json: async () => emptyPushResponse };
        }
        if (url.startsWith("/api/sync/pull")) {
          return { ok: true, json: async () => incrementalPullResponse };
        }
        return { ok: false };
      });

      const { result } = renderHook(() =>
        useOngoingSync(true, "user-1", mockFetch),
      );

      // Initial flush fails → back-off is set.
      await waitFor(() => {
        expect(result.current.hasSyncError).toBe(true);
        expect(result.current.retryAfter).not.toBeNull();
      });

      // Force a flush via the online event (bypasses back-off) → succeeds.
      await act(async () => {
        window.dispatchEvent(new Event("online"));
      });

      await waitFor(() => {
        expect(result.current.hasSyncError).toBe(false);
        expect(result.current.retryAfter).toBeNull();
      });
    });

    it("visibility-change flush is skipped during active back-off", async () => {
      storeSyncCursor("user-1", "2026-01-01T00:00:00.000Z");
      appendToSyncOutbox("user-1", emptySyncPayload());

      // All requests fail so back-off is set.
      mockFetch.mockResolvedValue({ ok: false });

      const { result } = renderHook(() =>
        useOngoingSync(true, "user-1", mockFetch),
      );

      // Wait for the initial (forced) flush to fail and set back-off.
      await waitFor(() => {
        expect(result.current.hasSyncError).toBe(true);
        expect(result.current.retryAfter).not.toBeNull();
      });

      const callsAfterInitial = mockFetch.mock.calls.length;

      // Simulate visibility change — back-off window (1 s) has not expired yet,
      // so the flush should be silently skipped.
      await act(async () => {
        Object.defineProperty(document, "visibilityState", {
          value: "visible",
          writable: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });

      // No additional fetch calls: back-off guard blocked the flush.
      expect(mockFetch.mock.calls.length).toBe(callsAfterInitial);
      // retryAfter is still set.
      expect(result.current.retryAfter).not.toBeNull();
    });

    it("online event bypasses back-off and always retries immediately", async () => {
      storeSyncCursor("user-1", "2026-01-01T00:00:00.000Z");
      appendToSyncOutbox("user-1", emptySyncPayload());

      let callCount = 0;
      mockFetch.mockImplementation(async (url: string) => {
        callCount++;
        if (url === "/api/sync/push") {
          if (callCount <= 1) return { ok: false }; // Initial flush fails.
          return { ok: true, json: async () => emptyPushResponse };
        }
        if (url.startsWith("/api/sync/pull")) {
          return { ok: true, json: async () => incrementalPullResponse };
        }
        return { ok: false };
      });

      const { result } = renderHook(() =>
        useOngoingSync(true, "user-1", mockFetch),
      );

      // Wait for initial flush to fail and set back-off.
      await waitFor(() => {
        expect(result.current.hasSyncError).toBe(true);
        expect(result.current.retryAfter).not.toBeNull();
      });

      // Dispatch online event — should bypass back-off and succeed.
      await act(async () => {
        window.dispatchEvent(new Event("online"));
      });

      await waitFor(() => {
        expect(result.current.hasSyncError).toBe(false);
        expect(result.current.retryAfter).toBeNull();
      });
    });

    it("doubles the delay on each successive forced failure", async () => {
      storeSyncCursor("user-1", "2026-01-01T00:00:00.000Z");
      appendToSyncOutbox("user-1", emptySyncPayload());

      // All attempts fail — each online event forces a new flush attempt.
      mockFetch.mockResolvedValue({ ok: false });

      const { result } = renderHook(() =>
        useOngoingSync(true, "user-1", mockFetch),
      );

      // 1st failure (initial forced flush): retryDelayMs = 1 000 ms.
      await waitFor(() => {
        expect(result.current.retryAfter).not.toBeNull();
      });
      const firstRetryAfter = result.current.retryAfter!;

      // 2nd forced failure (online event, bypasses back-off): retryDelayMs = 2 000 ms.
      await act(async () => {
        window.dispatchEvent(new Event("online"));
      });
      await waitFor(() => {
        // retryAfter must be strictly larger than the previous value.
        expect(result.current.retryAfter).not.toBeNull();
        expect(result.current.retryAfter).toBeGreaterThan(firstRetryAfter);
      });
    });

    it("visibility-change flush proceeds after back-off window expires", async () => {
      storeSyncCursor("user-1", "2026-01-01T00:00:00.000Z");
      appendToSyncOutbox("user-1", emptySyncPayload());

      let callCount = 0;
      mockFetch.mockImplementation(async (url: string) => {
        callCount++;
        if (url === "/api/sync/push") {
          if (callCount <= 1) return { ok: false }; // Initial flush fails.
          return { ok: true, json: async () => emptyPushResponse };
        }
        if (url.startsWith("/api/sync/pull")) {
          return { ok: true, json: async () => incrementalPullResponse };
        }
        return { ok: false };
      });

      const { result } = renderHook(() =>
        useOngoingSync(true, "user-1", mockFetch),
      );

      // Wait for initial flush to fail and set back-off.
      await waitFor(() => {
        expect(result.current.retryAfter).not.toBeNull();
      });

      // Fake Date.now() to return a timestamp well past the back-off window.
      const farFuture = Date.now() + 120_000;
      const dateSpy = vi.spyOn(Date, "now").mockReturnValue(farFuture);

      // A visibility-change should now proceed (window has expired).
      await act(async () => {
        Object.defineProperty(document, "visibilityState", {
          value: "visible",
          writable: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });

      await waitFor(() => {
        expect(result.current.hasSyncError).toBe(false);
      });

      dateSpy.mockRestore();
    });
  });
});