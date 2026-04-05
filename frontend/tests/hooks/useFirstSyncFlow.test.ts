import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFirstSyncFlow } from "../../src/hooks/useFirstSyncFlow";
import { TIME_TRACKING_STORAGE_KEYS } from "../../src/components/timeTracking/constants";
import { getSyncCursorKey } from "../../src/constants/storageKeys";

const mockFetch = vi.fn();

const emptyStatus = {
  labels_updated_at: null,
  tasks_updated_at: null,
  templates_updated_at: null,
  work_locations_updated_at: null,
  time_off_entries_updated_at: null,
  preferences_updated_at: null,
  server_timestamp: "2026-01-01T00:00:00.000Z",
};

const populatedStatus = {
  labels_updated_at: "2026-01-01T00:00:00.000Z",
  tasks_updated_at: null,
  templates_updated_at: null,
  work_locations_updated_at: null,
  time_off_entries_updated_at: null,
  preferences_updated_at: null,
  server_timestamp: "2026-01-01T00:00:00.000Z",
};

const emptyPullResponse = {
  labels: [],
  tasks: [],
  templates: [],
  work_locations: [],
  time_off_entries: [],
  server_timestamp: "2026-01-02T00:00:00.000Z",
};

const emptyPushResponse = { results: {} };

function seedTasks() {
  localStorage.setItem(
    TIME_TRACKING_STORAGE_KEYS.tasks,
    JSON.stringify([
      { id: "t1", text: "Test", label: "", startTime: "2026-01-01T09:00" },
    ]),
  );
}

function seedTimeOff() {
  localStorage.setItem("worktime_hday_raw", "2026/07/14 # Bastille Day");
}

