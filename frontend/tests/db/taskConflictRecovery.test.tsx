import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptTaskConflictServerState,
  applyIncrementalPullToCollections,
  setSyncCollectionAuth,
  setSyncCollectionTriggerPull,
  tasksCollection,
} from "@/db/collections";
import { USER_STATE_OWNER_STORAGE_KEY } from "@/constants/storageKeys";
import { useOngoingSync } from "@/hooks/useOngoingSync";
import { storeSyncCursor, type SyncPushPayload, type SyncPullResponse } from "@/utils/syncClient";

const snapshot: SyncPullResponse = {
  labels: [],
  tasks: [],
  templates: [],
  work_locations: [],
  time_off_entries: [],
  gantt_tasks: [],
  server_timestamp: "2026-01-02T00:00:00Z",
};
const payload: SyncPushPayload = {
  labels: [],
  templates: [],
  work_locations: [],
  time_off_entries: [],
  gantt_tasks: [],
  tasks: [
    {
      id: "rejected",
      action: "create",
      text: "Rejected",
      start_time: "2026-01-01T09:00:00Z",
      stop_time: "2026-01-01T10:00:00Z",
      client_updated_at: "2026-01-01T00:00:00Z",
    },
  ],
};
const localTask = (id: string) => ({
  id,
  text: id,
  label: "",
  startTime: "2026-01-01T09:00",
  stopTime: "2026-01-01T10:00",
  includesBreak: false,
});

beforeEach(() => {
  localStorage.setItem(USER_STATE_OWNER_STORAGE_KEY, "user-1");
});

afterEach(async () => {
  setSyncCollectionAuth(null);
  for (const id of ["rejected", "unrelated"]) {
    if (tasksCollection.has(id)) await tasksCollection.delete(id).isPersisted.promise;
  }
  localStorage.clear();
  setSyncCollectionTriggerPull(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("rejected task recovery", () => {
  it.each([false, true])(
    "accepts server state only after a successful pull (offline=%s)",
    async (offline) => {
      await tasksCollection.insert(localTask("rejected")).isPersisted.promise;
      await tasksCollection.insert(localTask("unrelated")).isPersisted.promise;
      storeSyncCursor("user-1", "2026-01-01T00:00:00Z");
      let failPull = false;
      const fetch = vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith("/api/sync/pull"))
          return { ok: !failPull, json: async () => snapshot } as Response;
        if (init?.method === "POST")
          return {
            ok: true,
            json: async () => ({
              results: { tasks: [{ id: "rejected", status: "conflict", code: "task_overlap" }] },
            }),
          } as Response;
        return { ok: false, json: async () => null } as Response;
      });
      const { result, unmount } = renderHook(() =>
        useOngoingSync(
          true,
          "user-1",
          fetch,
          applyIncrementalPullToCollections,
          acceptTaskConflictServerState,
        ),
      );
      await waitFor(() => expect(result.current.lastSyncedAt).toBe(snapshot.server_timestamp));
      act(() => result.current.enqueueChange(payload));
      await waitFor(() => expect(result.current.conflictCount).toBe(1));
      // Wait for the initial reconciliation before changing the simulated network.
      await waitFor(() =>
        expect(
          fetch.mock.calls.filter(([url]) => url.startsWith("/api/preferences")).length,
        ).toBeGreaterThanOrEqual(2),
      );
      failPull = offline;
      act(() => result.current.resolveOngoingConflicts("keep-server"));
      if (offline) {
        await waitFor(() => expect(result.current.hasSyncError).toBe(true));
        expect(result.current.conflictCount).toBe(1);
        expect(tasksCollection.has("rejected")).toBe(true);
        failPull = false;
        act(() => result.current.resolveOngoingConflicts("keep-server"));
      }
      await waitFor(() => expect(result.current.conflictCount).toBe(0));
      expect(tasksCollection.has("rejected")).toBe(false);
      expect(tasksCollection.has("unrelated")).toBe(true);
      expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
      unmount();
    },
  );

  it("discards a rejected new task after an edit coalesces its queued create into an update", async () => {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url, "http://localhost").pathname;
      if (path === "/api/sync/pull") return { ok: true, json: async () => snapshot } as Response;
      if (path === "/api/sync/push" && init?.method === "POST")
        return {
          ok: true,
          json: async () => ({
            results: { tasks: [{ id: "rejected", status: "conflict", code: "task_overlap" }] },
          }),
        } as Response;
      return { ok: false, json: async () => null } as Response;
    });
    vi.stubGlobal("fetch", fetch);
    setSyncCollectionAuth("user-1", "test-token");
    await tasksCollection.preload();
    await tasksCollection.insert(localTask("rejected")).isPersisted.promise;
    await tasksCollection.update("rejected", (draft) => {
      draft.text = "Edited rejected task";
    }).isPersisted.promise;
    expect(tasksCollection.has("rejected")).toBe(true);
    storeSyncCursor("user-1", "2026-01-01T00:00:00Z");
    const { result, unmount } = renderHook(() =>
      useOngoingSync(
        true,
        "user-1",
        fetch,
        applyIncrementalPullToCollections,
        acceptTaskConflictServerState,
      ),
    );
    await waitFor(() => expect(result.current.conflictCount).toBe(1));
    expect(result.current.conflictedPayload?.tasks[0]?.action).toBe("update");
    act(() => result.current.resolveOngoingConflicts("keep-server"));
    await waitFor(() => expect(result.current.conflictCount).toBe(0));
    expect(tasksCollection.has("rejected")).toBe(false);
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(3);
    unmount();
  });

  it("keeps a rejected create when the refreshed server snapshot contains it", async () => {
    await tasksCollection.insert(localTask("rejected")).isPersisted.promise;
    acceptTaskConflictServerState(payload, {
      ...snapshot,
      tasks: [
        {
          id: "rejected",
          user_id: 1,
          label_id: null,
          gantt_task_id: null,
          text: "Server version",
          start_time: "2026-01-01T09:00:00Z",
          stop_time: "2026-01-01T10:00:00Z",
          includes_break: false,
          deleted_at: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
    });
    expect(tasksCollection.has("rejected")).toBe(true);
  });
});
