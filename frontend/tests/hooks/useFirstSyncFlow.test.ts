import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { useFirstSyncFlow } from "@/hooks/useFirstSyncFlow";
import { getSyncCursorKey } from "@/constants/storageKeys";
import { EventStoreProvider } from "@/contexts/EventStoreContext";
import { tasksCollection, timeOffCollection } from "@/db/collections";
import * as collections from "@/db/collections";

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(EventStoreProvider, null, children);

const mockFetch = vi.fn();

const emptyStatus = {
  labels_updated_at: null,
  tasks_updated_at: null,
  templates_updated_at: null,
  work_locations_updated_at: null,
  time_off_entries_updated_at: null,
  gantt_tasks_updated_at: null,
  preferences_updated_at: null,
  server_timestamp: "2026-01-01T00:00:00.000Z",
};

const populatedStatus = {
  labels_updated_at: "2026-01-01T00:00:00.000Z",
  tasks_updated_at: null,
  templates_updated_at: null,
  work_locations_updated_at: null,
  time_off_entries_updated_at: null,
  gantt_tasks_updated_at: null,
  preferences_updated_at: null,
  server_timestamp: "2026-01-01T00:00:00.000Z",
};

const emptyPullResponse = {
  labels: [],
  tasks: [],
  templates: [],
  work_locations: [],
  time_off_entries: [],
  gantt_tasks: [],
  server_timestamp: "2026-01-02T00:00:00.000Z",
};

const emptyPushResponse = { results: {} };

function seedTasks() {
  tasksCollection.insert({ id: "t1", text: "Test", label: "", startTime: "2026-01-01T09:00" });
}

function seedTimeOff() {
  timeOffCollection.insert({
    id: "t1",
    entryKind: "date",
    date: "2026-07-14",
    entryType: "vacation",
    entryFlag: "full_day",
    note: "Bastille Day",
  });
}