describe("useFirstSyncFlow", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("starts in idle phase when not authenticated", () => {
    const { result } = renderHook(() =>
      useFirstSyncFlow(false, null, null),
    );
    expect(result.current.phase).toBe("idle");
  });

  it("starts in idle phase when authenticated but fetch is null", () => {
    const { result } = renderHook(() =>
      useFirstSyncFlow(true, "user-1", null),
    );
    expect(result.current.phase).toBe("idle");
  });

  it("skips the flow when a sync cursor already exists", async () => {
    localStorage.setItem(getSyncCursorKey("user-1"), "2026-01-01T00:00:00.000Z");

    const { result } = renderHook(() =>
      useFirstSyncFlow(true, "user-1", mockFetch),
    );

    // Should stay idle since cursor already exists
    await waitFor(() => {
      expect(result.current.phase).toBe("idle");
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("Branch D: completes immediately when neither side has data", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => emptyStatus });

    const { result } = renderHook(() =>
      useFirstSyncFlow(true, "user-1", mockFetch),
    );

    await waitFor(() => {
      expect(result.current.phase).toBe("done");
    });

    // Sync cursor should be set
    expect(localStorage.getItem(getSyncCursorKey("user-1"))).toBe(
      emptyStatus.server_timestamp,
    );
  });

  it("Branch A: pushes local data when server is empty", async () => {
    seedTasks();

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => emptyStatus })    // status check
      .mockResolvedValueOnce({ ok: true, json: async () => emptyPushResponse }) // push
      .mockResolvedValueOnce({ ok: true, json: async () => emptyStatus });   // re-fetch status

    const { result } = renderHook(() =>
      useFirstSyncFlow(true, "user-1", mockFetch),
    );

    await waitFor(() => {
      expect(result.current.phase).toBe("done");
    });

    // Push endpoint should have been called
    const pushCall = mockFetch.mock.calls.find(
      ([url]: [string]) => url === "/db/sync/push",
    );
    expect(pushCall).toBeDefined();
    expect(localStorage.getItem(getSyncCursorKey("user-1"))).not.toBeNull();
  });

  it("Branch A: pushes local time-off entries when only time-off data exists", async () => {
    seedTimeOff(); // only time-off, no tasks

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => emptyStatus })    // status check
      .mockResolvedValueOnce({ ok: true, json: async () => emptyPushResponse }) // push
      .mockResolvedValueOnce({ ok: true, json: async () => emptyStatus });   // re-fetch status

    const { result } = renderHook(() =>
      useFirstSyncFlow(true, "user-1", mockFetch),
    );

    await waitFor(() => {
      expect(result.current.phase).toBe("done");
    });

    // Push endpoint should have been called with time-off entries
    const pushCall = mockFetch.mock.calls.find(
      ([url]: [string]) => url === "/db/sync/push",
    );
    expect(pushCall).toBeDefined();
    const body = JSON.parse((pushCall as [string, RequestInit])[1].body as string);
    expect(body.time_off_entries).toHaveLength(1);
    expect(body.time_off_entries[0].date).toBe("2026-07-14");
  });

  it("Branch B: pulls server data when local is empty", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => populatedStatus }) // status
      .mockResolvedValueOnce({ ok: true, json: async () => emptyPullResponse }) // pull
      .mockResolvedValueOnce({ ok: false }); // GET /db/preferences — no prefs on server

    const { result } = renderHook(() =>
      useFirstSyncFlow(true, "user-1", mockFetch),
    );

    await waitFor(() => {
      expect(result.current.phase).toBe("done");
    });

    const pullCall = mockFetch.mock.calls.find(
      ([url]: [string]) => url === "/db/sync/pull",
    );
    expect(pullCall).toBeDefined();
    expect(localStorage.getItem(getSyncCursorKey("user-1"))).toBe(
      emptyPullResponse.server_timestamp,
    );
  });

  it("Branch C: enters conflict phase when both have data", async () => {
    seedTasks();

    mockFetch.mockResolvedValue({ ok: true, json: async () => populatedStatus });

    const { result } = renderHook(() =>
      useFirstSyncFlow(true, "user-1", mockFetch),
    );

    await waitFor(() => {
      expect(result.current.phase).toBe("conflict");
    });
  });

  it("resolveConflict(keep-local) pushes local data and completes", async () => {
    seedTasks();

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => populatedStatus })  // initial status → conflict
      .mockResolvedValueOnce({ ok: true, json: async () => emptyPullResponse }) // pull server data
      .mockResolvedValueOnce({ ok: true, json: async () => emptyPushResponse }) // push replace payload
      .mockResolvedValueOnce({ ok: true, json: async () => emptyStatus });      // post-push status

    const { result } = renderHook(() =>
      useFirstSyncFlow(true, "user-1", mockFetch),
    );

    await waitFor(() => {
      expect(result.current.phase).toBe("conflict");
    });

    act(() => {
      result.current.resolveConflict("keep-local");
    });

    await waitFor(() => {
      expect(result.current.phase).toBe("done");
    });

    const pushCall = mockFetch.mock.calls.find(
      ([url]: [string]) => url === "/db/sync/push",
    );
    expect(pushCall).toBeDefined();
  });

  it("resolveConflict(use-server) pulls server data and completes", async () => {
    seedTasks();

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => populatedStatus }) // initial status
      .mockResolvedValueOnce({ ok: true, json: async () => emptyPullResponse }) // pull
      .mockResolvedValueOnce({ ok: false }); // GET /db/preferences — no prefs on server

    const { result } = renderHook(() =>
      useFirstSyncFlow(true, "user-1", mockFetch),
    );

    await waitFor(() => {
      expect(result.current.phase).toBe("conflict");
    });

    act(() => {
      result.current.resolveConflict("use-server");
    });

    await waitFor(() => {
      expect(result.current.phase).toBe("done");
    });

    const pullCall = mockFetch.mock.calls.find(
      ([url]: [string]) => url === "/db/sync/pull",
    );
    expect(pullCall).toBeDefined();
  });

  it("enters error phase when status fetch fails", async () => {
    mockFetch.mockResolvedValue({ ok: false });

    const { result } = renderHook(() =>
      useFirstSyncFlow(true, "user-1", mockFetch),
    );

    await waitFor(() => {
      expect(result.current.phase).toBe("error");
    });
  });

  it("dismiss resets phase to idle", async () => {
    seedTasks();
    mockFetch.mockResolvedValue({ ok: true, json: async () => populatedStatus });

    const { result } = renderHook(() =>
      useFirstSyncFlow(true, "user-1", mockFetch),
    );

    await waitFor(() => {
      expect(result.current.phase).toBe("conflict");
    });

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.phase).toBe("idle");
  });

  it("Branch A: pushes preferences after entity sync when local prefs exist", async () => {
    seedTasks();
    // Seed a local user state so buildLocalPreferencesPayload() returns non-null
    localStorage.setItem("worktime_user_state", JSON.stringify({ hasCompletedOnboarding: true }));

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => emptyStatus })    // status check
      .mockResolvedValueOnce({ ok: true, json: async () => emptyPushResponse }) // push entities
      .mockResolvedValueOnce({ ok: true })                                    // PUT /db/preferences
      .mockResolvedValueOnce({ ok: true, json: async () => emptyStatus });   // re-fetch status

    const { result } = renderHook(() =>
      useFirstSyncFlow(true, "user-1", mockFetch),
    );

    await waitFor(() => {
      expect(result.current.phase).toBe("done");
    });

    const prefsPushCall = mockFetch.mock.calls.find(
      ([url, init]: [string, RequestInit | undefined]) =>
        url === "/db/preferences" && init?.method === "PUT",
    );
    expect(prefsPushCall).toBeDefined();
  });

  it("Branch B: pulls preferences after entity pull when server has prefs", async () => {
    const serverPrefs = {
      user_id: 1,
      data: { hasCompletedOnboarding: true },
      client_updated_at: "2026-01-01T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => populatedStatus })  // status
      .mockResolvedValueOnce({ ok: true, json: async () => emptyPullResponse }) // pull entities
      .mockResolvedValueOnce({ ok: true, json: async () => serverPrefs });      // GET /db/preferences

    const { result } = renderHook(() =>
      useFirstSyncFlow(true, "user-1", mockFetch),
    );

    await waitFor(() => {
      expect(result.current.phase).toBe("done");
    });

    // Preferences should have been applied to localStorage
    const stored = localStorage.getItem("worktime_user_state");
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!)).toEqual(serverPrefs.data);
  });
});
