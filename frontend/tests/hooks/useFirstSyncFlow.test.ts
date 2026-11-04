import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { useFirstSyncFlow } from "@/hooks/useFirstSyncFlow";
import {
  ANONYMOUS_USER_STATE_OWNER,
  USER_STATE_UNCLAIMED_STORAGE_KEY,
  USER_STATE_UNCLAIMED_HISTORY_STORAGE_KEY,
  getAccountPreferencesKey,
  USER_STATE_OWNER_STORAGE_KEY,
  USER_STATE_STORAGE_KEY,
  USER_STATE_SWITCH_STORAGE_KEY,
  getSyncCursorKey,
  getSyncOutboxKey,
} from "@/constants/storageKeys";
import { EventStoreProvider } from "@/contexts/EventStoreContext";
import { tasksCollection, timeOffCollection } from "@/db/collections";
import { getPreferenceOwner } from "@/utils/preferenceStorage";
import { buildLocalSyncPushPayload, reconcilePreferences } from "@/utils/syncClient";
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
    sessionStorage.clear();
    mockFetch.mockReset();
    localStorage.setItem(USER_STATE_OWNER_STORAGE_KEY, "user-1");
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

  it("skips the flow when a sync cursor already exists and no local preferences need isolation", async () => {
    localStorage.removeItem(USER_STATE_OWNER_STORAGE_KEY);
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

  it.each([false, true])(
    "does not upload A's preferences when B signs in (returning: %s)",
    async (returning) => {
      localStorage.setItem(USER_STATE_OWNER_STORAGE_KEY, "user-a");
      mockFetch.mockImplementation(async (url: string) => ({
        ok: true,
        json: async () => (url === "/api/preferences" ? null : emptyStatus),
      }));
      const { result, rerender } = renderHook(
        ({ signedIn, uid }) => useFirstSyncFlow(signedIn, uid, mockFetch),
        { wrapper, initialProps: { signedIn: true, uid: "user-a" } },
      );
      await waitFor(() => expect(result.current.phase).toBe("done"));
      const pendingA = JSON.stringify([
        {
          labels: [],
          tasks: [
            {
              id: "offline-a",
              action: "create",
              client_updated_at: "2026-01-01T00:00:00Z",
              text: "A pending task",
            },
          ],
          templates: [],
          work_locations: [],
          time_off_entries: [],
          gantt_tasks: [],
        },
      ]);
      localStorage.setItem(getSyncOutboxKey("user-a"), pendingA);
      localStorage.setItem(
        USER_STATE_STORAGE_KEY,
        JSON.stringify({
          scheduleType: "2-shift",
          myTeam: 4,
          settings: { hdayUsername: "alice", theme: "dark" },
          _updatedAt: "2099-01-01T00:00:00.000Z",
        }),
      );
      rerender({ signedIn: false, uid: "user-a" });
      if (returning) localStorage.setItem(getSyncCursorKey("user-b"), emptyStatus.server_timestamp);
      mockFetch.mockClear();
      rerender({ signedIn: true, uid: "user-b" });
      await waitFor(() => expect(result.current.isSyncEstablished).toBe(true));
      const pushes = mockFetch.mock.calls.filter(
        ([url, init]) => url === "/api/preferences" && init?.method === "PUT",
      );
      expect(JSON.stringify(pushes)).not.toContain("2-shift");
      expect(JSON.stringify(pushes)).not.toContain("alice");
      expect(localStorage.getItem(USER_STATE_STORAGE_KEY)).not.toContain("alice");
      expect(JSON.parse(localStorage.getItem(USER_STATE_STORAGE_KEY)!)).toMatchObject({
        settings: { theme: "dark" },
      });
      expect(localStorage.getItem(getSyncOutboxKey("user-a"))).toBe(pendingA);
      expect(localStorage.getItem(getSyncOutboxKey("user-b"))).toBeNull();
    },
  );

  it("loads B's older account preferences instead of pushing A's newer copy", async () => {
    localStorage.setItem(USER_STATE_OWNER_STORAGE_KEY, "user-a");
    localStorage.setItem(
      USER_STATE_STORAGE_KEY,
      JSON.stringify({ scheduleType: "2-shift", _updatedAt: "2099-01-01T00:00:00Z" }),
    );
    const data = { scheduleType: "3-shift", _updatedAt: "2026-01-01T00:00:00Z" };
    mockFetch.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () =>
        url === "/api/preferences" ? { data, client_updated_at: data._updatedAt } : emptyStatus,
    }));
    const { result } = renderHook(() => useFirstSyncFlow(true, "user-b", mockFetch), { wrapper });
    await waitFor(() => expect(result.current.isSyncEstablished).toBe(true));
    expect(JSON.parse(localStorage.getItem(USER_STATE_STORAGE_KEY)!)).toMatchObject(data);
    expect(mockFetch.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });

  it("keeps sync disabled if B's account preferences cannot be fetched", async () => {
    localStorage.setItem(USER_STATE_OWNER_STORAGE_KEY, "user-a");
    localStorage.setItem(USER_STATE_STORAGE_KEY, JSON.stringify({ scheduleType: "2-shift" }));
    localStorage.setItem(getSyncCursorKey("user-b"), emptyStatus.server_timestamp);
    mockFetch.mockResolvedValue({ ok: false });
    const { result } = renderHook(() => useFirstSyncFlow(true, "user-b", mockFetch), { wrapper });
    await waitFor(() => expect(result.current.phase).toBe("error"));
    expect(result.current.isSyncEstablished).toBe(false);
    expect(localStorage.getItem(USER_STATE_OWNER_STORAGE_KEY)).toBe("user-a");
    expect(mockFetch.mock.calls.filter(([url]) => url === "/api/preferences")).toHaveLength(1);
    expect(mockFetch.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });

  it.each([false, true])(
    "isolates legacy preferences with unknown ownership (returning: %s)",
    async (returning) => {
      localStorage.removeItem(USER_STATE_OWNER_STORAGE_KEY);
      const legacy = JSON.stringify({
        scheduleType: "2-shift",
        _updatedAt: "2099-01-01T00:00:00Z",
      });
      localStorage.setItem(USER_STATE_STORAGE_KEY, legacy);
      if (returning) localStorage.setItem(getSyncCursorKey("user-b"), emptyStatus.server_timestamp);
      mockFetch.mockImplementation(async (url: string) => ({
        ok: true,
        json: async () => (url === "/api/preferences" ? null : emptyStatus),
      }));
      const { result } = renderHook(() => useFirstSyncFlow(true, "user-b", mockFetch), { wrapper });
      await waitFor(() => expect(result.current.isSyncEstablished).toBe(true));
      expect(JSON.stringify(mockFetch.mock.calls)).not.toContain("2-shift");
      expect(localStorage.getItem(USER_STATE_STORAGE_KEY)).not.toContain("2-shift");
      expect(localStorage.getItem(USER_STATE_UNCLAIMED_STORAGE_KEY)).toBe(legacy);
    },
  );

  it.each(["replacement", "backup"])(
    "keeps sync disabled when the %s write fails",
    async (failure) => {
      localStorage.setItem(USER_STATE_OWNER_STORAGE_KEY, "user-a");
      const outgoing = JSON.stringify({
        scheduleType: "2-shift",
        _updatedAt: "2099-01-01T00:00:00Z",
      });
      localStorage.setItem(USER_STATE_STORAGE_KEY, outgoing);
      localStorage.setItem(getSyncCursorKey("user-b"), emptyStatus.server_timestamp);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { scheduleType: "3-shift" } }),
      });
      const original = localStorage.setItem;
      const write = vi.spyOn(localStorage, "setItem").mockImplementation(function (
        this: Storage,
        key: string,
        value: string,
      ) {
        if (
          key ===
          (failure === "replacement" ? USER_STATE_STORAGE_KEY : getAccountPreferencesKey("user-a"))
        )
          throw new DOMException("Quota exceeded", "QuotaExceededError");
        return original.call(this, key, value);
      });
      try {
        const { result } = renderHook(() => useFirstSyncFlow(true, "user-b", mockFetch), {
          wrapper,
        });
        await waitFor(() => expect(result.current.phase).toBe("error"));
        expect(result.current.isSyncEstablished).toBe(false);
        expect(localStorage.getItem(USER_STATE_STORAGE_KEY)).toBe(outgoing);
        expect(localStorage.getItem(USER_STATE_OWNER_STORAGE_KEY)).not.toBe("user-b");
      } finally {
        write.mockRestore();
      }
    },
  );

  it("does not misattribute the replacement after an owner-write failure and reload", async () => {
    localStorage.setItem(USER_STATE_OWNER_STORAGE_KEY, "user-a");
    const outgoing = JSON.stringify({
      scheduleType: "2-shift",
      _updatedAt: "2099-01-01T00:00:00Z",
    });
    localStorage.setItem(USER_STATE_STORAGE_KEY, outgoing);
    localStorage.setItem(getSyncCursorKey("user-b"), emptyStatus.server_timestamp);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { scheduleType: "3-shift" } }),
    });
    const original = localStorage.setItem;
    const write = vi.spyOn(localStorage, "setItem").mockImplementation((key, value) => {
      if (key === USER_STATE_OWNER_STORAGE_KEY && value === "user-b")
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      original(key, value);
    });
    const first = renderHook(() => useFirstSyncFlow(true, "user-b", mockFetch), { wrapper });
    try {
      await waitFor(() => expect(first.result.current.phase).toBe("error"));
      expect(first.result.current.isSyncEstablished).toBe(false);
      expect(getPreferenceOwner()).toBe("user-b");
    } finally {
      write.mockRestore();
      first.unmount();
    }
    const next = renderHook(() => useFirstSyncFlow(true, "user-b", mockFetch), { wrapper });
    await waitFor(() => expect(next.result.current.isSyncEstablished).toBe(true));
    expect(localStorage.getItem(getAccountPreferencesKey("user-a"))).toBe(outgoing);
    expect(localStorage.getItem(USER_STATE_STORAGE_KEY)).toContain("3-shift");
  });

  it.each([
    ["replacement", "user-b"],
    ["owner", "user-b"],
    ["replacement", "user-c"],
    ["owner", "user-c"],
  ])(
    "recovers a failed %s write with a legacy backup when %s signs in",
    async (failure, returning) => {
      const legacy = JSON.stringify({ scheduleType: "legacy" });
      const outgoing = JSON.stringify({
        scheduleType: "2-shift",
        settings: { hdayUsername: "alice" },
        _updatedAt: "2099-01-01T00:00:00Z",
      });
      localStorage.setItem(USER_STATE_UNCLAIMED_STORAGE_KEY, legacy);
      localStorage.setItem(USER_STATE_OWNER_STORAGE_KEY, "user-a");
      localStorage.setItem(USER_STATE_STORAGE_KEY, outgoing);
      localStorage.setItem(getSyncCursorKey("user-b"), emptyStatus.server_timestamp);
      localStorage.setItem(getSyncCursorKey("user-c"), emptyStatus.server_timestamp);
      const prefsB = { scheduleType: "3-shift", _updatedAt: emptyStatus.server_timestamp };
      const prefsNext =
        returning === "user-b"
          ? prefsB
          : { scheduleType: "5-shift", _updatedAt: emptyStatus.server_timestamp };
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: prefsB, client_updated_at: prefsB._updatedAt }),
      });
      const original = localStorage.setItem;
      const write = vi.spyOn(localStorage, "setItem").mockImplementation((key, value) => {
        if (
          (failure === "replacement" && key === USER_STATE_STORAGE_KEY) ||
          (failure === "owner" && key === USER_STATE_OWNER_STORAGE_KEY && value === "user-b")
        )
          throw new DOMException("Quota exceeded", "QuotaExceededError");
        original(key, value);
      });
      const first = renderHook(() => useFirstSyncFlow(true, "user-b", mockFetch), { wrapper });
      try {
        await waitFor(() => expect(first.result.current.phase).toBe("error"));
        expect(first.result.current.isSyncEstablished).toBe(false);
      } finally {
        write.mockRestore();
        first.unmount();
      }
      const fetchNext = vi.fn(
        async () =>
          ({
            ok: true,
            json: async () => ({ data: prefsNext, client_updated_at: prefsNext._updatedAt }),
          }) as Response,
      );
      const next = renderHook(() => useFirstSyncFlow(true, returning, fetchNext), { wrapper });
      await waitFor(() => expect(next.result.current.isSyncEstablished).toBe(true));
      await reconcilePreferences(fetchNext);
      expect(localStorage.getItem(USER_STATE_UNCLAIMED_STORAGE_KEY)).toBe(legacy);
      expect(localStorage.getItem(getAccountPreferencesKey("user-a"))).toBe(outgoing);
      expect(JSON.parse(localStorage.getItem(USER_STATE_STORAGE_KEY)!)).toMatchObject(prefsNext);
      expect(JSON.stringify(fetchNext.mock.calls)).not.toContain("alice");
      expect(JSON.stringify(fetchNext.mock.calls)).not.toContain("2-shift");
      if (returning === "user-c")
        expect(JSON.stringify(fetchNext.mock.calls)).not.toContain("3-shift");
    },
  );

  it("preserves new account edits when only switch-journal cleanup failed", async () => {
    const legacy = JSON.stringify({ scheduleType: "legacy" });
    const outgoing = JSON.stringify({ scheduleType: "2-shift" });
    localStorage.setItem(USER_STATE_UNCLAIMED_STORAGE_KEY, legacy);
    localStorage.setItem(USER_STATE_OWNER_STORAGE_KEY, "user-a");
    localStorage.setItem(USER_STATE_STORAGE_KEY, outgoing);
    localStorage.setItem(getSyncCursorKey("user-b"), emptyStatus.server_timestamp);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { scheduleType: "3-shift" } }),
    });
    const remove = localStorage.removeItem;
    const cleanup = vi.spyOn(localStorage, "removeItem").mockImplementation((key) => {
      if (key === USER_STATE_SWITCH_STORAGE_KEY) throw new DOMException("Storage unavailable");
      remove(key);
    });
    const first = renderHook(() => useFirstSyncFlow(true, "user-b", mockFetch), { wrapper });
    try {
      await waitFor(() => expect(first.result.current.phase).toBe("error"));
      expect(first.result.current.isSyncEstablished).toBe(false);
      expect(localStorage.getItem(USER_STATE_OWNER_STORAGE_KEY)).toBe("user-b");
    } finally {
      cleanup.mockRestore();
      first.unmount();
    }
    localStorage.setItem(USER_STATE_STORAGE_KEY, JSON.stringify({ scheduleType: "5-shift" }));
    const next = renderHook(() => useFirstSyncFlow(true, "user-b", mockFetch), { wrapper });
    await waitFor(() => expect(next.result.current.isSyncEstablished).toBe(true));
    expect(JSON.parse(localStorage.getItem(USER_STATE_STORAGE_KEY)!)).toMatchObject({
      scheduleType: "5-shift",
    });
    expect(localStorage.getItem(USER_STATE_SWITCH_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(USER_STATE_UNCLAIMED_STORAGE_KEY)).toBe(legacy);
    expect(localStorage.getItem(getAccountPreferencesKey("user-a"))).toBe(outgoing);
  });

  it.each(
    ["backup", "journal", "replacement", "owner", "cleanup"].flatMap((step) =>
      ["user-b", "user-c"].map((next) => [step, next]),
    ),
  )("preserves intervening edits after %s failure when %s signs in", async (step, nextUser) => {
    const legacy = JSON.stringify({ scheduleType: "legacy" });
    const outgoing = JSON.stringify({
      scheduleType: "2-shift",
      _updatedAt: "2026-01-01T00:00:00Z",
    });
    localStorage.setItem(USER_STATE_UNCLAIMED_STORAGE_KEY, legacy);
    localStorage.setItem(USER_STATE_OWNER_STORAGE_KEY, "user-a");
    localStorage.setItem(USER_STATE_STORAGE_KEY, outgoing);
    for (const uid of ["user-b", "user-c"])
      localStorage.setItem(getSyncCursorKey(uid), emptyStatus.server_timestamp);
    const dataB = { scheduleType: "3-shift", _updatedAt: emptyStatus.server_timestamp };
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: dataB, client_updated_at: dataB._updatedAt }),
    });
    const set = localStorage.setItem;
    const remove = localStorage.removeItem;
    const writes = vi.spyOn(localStorage, "setItem").mockImplementation((key, value) => {
      if (
        (step === "backup" && key === getAccountPreferencesKey("user-a")) ||
        (step === "journal" && key === USER_STATE_SWITCH_STORAGE_KEY) ||
        (step === "replacement" && key === USER_STATE_STORAGE_KEY) ||
        (step === "owner" && key === USER_STATE_OWNER_STORAGE_KEY && value === "user-b")
      )
        throw new DOMException("Unavailable");
      set(key, value);
    });
    const removals = vi.spyOn(localStorage, "removeItem").mockImplementation((key) => {
      if (step === "cleanup" && key === USER_STATE_SWITCH_STORAGE_KEY)
        throw new DOMException("Unavailable");
      remove(key);
    });
    const first = renderHook(() => useFirstSyncFlow(true, "user-b", mockFetch), { wrapper });
    try {
      await waitFor(() => expect(first.result.current.phase).toBe("error"));
    } finally {
      writes.mockRestore();
      removals.mockRestore();
      first.unmount();
    }
    const editedOwner = step === "owner" || step === "cleanup" ? "user-b" : "user-a";
    const edited = {
      ...JSON.parse(localStorage.getItem(USER_STATE_STORAGE_KEY)!),
      scheduleType: "edited-" + editedOwner,
      _updatedAt: "2099-01-01T00:00:00Z",
    };
    localStorage.setItem(USER_STATE_STORAGE_KEY, JSON.stringify(edited));
    const dataNext =
      nextUser === "user-b"
        ? dataB
        : { scheduleType: "5-shift", _updatedAt: emptyStatus.server_timestamp };
    const fetchNext = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        ({
          ok: true,
          json: async () => ({ data: dataNext, client_updated_at: dataNext._updatedAt }),
        }) as Response,
    );
    const next = renderHook(() => useFirstSyncFlow(true, nextUser, fetchNext), { wrapper });
    await waitFor(() => expect(next.result.current.isSyncEstablished).toBe(true));
    await reconcilePreferences(fetchNext);
    const preserved =
      editedOwner === nextUser
        ? localStorage.getItem(USER_STATE_STORAGE_KEY)
        : localStorage.getItem(getAccountPreferencesKey(editedOwner));
    expect(JSON.parse(preserved!)).toMatchObject(edited);
    expect(localStorage.getItem(USER_STATE_UNCLAIMED_STORAGE_KEY)).toBe(legacy);
    if (editedOwner !== nextUser)
      expect(JSON.stringify(fetchNext.mock.calls)).not.toContain("edited-" + editedOwner);
    expect(JSON.stringify(fetchNext.mock.calls)).not.toContain("2-shift");
    expect(localStorage.getItem(USER_STATE_SWITCH_STORAGE_KEY)).toBeNull();
  });

  it("preserves target edits and the outgoing backup when another tab finishes the same switch first", async () => {
    const outgoing = JSON.stringify({ scheduleType: "2-shift" });
    localStorage.setItem(USER_STATE_OWNER_STORAGE_KEY, "user-a");
    localStorage.setItem(USER_STATE_STORAGE_KEY, outgoing);
    localStorage.setItem(getSyncCursorKey("user-b"), emptyStatus.server_timestamp);
    let release!: (response: Response) => void;
    const response = {
      ok: true,
      json: async () => ({ data: { scheduleType: "3-shift" } }),
    } as Response;
    mockFetch
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValue(response);
    const first = renderHook(() => useFirstSyncFlow(true, "user-b", mockFetch), { wrapper });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const second = renderHook(() => useFirstSyncFlow(true, "user-b", mockFetch), { wrapper });
    await waitFor(() => expect(second.result.current.isSyncEstablished).toBe(true));
    localStorage.setItem(
      USER_STATE_STORAGE_KEY,
      JSON.stringify({
        ...JSON.parse(localStorage.getItem(USER_STATE_STORAGE_KEY)!),
        scheduleType: "edited-b",
      }),
    );
    await act(async () => {
      release(response);
    });
    await waitFor(() => expect(first.result.current.isSyncEstablished).toBe(true));
    expect(localStorage.getItem(getAccountPreferencesKey("user-a"))).toBe(outgoing);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(USER_STATE_STORAGE_KEY)).toContain("edited-b");
  });

  it("preserves edits to unclaimed state after a failed replacement without uploading them", async () => {
    localStorage.removeItem(USER_STATE_OWNER_STORAGE_KEY);
    const legacy = JSON.stringify({ scheduleType: "legacy" });
    localStorage.setItem(USER_STATE_STORAGE_KEY, legacy);
    localStorage.setItem(getSyncCursorKey("user-b"), emptyStatus.server_timestamp);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { scheduleType: "3-shift" } }),
    });
    const set = localStorage.setItem;
    const write = vi.spyOn(localStorage, "setItem").mockImplementation((key, value) => {
      if (key === USER_STATE_STORAGE_KEY) throw new DOMException("Unavailable");
      set(key, value);
    });
    const first = renderHook(() => useFirstSyncFlow(true, "user-b", mockFetch), { wrapper });
    try {
      await waitFor(() => expect(first.result.current.phase).toBe("error"));
    } finally {
      write.mockRestore();
      first.unmount();
    }
    const edited = JSON.stringify({ scheduleType: "edited-legacy" });
    localStorage.setItem(USER_STATE_STORAGE_KEY, edited);
    const historyWrite = vi.spyOn(localStorage, "setItem").mockImplementation((key, value) => {
      if (key === USER_STATE_UNCLAIMED_HISTORY_STORAGE_KEY) throw new DOMException("Unavailable");
      set(key, value);
    });
    const failedRetry = renderHook(() => useFirstSyncFlow(true, "user-b", mockFetch), { wrapper });
    try {
      await waitFor(() => expect(failedRetry.result.current.phase).toBe("error"));
      expect(localStorage.getItem(USER_STATE_STORAGE_KEY)).toBe(edited);
      expect(localStorage.getItem(USER_STATE_UNCLAIMED_STORAGE_KEY)).toBe(legacy);
    } finally {
      historyWrite.mockRestore();
      failedRetry.unmount();
    }
    const next = renderHook(() => useFirstSyncFlow(true, "user-b", mockFetch), { wrapper });
    await waitFor(() => expect(next.result.current.isSyncEstablished).toBe(true));
    expect(localStorage.getItem(USER_STATE_UNCLAIMED_STORAGE_KEY)).toBe(legacy);
    expect(JSON.parse(localStorage.getItem(USER_STATE_UNCLAIMED_HISTORY_STORAGE_KEY)!)).toContain(
      edited,
    );
    expect(localStorage.getItem(USER_STATE_STORAGE_KEY)).not.toContain("legacy");
    expect(JSON.stringify(mockFetch.mock.calls)).not.toContain("edited-legacy");
  });

  it("serializes different account commits and refuses to sync the other tab's preferences", async () => {
    localStorage.setItem(USER_STATE_OWNER_STORAGE_KEY, "user-a");
    localStorage.setItem(USER_STATE_STORAGE_KEY, JSON.stringify({ scheduleType: "2-shift" }));
    for (const uid of ["user-b", "user-c"])
      localStorage.setItem(getSyncCursorKey(uid), emptyStatus.server_timestamp);
    let releaseB!: (response: Response) => void;
    let releaseC!: (response: Response) => void;
    const fetchB = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          releaseB = resolve;
        }),
    );
    const fetchC = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          releaseC = resolve;
        }),
    );
    const first = renderHook(() => useFirstSyncFlow(true, "user-b", fetchB), { wrapper });
    await waitFor(() => expect(fetchB).toHaveBeenCalledTimes(1));
    const second = renderHook(() => useFirstSyncFlow(true, "user-c", fetchC), { wrapper });
    await waitFor(() => expect(fetchC).toHaveBeenCalledTimes(1));
    localStorage.setItem(USER_STATE_STORAGE_KEY, JSON.stringify({ scheduleType: "edited-a" }));
    await act(async () =>
      releaseB({ ok: true, json: async () => ({ data: { scheduleType: "3-shift" } }) } as Response),
    );
    await waitFor(() => expect(first.result.current.isSyncEstablished).toBe(true));
    localStorage.setItem(
      USER_STATE_STORAGE_KEY,
      JSON.stringify({
        ...JSON.parse(localStorage.getItem(USER_STATE_STORAGE_KEY)!),
        scheduleType: "edited-b",
      }),
    );
    await act(async () =>
      releaseC({ ok: true, json: async () => ({ data: { scheduleType: "5-shift" } }) } as Response),
    );
    await waitFor(() => expect(second.result.current.isSyncEstablished).toBe(true));
    expect(JSON.parse(localStorage.getItem(getAccountPreferencesKey("user-a"))!)).toMatchObject({
      scheduleType: "edited-a",
    });
    expect(JSON.parse(localStorage.getItem(getAccountPreferencesKey("user-b"))!)).toMatchObject({
      scheduleType: "edited-b",
    });
    expect(getPreferenceOwner()).toBe("user-c");
    await reconcilePreferences(fetchB, "user-b");
    expect(fetchB).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(USER_STATE_STORAGE_KEY)).toContain("5-shift");
  });

  it("restores A's unsynced preference edits after A signs in again", async () => {
    localStorage.setItem(USER_STATE_OWNER_STORAGE_KEY, "user-a");
    const outgoing = {
      scheduleType: "2-shift",
      settings: { hdayUsername: "alice" },
      _updatedAt: "2099-01-01T00:00:00Z",
    };
    localStorage.setItem(USER_STATE_STORAGE_KEY, JSON.stringify(outgoing));
    localStorage.setItem(getSyncCursorKey("user-a"), emptyStatus.server_timestamp);
    const fetchA = vi.fn(
      async (url: string, _init?: RequestInit) =>
        ({
          ok: true,
          json: async () => (url === "/api/preferences" ? null : emptyStatus),
        }) as Response,
    );
    mockFetch.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => (url === "/api/preferences" ? null : emptyStatus),
    }));
    const { result, rerender } = renderHook(
      ({ signedIn, uid, fetch }) => useFirstSyncFlow(signedIn, uid, fetch),
      { wrapper, initialProps: { signedIn: true, uid: "user-a", fetch: fetchA } },
    );
    await waitFor(() => expect(result.current.isSyncEstablished).toBe(true));
    rerender({ signedIn: false, uid: "user-a", fetch: fetchA });
    rerender({ signedIn: true, uid: "user-b", fetch: mockFetch });
    await waitFor(() => expect(result.current.isSyncEstablished).toBe(true));
    expect(localStorage.getItem(getAccountPreferencesKey("user-a"))).toBe(JSON.stringify(outgoing));
    expect(JSON.stringify(mockFetch.mock.calls)).not.toContain("alice");
    rerender({ signedIn: false, uid: "user-b", fetch: mockFetch });
    rerender({ signedIn: true, uid: "user-a", fetch: fetchA });
    await waitFor(() => expect(result.current.isSyncEstablished).toBe(true));
    expect(JSON.parse(localStorage.getItem(USER_STATE_STORAGE_KEY)!)).toMatchObject(outgoing);
    await reconcilePreferences(fetchA);
    expect(
      fetchA.mock.calls.some(
        ([url, init]) =>
          url === "/api/preferences" &&
          init?.method === "PUT" &&
          init.body?.toString().includes("alice"),
      ),
    ).toBe(true);
    expect(JSON.stringify(mockFetch.mock.calls)).not.toContain("alice");
  });

  it.each([undefined, ANONYMOUS_USER_STATE_OWNER])(
    "allows anonymous preferences with blob owner %s to join the first account",
    async (owner) => {
      localStorage.setItem(USER_STATE_OWNER_STORAGE_KEY, ANONYMOUS_USER_STATE_OWNER);
      localStorage.setItem(
        USER_STATE_STORAGE_KEY,
        JSON.stringify({ scheduleType: "2-shift", _accountOwner: owner }),
      );
      mockFetch.mockImplementation(async (url: string) => ({
        ok: true,
        json: async () => (url === "/api/preferences" ? null : emptyStatus),
      }));
      const { result } = renderHook(() => useFirstSyncFlow(true, "user-b", mockFetch), { wrapper });
      await waitFor(() => expect(result.current.isSyncEstablished).toBe(true));
      expect(
        mockFetch.mock.calls.some(
          ([url, init]) =>
            url === "/api/preferences" && init?.method === "PUT" && init.body.includes("2-shift"),
        ),
      ).toBe(true);
    },
  );

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
    const pushCall = (mockFetch.mock.calls as [string, RequestInit][]).find(
      (call) => call[0] === "/api/sync/push",
    );
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
    const pushCall = (mockFetch.mock.calls as [string, RequestInit][]).find(
      (call) => call[0] === "/api/sync/push",
    );
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

    const pullCall = (mockFetch.mock.calls as [string, RequestInit][]).find(
      (call) => call[0] === "/api/sync/pull",
    );
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

    const pushCall = (mockFetch.mock.calls as [string, RequestInit][]).find(
      (call) => call[0] === "/api/sync/push",
    );
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

    const pullCall = (mockFetch.mock.calls as [string, RequestInit][]).find(
      (call) => call[0] === "/api/sync/pull",
    );
    expect(pullCall).toBeDefined();
  });

  it("enters error phase when status fetch fails", async () => {
    mockFetch.mockResolvedValue({ ok: false });

    const { result } = renderHook(() => useFirstSyncFlow(true, "user-1", mockFetch), { wrapper });

    await waitFor(() => {
      expect(result.current.phase).toBe("error");
    });
  });

  it.each([false, true])(
    "compares content before suppressing reconciliation (different: %s)",
    async (different) => {
      seedTimeOff();
      const payload = buildLocalSyncPushPayload();
      const item = payload.time_off_entries[0]!;
      const snapshot = {
        ...emptyPullResponse,
        time_off_entries: [
          { ...item, id: 1, entry_id: different ? "different-id" : item.id, deleted_at: null },
        ],
      };
      mockFetch.mockImplementation(async (url: string) => ({
        ok: true,
        json: async () =>
          url.includes("/status") ? populatedStatus : url.includes("/pull") ? snapshot : null,
      }));
      const { result } = renderHook(() => useFirstSyncFlow(true, "user-1", mockFetch), { wrapper });
      await waitFor(() => expect(result.current.phase).toBe(different ? "conflict" : "done"));
    },
  );

  it("dismiss resets phase to idle and survives a remount for this session", async () => {
    seedTasks();
    mockFetch.mockResolvedValue({ ok: true, json: async () => populatedStatus });

    const { result, unmount } = renderHook(() => useFirstSyncFlow(true, "user-1", mockFetch), {
      wrapper,
    });
    await waitFor(() => expect(result.current.phase).toBe("conflict"));
    act(() => result.current.dismiss());
    expect(result.current.phase).toBe("idle");
    unmount();
    mockFetch.mockClear();
    const remounted = renderHook(() => useFirstSyncFlow(true, "user-1", mockFetch), { wrapper });
    expect(remounted.result.current.phase).toBe("idle");
    expect(mockFetch).not.toHaveBeenCalled();
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
    expect(JSON.parse(stored!)).toMatchObject(serverPrefs.data);
  });
});