describe("useFirstSyncFlow", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("starts in idle phase when not authenticated", () => {
    const { result } = renderHook(() => useFirstSyncFlow(false, null, null), { wrapper });
    expect(result.current.phase).toBe("idle");
  });

  it("starts in idle phase when authenticated but fetch is null", () => {
    const { result } = renderHook(() => useFirstSyncFlow(true, "user-1", null), { wrapper });
    expect(result.current.phase).toBe("idle");
  });

  it("skips the flow when a sync cursor already exists", async () => {
    localStorage.setItem(getSyncCursorKey("user-1"), "2026-01-01T00:00:00.000Z");

    const { result } = renderHook(() => useFirstSyncFlow(true, "user-1", mockFetch), { wrapper });

    // Should stay idle since cursor already exists
    await waitFor(() => {
      expect(result.current.phase).toBe("idle");
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("Branch D: completes immediately when neither side has data", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => emptyStatus });

    const { result } = renderHook(() => useFirstSyncFlow(true, "user-1", mockFetch), { wrapper });

    await waitFor(() => {
      expect(result.current.phase).toBe("done");
    });

    // Sync cursor should be set
    expect(localStorage.getItem(getSyncCursorKey("user-1"))).toBe(emptyStatus.server_timestamp);
  });

  it("pushes preferences-only local state without treating it as an entity conflict", async () => {
    localStorage.setItem("worktime_user_state", JSON.stringify({ hasCompletedOnboarding: true }));

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => emptyStatus }) // status check
      .mockResolvedValueOnce({ ok: true, json: async () => null }) // GET /api/preferences (none yet)
      .mockResolvedValueOnce({ ok: true }); // PUT /api/preferences

    const { result } = renderHook(() => useFirstSyncFlow(true, "user-1", mockFetch), { wrapper });

    await waitFor(() => {
      expect(result.current.phase).toBe("done");
    });

    const prefsPushCall = (mockFetch.mock.calls as [string, RequestInit | undefined][]).find(
      (call) => call[0] === "/api/preferences" && call[1]?.method === "PUT",
    );
    expect(prefsPushCall).toBeDefined();
  });

  it("does not raise a conflict when only preferences exist locally and the server has entities", async () => {
    // The settings blob exists on every device that has ever opened the app,
    // so counting it as "local data" would send almost every new sign-in into
    // the conflict dialog — where "keep local data" replaces the account's
    // real history with this device's (empty) collections.
    localStorage.setItem("worktime_user_state", JSON.stringify({ hasCompletedOnboarding: true }));

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => populatedStatus }) // status: server has labels
      .mockResolvedValueOnce({ ok: true, json: async () => emptyPullResponse }) // pull entities
      .mockResolvedValueOnce({ ok: true, json: async () => null }) // GET /api/preferences
      .mockResolvedValueOnce({ ok: true }); // PUT /api/preferences

    const { result } = renderHook(() => useFirstSyncFlow(true, "user-1", mockFetch), { wrapper });

    await waitFor(() => {
      expect(result.current.phase).toBe("done");
    });
    expect(result.current.phase).not.toBe("conflict");
  });

  it("Branch A: pushes local data when server is empty", async () => {
    seedTasks();

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => emptyStatus }) // status check
      .mockResolvedValueOnce({ ok: true, json: async () => emptyPushResponse }) // push
      .mockResolvedValueOnce({ ok: true, json: async () => emptyStatus }); // re-fetch status

    const { result } = renderHook(() => useFirstSyncFlow(true, "user-1", mockFetch), { wrapper });

    await waitFor(() => {
      expect(result.current.phase).toBe("done");
    });

    // Push endpoint should have been called
    const pushCall = (mockFetch.mock.calls as [string, RequestInit][]).find((call) => call[0] === "/api/sync/push");
    expect(pushCall).toBeDefined();
    expect(localStorage.getItem(getSyncCursorKey("user-1"))).not.toBeNull();
  });

  it("Branch A: pushes local time-off entries when only time-off data exists", async () => {
    seedTimeOff(); // only time-off, no tasks

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => emptyStatus }) // status check
      .mockResolvedValueOnce({ ok: true, json: async () => emptyPushResponse }) // push
      .mockResolvedValueOnce({ ok: true, json: async () => emptyStatus }); // re-fetch status

    const { result } = renderHook(() => useFirstSyncFlow(true, "user-1", mockFetch), { wrapper });

    await waitFor(() => {
      expect(result.current.phase).toBe("done");
    });

    // Push endpoint should have been called with time-off entries
    const pushCall = (mockFetch.mock.calls as [string, RequestInit][]).find((call) => call[0] === "/api/sync/push");
    expect(pushCall).toBeDefined();
    const body = JSON.parse((pushCall as [string, RequestInit])[1].body as string);
    expect(body.time_off_entries).toHaveLength(1);
    expect(body.time_off_entries[0]!.id).toBeTypeOf("string");
    expect(body.time_off_entries[0]!.entry_kind).toBe("date");
    expect(body.time_off_entries[0]!.date).toBe("2026-07-14");
  });

  it("Branch B: pulls server data when local is empty", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => populatedStatus }) // status
      .mockResolvedValueOnce({ ok: true, json: async () => emptyPullResponse }) // pull
      .mockResolvedValueOnce({ ok: false }); // GET /api/preferences — no prefs on server

    const { result } = renderHook(() => useFirstSyncFlow(true, "user-1", mockFetch), { wrapper });

    await waitFor(() => {
      expect(result.current.phase).toBe("done");
    });

    const pullCall = (mockFetch.mock.calls as [string, RequestInit][]).find((call) => call[0] === "/api/sync/pull");
    expect(pullCall).toBeDefined();
    expect(localStorage.getItem(getSyncCursorKey("user-1"))).toBe(
      emptyPullResponse.server_timestamp,
    );
  });

  it("Branch C: enters conflict phase when both have data", async () => {
    seedTasks();

    mockFetch.mockResolvedValue({ ok: true, json: async () => populatedStatus });

    const { result } = renderHook(() => useFirstSyncFlow(true, "user-1", mockFetch), { wrapper });

    await waitFor(() => {
      expect(result.current.phase).toBe("conflict");
    });
  });

  it("resolveConflict(keep-local) pushes local data and completes", async () => {
    seedTasks();

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => populatedStatus }) // initial status → conflict
      .mockResolvedValueOnce({ ok: true, json: async () => emptyPullResponse }) // pull server data
      .mockResolvedValueOnce({ ok: true, json: async () => emptyPushResponse }) // push replace payload
      .mockResolvedValueOnce({ ok: true, json: async () => emptyStatus }); // post-push status

    const { result } = renderHook(() => useFirstSyncFlow(true, "user-1", mockFetch), { wrapper });

    await waitFor(() => {
      expect(result.current.phase).toBe("conflict");
    });

    act(() => {
      result.current.resolveConflict("keep-local");
    });

    await waitFor(() => {
      expect(result.current.phase).toBe("done");
    });

    const pushCall = (mockFetch.mock.calls as [string, RequestInit][]).find((call) => call[0] === "/api/sync/push");
    expect(pushCall).toBeDefined();
  });

  it("resolveConflict(use-server) pulls server data and completes", async () => {
    seedTasks();

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => populatedStatus }) // initial status
      .mockResolvedValueOnce({ ok: true, json: async () => emptyPullResponse }) // pull
      .mockResolvedValueOnce({ ok: false }); // GET /api/preferences — no prefs on server

    const { result } = renderHook(() => useFirstSyncFlow(true, "user-1", mockFetch), { wrapper });

    await waitFor(() => {
      expect(result.current.phase).toBe("conflict");
    });

    act(() => {
      result.current.resolveConflict("use-server");
    });

    await waitFor(() => {
      expect(result.current.phase).toBe("done");
    });

    const pullCall = (mockFetch.mock.calls as [string, RequestInit][]).find((call) => call[0] === "/api/sync/pull");
    expect(pullCall).toBeDefined();
  });

  it("enters error phase when status fetch fails", async () => {
    mockFetch.mockResolvedValue({ ok: false });

    const { result } = renderHook(() => useFirstSyncFlow(true, "user-1", mockFetch), { wrapper });

    await waitFor(() => {
      expect(result.current.phase).toBe("error");
    });
  });

  it("dismiss resets phase to idle", async () => {
    seedTasks();
    mockFetch.mockResolvedValue({ ok: true, json: async () => populatedStatus });

    const { result } = renderHook(() => useFirstSyncFlow(true, "user-1", mockFetch), { wrapper });

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
      .mockResolvedValueOnce({ ok: true, json: async () => emptyStatus }) // status check
      .mockResolvedValueOnce({ ok: true, json: async () => emptyPushResponse }) // push entities
      .mockResolvedValueOnce({ ok: true }) // PUT /api/preferences
      .mockResolvedValueOnce({ ok: true, json: async () => emptyStatus }); // re-fetch status

    const { result } = renderHook(() => useFirstSyncFlow(true, "user-1", mockFetch), { wrapper });

    await waitFor(() => {
      expect(result.current.phase).toBe("done");
    });

    const prefsPushCall = (mockFetch.mock.calls as [string, RequestInit | undefined][]).find(
      (call) => call[0] === "/api/preferences" && call[1]?.method === "PUT",
    );
    expect(prefsPushCall).toBeDefined();
  });

  it("completes Branch A even when the preferences push fails", async () => {
    seedTasks();
    localStorage.setItem("worktime_user_state", JSON.stringify({ hasCompletedOnboarding: true }));

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => emptyStatus }) // status check
      .mockResolvedValueOnce({ ok: true, json: async () => emptyPushResponse }) // push entities
      .mockResolvedValueOnce({ ok: true, json: async () => null }) // GET /api/preferences
      .mockResolvedValueOnce({ ok: false }) // PUT /api/preferences fails
      .mockResolvedValueOnce({ ok: true, json: async () => emptyStatus }); // re-fetch status

    const { result } = renderHook(() => useFirstSyncFlow(true, "user-1", mockFetch), { wrapper });

    await waitFor(() => {
      expect(result.current.phase).toBe("done");
    });

    // The entities — the part that cannot be reconstructed — are on the server,
    // so the cursor advances. Preferences are a last-write-wins blob that every
    // ongoing sync cycle re-reconciles, so a failed push here self-heals rather
    // than needing the whole first sync replayed.
    expect(localStorage.getItem(getSyncCursorKey("user-1"))).not.toBeNull();
  });

  it("errors instead of guessing when the local collections cannot be read", async () => {
    const preloadSpy = vi
      .spyOn(collections, "preloadSyncCollections")
      .mockRejectedValue(new Error("collections unavailable"));

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => populatedStatus });

    const { result } = renderHook(() => useFirstSyncFlow(true, "user-1", mockFetch), { wrapper });

    await waitFor(() => {
      expect(result.current.phase).toBe("error");
    });

    // Unreadable local state must never be read as "there is no local data" —
    // that is what turns a failed load into a request to delete server records.
    expect(localStorage.getItem(getSyncCursorKey("user-1"))).toBeNull();
    preloadSpy.mockRestore();
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
      .mockResolvedValueOnce({ ok: true, json: async () => populatedStatus }) // status
      .mockResolvedValueOnce({ ok: true, json: async () => emptyPullResponse }) // pull entities
      .mockResolvedValueOnce({ ok: true, json: async () => serverPrefs }); // GET /api/preferences

    const { result } = renderHook(() => useFirstSyncFlow(true, "user-1", mockFetch), { wrapper });

    await waitFor(() => {
      expect(result.current.phase).toBe("done");
    });

    // Preferences should have been applied to localStorage
    const stored = localStorage.getItem("worktime_user_state");
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!)).toEqual(serverPrefs.data);
  });
});
