import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyPreferencesPull,
  appendToPendingSyncOutbox,
  appendToSyncOutbox,
  bumpClientTimestamps,
  buildKeepLocalReplacePayload,
  buildLocalPreferencesPayload,
  buildLocalSyncPushPayload,
  clearSyncOutbox,
  countPushConflicts,
  dequeueAndMergeSyncOutbox,
  drainPendingSyncOutbox,
  countPayloadDeletes,
  EmptyLocalReplaceError,
  extractConflictedItems,
  fetchPreferences,
  fetchSyncStatus,
  getSyncOutboxSize,
  hasSyncCursor,
  MAX_SYNC_PUSH_ITEMS,
  maxConflictServerTimestamp,
  pullSyncData,
  pushPreferences,
  pushSyncPayload,
  storeSyncCursor,
  syncStatusHasData,
  timeOffEntriesToSyncItems,
  type SyncPushPayload,
} from "@/utils/syncClient";
import {
  getSyncCursorKey,
  getSyncOutboxKey,
  SYNC_PENDING_OUTBOX_KEY,
  USER_STATE_STORAGE_KEY,
} from "@/constants/storageKeys";
import { buildTimeOffEntryForRange, createWeeklyTimeOffEntry } from "@/lib/timeOff/codecs";
import type { TimeOffDateEntry, TimeOffRangeEntry, TimeOffWeeklyEntry } from "@/lib/timeOff/types";
import {
  ganttTasksCollection,
  labelsCollection,
  tasksCollection,
  templatesCollection,
  timeOffCollection,
  workLocationsCollection,
} from "@/db/collections";
import type { IsoAlpha2 } from "@/types/countries";
import type { StoredTimeTrackingTask } from "@/lib/timeTracking/types";
import type { SyncPullResponse, TaskSyncRead, LabelSyncRead } from "@/utils/syncClient";

const mockFetch = vi.fn();

describe("syncClient", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    mockFetch.mockReset();
  });

  // ---------------------------------------------------------------------------
  // syncStatusHasData
  // ---------------------------------------------------------------------------

  describe("syncStatusHasData", () => {
    it("returns false when all timestamps are null", () => {
      expect(
        syncStatusHasData({
          labels_updated_at: null,
          tasks_updated_at: null,
          templates_updated_at: null,
          work_locations_updated_at: null,
          time_off_entries_updated_at: null,
          gantt_tasks_updated_at: null,
          preferences_updated_at: null,
          server_timestamp: "2026-01-01T00:00:00Z",
        }),
      ).toBe(false);
    });

    it("returns true when at least one timestamp is non-null", () => {
      expect(
        syncStatusHasData({
          labels_updated_at: "2026-01-01T00:00:00Z",
          tasks_updated_at: null,
          templates_updated_at: null,
          work_locations_updated_at: null,
          time_off_entries_updated_at: null,
          gantt_tasks_updated_at: null,
          preferences_updated_at: null,
          server_timestamp: "2026-01-01T00:00:00Z",
        }),
      ).toBe(true);
    });

    it("returns true when time_off_entries_updated_at is non-null", () => {
      expect(
        syncStatusHasData({
          labels_updated_at: null,
          tasks_updated_at: null,
          templates_updated_at: null,
          work_locations_updated_at: null,
          time_off_entries_updated_at: "2026-01-01T00:00:00Z",
          gantt_tasks_updated_at: null,
          preferences_updated_at: null,
          server_timestamp: "2026-01-01T00:00:00Z",
        }),
      ).toBe(true);
    });

    it("returns true when gantt_tasks_updated_at is non-null", () => {
      expect(
        syncStatusHasData({
          labels_updated_at: null,
          tasks_updated_at: null,
          templates_updated_at: null,
          work_locations_updated_at: null,
          time_off_entries_updated_at: null,
          gantt_tasks_updated_at: "2026-01-01T00:00:00Z",
          preferences_updated_at: null,
          server_timestamp: "2026-01-01T00:00:00Z",
        }),
      ).toBe(true);
    });

    it("returns true when preferences_updated_at is non-null", () => {
      expect(
        syncStatusHasData({
          labels_updated_at: null,
          tasks_updated_at: null,
          templates_updated_at: null,
          work_locations_updated_at: null,
          time_off_entries_updated_at: null,
          gantt_tasks_updated_at: null,
          preferences_updated_at: "2026-01-01T00:00:00Z",
          server_timestamp: "2026-01-01T00:00:00Z",
        }),
      ).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // countPushConflicts
  // ---------------------------------------------------------------------------

  describe("countPushConflicts", () => {
    it("returns 0 when results object is empty", () => {
      expect(countPushConflicts({ results: {} })).toBe(0);
    });

    it("returns 0 when all records have status ok", () => {
      expect(
        countPushConflicts({
          results: {
            labels: [
              { id: "l1", status: "ok" },
              { id: "l2", status: "ok" },
            ],
          },
        }),
      ).toBe(0);
    });

    it("counts conflict records across all entity types", () => {
      expect(
        countPushConflicts({
          results: {
            labels: [
              { id: "l1", status: "ok" },
              { id: "l2", status: "conflict", conflict_reason: "server is newer" },
            ],
            tasks: [{ id: "t1", status: "conflict", conflict_reason: "server is newer" }],
            templates: [],
          },
        }),
      ).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // extractConflictedItems
  // ---------------------------------------------------------------------------

  describe("extractConflictedItems", () => {
    const makePayload = () => ({
      labels: [
        { id: "l1", action: "update" as const, client_updated_at: "2026-01-01T00:00:00.000Z" },
        { id: "l2", action: "update" as const, client_updated_at: "2026-01-01T00:00:00.000Z" },
      ],
      tasks: [
        { id: "t1", action: "update" as const, client_updated_at: "2026-01-01T00:00:00.000Z" },
      ],
      templates: [],
      work_locations: [
        {
          date: "2026-01-05",
          action: "update" as const,
          client_updated_at: "2026-01-01T00:00:00.000Z",
          country_code: "NL",
        },
      ],
      time_off_entries: [],
      gantt_tasks: [],
    });

    it("returns empty payload when no conflicts", () => {
      const result = extractConflictedItems(makePayload(), {
        results: {
          labels: [
            { id: "l1", status: "ok" },
            { id: "l2", status: "ok" },
          ],
          tasks: [{ id: "t1", status: "ok" }],
        },
      });
      expect(result.labels).toHaveLength(0);
      expect(result.tasks).toHaveLength(0);
      expect(result.work_locations).toHaveLength(0);
    });

    it("extracts only conflicted labels", () => {
      const result = extractConflictedItems(makePayload(), {
        results: {
          labels: [
            { id: "l1", status: "ok" },
            { id: "l2", status: "conflict", conflict_reason: "server is newer" },
          ],
          tasks: [{ id: "t1", status: "ok" }],
        },
      });
      expect(result.labels).toHaveLength(1);
      expect(result.labels[0]!.id).toBe("l2");
      expect(result.tasks).toHaveLength(0);
    });

    it("extracts conflicted work_locations matched by date", () => {
      const result = extractConflictedItems(makePayload(), {
        results: {
          work_locations: [
            { id: "2026-01-05", status: "conflict", conflict_reason: "server is newer" },
          ],
        },
      });
      expect(result.work_locations).toHaveLength(1);
      expect(result.work_locations[0]!.date).toBe("2026-01-05");
    });

    it("returns empty arrays for entity types absent from response results", () => {
      const result = extractConflictedItems(makePayload(), { results: {} });
      expect(result.labels).toHaveLength(0);
      expect(result.tasks).toHaveLength(0);
      expect(result.templates).toHaveLength(0);
      expect(result.work_locations).toHaveLength(0);
      expect(result.time_off_entries).toHaveLength(0);
      expect(result.gantt_tasks).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // bumpClientTimestamps
  // ---------------------------------------------------------------------------

  describe("bumpClientTimestamps", () => {
    it("updates client_updated_at on all entity types to the same ISO timestamp", () => {
      const before = new Date("2026-01-01T00:00:00.000Z").toISOString();
      const payload = {
        labels: [{ id: "l1", action: "update" as const, client_updated_at: before }],
        tasks: [{ id: "t1", action: "update" as const, client_updated_at: before }],
        templates: [{ id: "tp1", action: "update" as const, client_updated_at: before }],
        work_locations: [
          {
            date: "2026-01-05",
            action: "update" as const,
            client_updated_at: before,
            country_code: "NL",
          },
        ],
        time_off_entries: [{ id: "toe1", action: "update" as const, client_updated_at: before }],
        gantt_tasks: [{ id: "gt1", action: "update" as const, client_updated_at: before }],
      };

      const now = new Date("2026-06-01T12:00:00.000Z").toISOString();
      vi.setSystemTime(new Date(now));

      const result = bumpClientTimestamps(payload);

      expect(result.labels[0]!.client_updated_at).toBe(now);
      expect(result.tasks[0]!.client_updated_at).toBe(now);
      expect(result.templates[0]!.client_updated_at).toBe(now);
      expect(result.work_locations[0]!.client_updated_at).toBe(now);
      expect(result.time_off_entries[0]!.client_updated_at).toBe(now);
      expect(result.gantt_tasks[0]!.client_updated_at).toBe(now);

      vi.useRealTimers();
    });

    it("does not mutate the original payload", () => {
      const before = "2026-01-01T00:00:00.000Z";
      const payload = {
        labels: [{ id: "l1", action: "update" as const, client_updated_at: before }],
        tasks: [],
        templates: [],
        work_locations: [],
        time_off_entries: [],
        gantt_tasks: [],
      };

      bumpClientTimestamps(payload);

      expect(payload.labels[0]!.client_updated_at).toBe(before);
    });

    it("uses local clock when serverTimestampFloor is not provided", () => {
      const now = "2026-06-01T12:00:00.000Z";
      vi.setSystemTime(new Date(now));
      const payload = {
        labels: [
          { id: "l1", action: "update" as const, client_updated_at: "2026-01-01T00:00:00.000Z" },
        ],
        tasks: [],
        templates: [],
        work_locations: [],
        time_off_entries: [],
        gantt_tasks: [],
      };
      const result = bumpClientTimestamps(payload);
      expect(result.labels[0]!.client_updated_at).toBe(now);
      vi.useRealTimers();
    });

    it("uses serverTimestampFloor when it is ahead of the local clock", () => {
      // Local clock is set to a time behind the server timestamp.
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      const serverFloor = "2026-06-01T12:00:00.000Z";
      const payload = {
        labels: [
          { id: "l1", action: "update" as const, client_updated_at: "2026-01-01T00:00:00.000Z" },
        ],
        tasks: [],
        templates: [],
        work_locations: [],
        time_off_entries: [],
        gantt_tasks: [],
      };
      const result = bumpClientTimestamps(payload, serverFloor);
      expect(result.labels[0]!.client_updated_at).toBe(serverFloor);
      vi.useRealTimers();
    });

    it("uses local clock when serverTimestampFloor is in the past", () => {
      const now = "2026-06-01T12:00:00.000Z";
      vi.setSystemTime(new Date(now));
      const serverFloor = "2026-01-01T00:00:00.000Z";
      const payload = {
        labels: [
          { id: "l1", action: "update" as const, client_updated_at: "2025-01-01T00:00:00.000Z" },
        ],
        tasks: [],
        templates: [],
        work_locations: [],
        time_off_entries: [],
        gantt_tasks: [],
      };
      const result = bumpClientTimestamps(payload, serverFloor);
      expect(result.labels[0]!.client_updated_at).toBe(now);
      vi.useRealTimers();
    });

    it("falls back to local clock when serverTimestampFloor is an invalid string", () => {
      const now = "2026-06-01T12:00:00.000Z";
      vi.setSystemTime(new Date(now));
      const payload = {
        labels: [
          { id: "l1", action: "update" as const, client_updated_at: "2026-01-01T00:00:00.000Z" },
        ],
        tasks: [],
        templates: [],
        work_locations: [],
        time_off_entries: [],
        gantt_tasks: [],
      };
      const result = bumpClientTimestamps(payload, "not-a-date");
      expect(result.labels[0]!.client_updated_at).toBe(now);
      vi.useRealTimers();
    });
  });

  // ---------------------------------------------------------------------------
  // maxConflictServerTimestamp
  // ---------------------------------------------------------------------------

  describe("maxConflictServerTimestamp", () => {
    it("returns undefined when results object is empty", () => {
      expect(maxConflictServerTimestamp({ results: {} })).toBeUndefined();
    });

    it("returns undefined when no records have status conflict", () => {
      expect(
        maxConflictServerTimestamp({
          results: {
            labels: [{ id: "l1", status: "ok" }],
          },
        }),
      ).toBeUndefined();
    });

    it("returns undefined when conflicted records have no server_updated_at", () => {
      expect(
        maxConflictServerTimestamp({
          results: {
            labels: [{ id: "l1", status: "conflict", conflict_reason: "server is newer" }],
          },
        }),
      ).toBeUndefined();
    });

    it("returns the single conflict server_updated_at", () => {
      expect(
        maxConflictServerTimestamp({
          results: {
            labels: [
              {
                id: "l1",
                status: "conflict",
                conflict_reason: "server is newer",
                server_updated_at: "2026-03-01T00:00:00.000Z",
              },
            ],
          },
        }),
      ).toBe("2026-03-01T00:00:00.000Z");
    });

    it("returns the maximum server_updated_at across multiple conflict records", () => {
      expect(
        maxConflictServerTimestamp({
          results: {
            labels: [
              {
                id: "l1",
                status: "conflict",
                conflict_reason: "server is newer",
                server_updated_at: "2026-03-01T00:00:00.000Z",
              },
              {
                id: "l2",
                status: "conflict",
                conflict_reason: "server is newer",
                server_updated_at: "2026-01-01T00:00:00.000Z",
              },
            ],
            tasks: [
              {
                id: "t1",
                status: "conflict",
                conflict_reason: "server is newer",
                server_updated_at: "2026-06-01T00:00:00.000Z",
              },
            ],
          },
        }),
      ).toBe("2026-06-01T00:00:00.000Z");
    });

    it("ignores non-conflict records when computing the max", () => {
      expect(
        maxConflictServerTimestamp({
          results: {
            labels: [
              { id: "l1", status: "ok", server_updated_at: "2099-01-01T00:00:00.000Z" },
              {
                id: "l2",
                status: "conflict",
                conflict_reason: "server is newer",
                server_updated_at: "2026-03-01T00:00:00.000Z",
              },
            ],
          },
        }),
      ).toBe("2026-03-01T00:00:00.000Z");
    });

    it("ignores entries with invalid server_updated_at values", () => {
      expect(
        maxConflictServerTimestamp({
          results: {
            labels: [
              {
                id: "l1",
                status: "conflict",
                conflict_reason: "server is newer",
                server_updated_at: "not-a-date",
              },
              {
                id: "l2",
                status: "conflict",
                conflict_reason: "server is newer",
                server_updated_at: "2026-03-01T00:00:00.000Z",
              },
            ],
          },
        }),
      ).toBe("2026-03-01T00:00:00.000Z");
    });
  });

  // ---------------------------------------------------------------------------
  // fetchSyncStatus
  // ---------------------------------------------------------------------------

  describe("fetchSyncStatus", () => {
    it("returns parsed status on success", async () => {
      const status = {
        labels_updated_at: null,
        tasks_updated_at: null,
        templates_updated_at: null,
        work_locations_updated_at: null,
        server_timestamp: "2026-01-01T00:00:00Z",
      };
      mockFetch.mockResolvedValue({ ok: true, json: async () => status });

      const result = await fetchSyncStatus(mockFetch);
      expect(result).toEqual(status);
      expect(mockFetch).toHaveBeenCalledWith("/api/sync/status");
    });

    it("returns null when response is not ok", async () => {
      mockFetch.mockResolvedValue({ ok: false });
      expect(await fetchSyncStatus(mockFetch)).toBeNull();
    });

    it("returns null when fetch throws", async () => {
      mockFetch.mockRejectedValue(new Error("network error"));
      expect(await fetchSyncStatus(mockFetch)).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // pushSyncPayload
  // ---------------------------------------------------------------------------

  describe("pushSyncPayload", () => {
    it("POSTs the payload and returns the response", async () => {
      const response = { results: { tasks: [] } };
      mockFetch.mockResolvedValue({ ok: true, json: async () => response });

      const payload: SyncPushPayload = {
        labels: [],
        tasks: [],
        templates: [],
        work_locations: [],
        time_off_entries: [],
        gantt_tasks: [],
      };
      const result = await pushSyncPayload(mockFetch, payload);

      expect(result).toEqual(response);
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/sync/push",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("returns null on non-ok response", async () => {
      mockFetch.mockResolvedValue({ ok: false });
      const result = await pushSyncPayload(mockFetch, {
        labels: [],
        tasks: [],
        templates: [],
        work_locations: [],
        time_off_entries: [],
        gantt_tasks: [],
      });
      expect(result).toBeNull();
    });

    it("splits oversized payloads into chunks and merges the results", async () => {
      const taskCount = MAX_SYNC_PUSH_ITEMS + 5;
      const tasks = Array.from({ length: taskCount }, (_, i) => ({
        id: `task-${i}`,
        action: "create",
        client_updated_at: "2026-01-01T00:00:00Z",
        text: `Task ${i}`,
        start_time: "2026-01-01T09:00:00Z",
      }));
      const labels = [
        {
          id: "label-1",
          action: "create",
          client_updated_at: "2026-01-01T00:00:00Z",
          name: "L",
          color: "#000",
        },
      ];

      mockFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as SyncPushPayload;
        const results: Record<string, { id: string; status: string }[]> = {};
        for (const [key, items] of Object.entries(body)) {
          if (Array.isArray(items) && items.length > 0) {
            results[key] = items.map((item) => ({
              id: "id" in item ? (item.id as string) : (item as { date: string }).date,
              status: "ok",
            }));
          }
        }
        return { ok: true, json: async () => ({ results }) };
      });

      const result = await pushSyncPayload(mockFetch, {
        ...emptyPayload(),
        labels,
        tasks,
      } as SyncPushPayload);

      // 1 label chunk + 2 task chunks (1000 + 5)
      expect(mockFetch).toHaveBeenCalledTimes(3);
      // Referenced entities (labels) are pushed before tasks.
      const firstBody = JSON.parse(
        String((mockFetch.mock.calls[0] as [string, RequestInit])[1]?.body),
      ) as SyncPushPayload;
      expect(firstBody.labels).toHaveLength(1);
      expect(firstBody.tasks).toHaveLength(0);
      // Each request stays within the server's per-list cap.
      for (const call of mockFetch.mock.calls as [string, RequestInit][]) {
        const body = JSON.parse(String(call[1]?.body)) as SyncPushPayload;
        for (const items of Object.values(body)) {
          expect((items as unknown[]).length).toBeLessThanOrEqual(MAX_SYNC_PUSH_ITEMS);
        }
      }
      // Merged response contains every record's result.
      expect(result!.results["tasks"]).toHaveLength(taskCount);
      expect(result!.results["labels"]).toHaveLength(1);
    });

    it("returns null when any chunk of an oversized payload fails", async () => {
      const tasks = Array.from({ length: MAX_SYNC_PUSH_ITEMS + 1 }, (_, i) => ({
        id: `task-${i}`,
        action: "create",
        client_updated_at: "2026-01-01T00:00:00Z",
        text: `Task ${i}`,
        start_time: "2026-01-01T09:00:00Z",
      }));

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ results: {} }) })
        .mockResolvedValueOnce({ ok: false });

      const result = await pushSyncPayload(mockFetch, {
        ...emptyPayload(),
        tasks,
      } as SyncPushPayload);
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // pullSyncData
  // ---------------------------------------------------------------------------

  describe("pullSyncData", () => {
    it("calls the pull endpoint without since param by default", async () => {
      const pullResp = {
        labels: [],
        tasks: [],
        templates: [],
        work_locations: [],
        server_timestamp: "2026-01-01T00:00:00Z",
      };
      mockFetch.mockResolvedValue({ ok: true, json: async () => pullResp });

      const result = await pullSyncData(mockFetch);
      expect(result).toEqual(pullResp);
      expect(mockFetch).toHaveBeenCalledWith("/api/sync/pull");
    });

    it("includes since param when provided", async () => {
      const pullResp = {
        labels: [],
        tasks: [],
        templates: [],
        work_locations: [],
        server_timestamp: "2026-01-01T00:00:00Z",
      };
      mockFetch.mockResolvedValue({ ok: true, json: async () => pullResp });

      await pullSyncData(mockFetch, "2026-01-01T00:00:00Z");
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("since="));
    });

    it("retries an expired cursor as a marked full resync", async () => {
      const pullResp = {
        labels: [],
        tasks: [],
        templates: [],
        work_locations: [],
        time_off_entries: [],
        gantt_tasks: [],
        server_timestamp: "2026-04-01T00:00:00Z",
      };
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 410 })
        .mockResolvedValueOnce({ ok: true, json: async () => pullResp });

      const result = await pullSyncData(mockFetch, "2025-01-01T00:00:00Z");

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenLastCalledWith("/api/sync/pull");
      expect(result).toEqual({ ...pullResp, full_resync_required: true });
    });
  });

  // ---------------------------------------------------------------------------
  // buildLocalSyncPushPayload
  // ---------------------------------------------------------------------------

  describe("buildLocalSyncPushPayload", () => {
    it("returns empty arrays when the collections are empty", () => {
      const payload = buildLocalSyncPushPayload();
      expect(payload.labels).toHaveLength(0);
      expect(payload.tasks).toHaveLength(0);
      expect(payload.templates).toHaveLength(0);
      expect(payload.work_locations).toHaveLength(0);
    });

    it("converts labels to sync items with action=create", () => {
      labelsCollection.insert({ id: "label-1", name: "Work", color: "#FF0000" });

      const payload = buildLocalSyncPushPayload();
      expect(payload.labels).toHaveLength(1);
      expect(payload.labels[0]).toMatchObject({
        id: "label-1",
        action: "create",
        name: "Work",
        color: "#FF0000",
      });
      expect(typeof payload.labels[0]!.client_updated_at).toBe("string");
    });

    it("converts tasks to sync items with UTC start_time", () => {
      labelsCollection.insert({ id: "label-1", name: "Work", color: "#FF0000" });
      tasksCollection.insert({
        id: "task-1",
        text: "Hello",
        label: "label-1",
        startTime: "2026-01-01T09:00",
        stopTime: "2026-01-01T17:00",
        includesBreak: true,
      });

      const payload = buildLocalSyncPushPayload();
      expect(payload.tasks).toHaveLength(1);
      expect(payload.tasks[0]).toMatchObject({
        id: "task-1",
        action: "create",
        label_id: "label-1",
        text: "Hello",
        includes_break: true,
      });
      // start_time and stop_time should be ISO strings ending with Z (UTC)
      expect(payload.tasks[0]!.start_time).toMatch(/Z$/);
      expect(payload.tasks[0]!.stop_time).toMatch(/Z$/);
    });

    it("handles tasks with no stopTime", () => {
      tasksCollection.insert({
        id: "task-2",
        text: "Open",
        label: "",
        startTime: "2026-01-01T09:00",
      });

      const payload = buildLocalSyncPushPayload();
      expect(payload.tasks[0]!.stop_time).toBeNull();
    });

    it("converts templates with HH:mm:ss time format", () => {
      labelsCollection.insert({ id: "label-1", name: "Work", color: "#FF0000" });
      templatesCollection.insert({
        id: "tmpl-1",
        text: "Standup",
        label: "label-1",
        start: "09:00",
        stop: "09:15",
      });

      const payload = buildLocalSyncPushPayload();
      expect(payload.templates[0]).toMatchObject({
        id: "tmpl-1",
        action: "create",
        label_id: "label-1",
        text: "Standup",
        start_time: "09:00:00",
        stop_time: "09:15:00",
      });
    });

    it("excludes labels with missing or non-string color", () => {
      labelsCollection.insert({ id: "lbl-good", name: "Good", color: "#FF0000" });
      labelsCollection.insert({ id: "lbl-no-color", name: "Bad", color: null as never });
      labelsCollection.insert({ id: "lbl-num-color", name: "Numeric", color: 123 as never });

      const payload = buildLocalSyncPushPayload();
      expect(payload.labels).toHaveLength(1);
      expect(payload.labels[0]!.id).toBe("lbl-good");
    });

    it("excludes templates with missing required fields", () => {
      templatesCollection.insert({
        id: "tmpl-good",
        text: "Valid",
        label: "",
        start: "09:00",
        stop: "09:15",
      });
      templatesCollection.insert({
        id: "tmpl-no-text",
        text: "",
        label: "",
        start: "09:00",
        stop: "09:15",
      });
      templatesCollection.insert({
        id: "tmpl-bad-start",
        text: "Bad start",
        label: "",
        start: "9:00" as never,
        stop: "09:15",
      });
      templatesCollection.insert({
        id: "tmpl-no-stop",
        text: "No stop",
        label: "",
        start: "09:00",
        stop: "" as never,
      });

      const payload = buildLocalSyncPushPayload();
      expect(payload.templates).toHaveLength(1);
      expect(payload.templates[0]!.id).toBe("tmpl-good");
    });

    it("excludes soft-deleted tasks from the payload", () => {
      tasksCollection.insert({
        id: "task-live",
        text: "Live",
        label: "",
        startTime: "2026-01-01T09:00",
      });
      tasksCollection.insert({
        id: "task-deleted",
        text: "Gone",
        label: "",
        startTime: "2026-01-01T10:00",
        deleted_at: "2026-01-02T00:00:00.000Z",
      } as StoredTimeTrackingTask & { deleted_at: string });

      const payload = buildLocalSyncPushPayload();
      expect(payload.tasks).toHaveLength(1);
      expect(payload.tasks[0]!.id).toBe("task-live");
    });

    it("nulls out a task's label_id when the referenced label was dropped by the label filter", () => {
      // No matching label in labelsCollection — e.g. it was dropped for having a non-string color.
      labelsCollection.insert({ id: "lbl-dropped", name: "Bad", color: null as never });
      tasksCollection.insert({
        id: "task-1",
        text: "Hello",
        label: "lbl-dropped",
        startTime: "2026-01-01T09:00",
      });

      const payload = buildLocalSyncPushPayload();
      expect(payload.labels).toHaveLength(0);
      expect(payload.tasks).toHaveLength(1);
      expect(payload.tasks[0]!.label_id).toBeNull();
    });

    it("nulls out a template's label_id when the referenced label was dropped by the label filter", () => {
      labelsCollection.insert({ id: "lbl-dropped", name: "Bad", color: null as never });
      templatesCollection.insert({
        id: "tmpl-1",
        text: "Standup",
        label: "lbl-dropped",
        start: "09:00",
        stop: "09:15",
      });

      const payload = buildLocalSyncPushPayload();
      expect(payload.templates).toHaveLength(1);
      expect(payload.templates[0]!.label_id).toBeNull();
    });

    it("nulls out a task's gantt_task_id when the referenced gantt task was dropped by the gantt filter", () => {
      // Empty `name` fails isValidRawGanttTask, so this row is dropped.
      ganttTasksCollection.insert({
        id: "gantt-dropped",
        name: "",
        start: "2026-01-01",
        end: "2026-01-02",
        progress: 0,
      });
      tasksCollection.insert({
        id: "task-1",
        text: "Hello",
        label: "",
        ganttTaskId: "gantt-dropped",
        startTime: "2026-01-01T09:00",
      });

      const payload = buildLocalSyncPushPayload();
      expect(payload.gantt_tasks).toHaveLength(0);
      expect(payload.tasks).toHaveLength(1);
      expect(payload.tasks[0]!.gantt_task_id).toBeNull();
    });

    it("nulls out a gantt task's own label_id when the referenced label was dropped by the label filter", () => {
      labelsCollection.insert({ id: "lbl-dropped", name: "Bad", color: null as never });
      ganttTasksCollection.insert({
        id: "gantt-1",
        name: "Plan release",
        label: "lbl-dropped",
        start: "2026-01-01",
        end: "2026-01-02",
        progress: 0,
      });

      const payload = buildLocalSyncPushPayload();
      expect(payload.gantt_tasks).toHaveLength(1);
      expect(payload.gantt_tasks[0]!.label_id).toBeNull();
    });

    it("keeps label_id/gantt_task_id references that survive both filters", () => {
      labelsCollection.insert({ id: "label-1", name: "Work", color: "#FF0000" });
      ganttTasksCollection.insert({
        id: "gantt-1",
        name: "Plan release",
        start: "2026-01-01",
        end: "2026-01-02",
        progress: 0,
      });
      tasksCollection.insert({
        id: "task-1",
        text: "Hello",
        label: "label-1",
        ganttTaskId: "gantt-1",
        startTime: "2026-01-01T09:00",
      });

      const payload = buildLocalSyncPushPayload();
      expect(payload.tasks[0]!.label_id).toBe("label-1");
      expect(payload.tasks[0]!.gantt_task_id).toBe("gantt-1");
    });

    it("converts work locations from the flat collection", () => {
      workLocationsCollection.insert({
        date: "2026-01-05",
        countryCode: "NL" as IsoAlpha2,
      });
      workLocationsCollection.insert({
        date: "2026-01-06",
        countryCode: "DE" as IsoAlpha2,
        label: "Berlin",
      });

      const payload = buildLocalSyncPushPayload();
      expect(payload.work_locations).toHaveLength(2);

      const nl = payload.work_locations.find((wl) => wl.date === "2026-01-05");
      expect(nl).toMatchObject({ action: "create", country_code: "NL", label: null });

      const de = payload.work_locations.find((wl) => wl.date === "2026-01-06");
      expect(de).toMatchObject({ action: "create", country_code: "DE", label: "Berlin" });
    });
  });

  // ---------------------------------------------------------------------------
  // buildKeepLocalReplacePayload
  // ---------------------------------------------------------------------------

  describe("buildKeepLocalReplacePayload", () => {
    const makeEmptyPullResponse = (): SyncPullResponse => ({
      labels: [],
      tasks: [],
      templates: [],
      work_locations: [],
      time_off_entries: [],
      gantt_tasks: [],
      server_timestamp: "2026-01-01T00:00:00Z",
    });

    const makeServerLabel = (id: string, deletedAt: string | null = null) => ({
      id,
      user_id: 1,
      name: `Label ${id}`,
      color: "#AABBCC",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      deleted_at: deletedAt,
    });

    const makeServerTask = (id: string, deletedAt: string | null = null) => ({
      id,
      user_id: 1,
      label_id: null,
      text: `Task ${id}`,
      start_time: "2026-01-01T09:00:00Z",
      stop_time: null,
      includes_break: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      deleted_at: deletedAt,
    });

    const makeServerTemplate = (id: string, deletedAt: string | null = null) => ({
      id,
      user_id: 1,
      label_id: null,
      text: `Template ${id}`,
      start_time: "09:00:00",
      stop_time: "09:15:00",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      deleted_at: deletedAt,
    });

    const makeServerWorkLocation = (date: string, deletedAt: string | null = null) => ({
      id: 1,
      user_id: 1,
      date,
      country_code: "NL",
      label: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      deleted_at: deletedAt,
    });

    it("preserves all local records in the output payload", () => {
      labelsCollection.insert({ id: "local-lbl", name: "Local", color: "#FFFFFF" });
      const localPayload = buildLocalSyncPushPayload();
      const result = buildKeepLocalReplacePayload(localPayload, makeEmptyPullResponse());

      expect(result.labels.find((l) => l.id === "local-lbl")).toBeDefined();
      expect(result.labels.find((l) => l.id === "local-lbl")?.action).toBe("create");
    });

    it("adds delete entries for server-only labels not present locally", () => {
      localStorage.clear(); // no local labels beyond the anchor
      labelsCollection.insert({ id: "anchor-lbl", name: "Anchor", color: "#000000" });
      const localPayload = buildLocalSyncPushPayload();
      const serverData = {
        ...makeEmptyPullResponse(),
        labels: [makeServerLabel("server-only-lbl")],
      };

      const result = buildKeepLocalReplacePayload(localPayload, serverData);

      const deleted = result.labels.find((l) => l.id === "server-only-lbl");
      expect(deleted).toBeDefined();
      expect(deleted?.action).toBe("delete");
    });

    it("does not re-delete already soft-deleted server labels", () => {
      localStorage.clear();
      // buildKeepLocalReplacePayload refuses a wholly empty local side, so
      // anchor it with one unrelated local record.
      labelsCollection.insert({ id: "anchor-lbl", name: "Anchor", color: "#000000" });
      const localPayload = buildLocalSyncPushPayload();
      const serverData = {
        ...makeEmptyPullResponse(),
        labels: [makeServerLabel("already-deleted-lbl", "2026-01-02T00:00:00Z")],
      };

      const result = buildKeepLocalReplacePayload(localPayload, serverData);
      expect(result.labels.find((l) => l.id === "already-deleted-lbl")).toBeUndefined();
    });

    it("adds delete entries for server-only tasks", () => {
      localStorage.clear();
      // buildKeepLocalReplacePayload refuses a wholly empty local side, so
      // anchor it with one unrelated local record.
      labelsCollection.insert({ id: "anchor-lbl", name: "Anchor", color: "#000000" });
      const localPayload = buildLocalSyncPushPayload();
      const serverData: SyncPullResponse = {
        ...makeEmptyPullResponse(),
        tasks: [makeServerTask("server-task") as TaskSyncRead],
      };

      const result = buildKeepLocalReplacePayload(localPayload, serverData);
      expect(result.tasks.find((t) => t.id === "server-task")?.action).toBe("delete");
    });

    it("does not re-delete already soft-deleted server tasks", () => {
      localStorage.clear();
      // buildKeepLocalReplacePayload refuses a wholly empty local side, so
      // anchor it with one unrelated local record.
      labelsCollection.insert({ id: "anchor-lbl", name: "Anchor", color: "#000000" });
      const localPayload = buildLocalSyncPushPayload();
      const serverData: SyncPullResponse = {
        ...makeEmptyPullResponse(),
        tasks: [makeServerTask("deleted-task", "2026-01-02T00:00:00Z") as TaskSyncRead],
      };

      const result = buildKeepLocalReplacePayload(localPayload, serverData);
      expect(result.tasks.find((t) => t.id === "deleted-task")).toBeUndefined();
    });

    it("adds delete entries for server-only templates", () => {
      localStorage.clear();
      // buildKeepLocalReplacePayload refuses a wholly empty local side, so
      // anchor it with one unrelated local record.
      labelsCollection.insert({ id: "anchor-lbl", name: "Anchor", color: "#000000" });
      const localPayload = buildLocalSyncPushPayload();
      const serverData = {
        ...makeEmptyPullResponse(),
        templates: [makeServerTemplate("server-tmpl")],
      };

      const result = buildKeepLocalReplacePayload(localPayload, serverData);
      expect(result.templates.find((t) => t.id === "server-tmpl")?.action).toBe("delete");
    });

    it("does not delete server labels that also exist locally", () => {
      labelsCollection.insert({ id: "shared-lbl", name: "Shared", color: "#FF0000" });
      const localPayload = buildLocalSyncPushPayload();
      const serverData = {
        ...makeEmptyPullResponse(),
        labels: [makeServerLabel("shared-lbl"), makeServerLabel("server-only-lbl")],
      };

      const result = buildKeepLocalReplacePayload(localPayload, serverData);

      // shared-lbl: present locally → keep (create), NOT deleted
      expect(result.labels.find((l) => l.id === "shared-lbl")?.action).toBe("create");
      expect(result.labels.filter((l) => l.id === "shared-lbl")).toHaveLength(1);

      // server-only-lbl: not in local → delete
      expect(result.labels.find((l) => l.id === "server-only-lbl")?.action).toBe("delete");
    });

    it("adds delete entries for server-only work locations", () => {
      localStorage.clear();
      // buildKeepLocalReplacePayload refuses a wholly empty local side, so
      // anchor it with one unrelated local record.
      labelsCollection.insert({ id: "anchor-lbl", name: "Anchor", color: "#000000" });
      const localPayload = buildLocalSyncPushPayload();
      const serverData = {
        ...makeEmptyPullResponse(),
        work_locations: [makeServerWorkLocation("2026-01-10")],
      };

      const result = buildKeepLocalReplacePayload(localPayload, serverData);
      expect(result.work_locations.find((wl) => wl.date === "2026-01-10")?.action).toBe("delete");
    });

    it("does not re-delete already soft-deleted work locations", () => {
      localStorage.clear();
      // buildKeepLocalReplacePayload refuses a wholly empty local side, so
      // anchor it with one unrelated local record.
      labelsCollection.insert({ id: "anchor-lbl", name: "Anchor", color: "#000000" });
      const localPayload = buildLocalSyncPushPayload();
      const serverData = {
        ...makeEmptyPullResponse(),
        work_locations: [makeServerWorkLocation("2026-01-10", "2026-01-09T00:00:00Z")],
      };

      const result = buildKeepLocalReplacePayload(localPayload, serverData);
      expect(result.work_locations.find((wl) => wl.date === "2026-01-10")).toBeUndefined();
    });

    it("declares the whole delete total on every chunk of a split push", async () => {
      // Each chunk is its own server transaction. Without a declared total the
      // bulk-delete guard sees only its own slice, so the first chunk of a
      // destructive batch commits before a later one is refused — leaving the
      // account partly erased.
      const payload = {
        ...emptyPayload(),
        labels: Array.from({ length: MAX_SYNC_PUSH_ITEMS + 200 }, (_, i) => ({
          id: `lbl-${i}`,
          action: "delete" as const,
          client_updated_at: "2026-01-01T00:00:00.000Z",
        })),
      };
      expect(countPayloadDeletes(payload)).toBe(MAX_SYNC_PUSH_ITEMS + 200);

      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ results: {} }) });
      await pushSyncPayload(mockFetch, payload);

      const bodies = (mockFetch.mock.calls as [string, RequestInit][])
        .filter((call) => call[0] === "/api/sync/push")
        .map((call) => JSON.parse(String(call[1].body)));

      expect(bodies.length).toBeGreaterThan(1);
      for (const body of bodies) {
        expect(body.declared_delete_total).toBe(MAX_SYNC_PUSH_ITEMS + 200);
      }
    });

    it("omits the delete total when a split push deletes nothing", async () => {
      const payload = {
        ...emptyPayload(),
        labels: Array.from({ length: MAX_SYNC_PUSH_ITEMS + 5 }, (_, i) => ({
          id: `lbl-${i}`,
          action: "create" as const,
          client_updated_at: "2026-01-01T00:00:00.000Z",
          name: `Label ${i}`,
          color: "#123456",
        })),
      };

      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ results: {} }) });
      await pushSyncPayload(mockFetch, payload);

      const bodies = (mockFetch.mock.calls as [string, RequestInit][])
        .filter((call) => call[0] === "/api/sync/push")
        .map((call) => JSON.parse(String(call[1].body)));
      expect(bodies.length).toBeGreaterThan(1);
      for (const body of bodies) {
        expect(body.declared_delete_total).toBeUndefined();
      }
    });

    it("refuses to build a replace payload when the local side is empty", () => {
      localStorage.clear();
      const localPayload = buildLocalSyncPushPayload();
      const serverData: SyncPullResponse = {
        ...makeEmptyPullResponse(),
        labels: [makeServerLabel("server-lbl") as LabelSyncRead],
        tasks: [makeServerTask("server-task") as TaskSyncRead],
      };

      // An empty local snapshot would turn "keep my local data" into a batch
      // that deletes every server record. It is far more likely to mean the
      // local collections have not loaded than that the user wants their
      // account emptied, so it must not be silently turned into deletes.
      expect(() => buildKeepLocalReplacePayload(localPayload, serverData)).toThrow(
        EmptyLocalReplaceError,
      );
    });

    it("opts in to the server's bulk-delete guard for a confirmed replace", () => {
      labelsCollection.insert({ id: "local-lbl", name: "Local", color: "#FFFFFF" });
      const localPayload = buildLocalSyncPushPayload();
      const serverData = {
        ...makeEmptyPullResponse(),
        labels: [makeServerLabel("server-only-lbl")],
      };

      const result = buildKeepLocalReplacePayload(localPayload, serverData);
      expect(result.allow_bulk_delete).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // timeOffEntriesToSyncItems
  // ---------------------------------------------------------------------------

  describe("timeOffEntriesToSyncItems", () => {
    const ts = "2026-01-01T00:00:00.000Z";

    it("converts a single-date entry to one sync item", () => {
      const [entry] = [
        buildTimeOffEntryForRange({
          start: "2026-07-14",
          end: "2026-07-14",
          note: "Bastille Day",
          entryType: "vacation",
          entryFlag: "full_day",
        }),
      ];
      const items = timeOffEntriesToSyncItems([entry], ts);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        id: entry.id,
        entry_kind: "date",
        date: "2026-07-14",
        action: "create",
        entry_type: "vacation",
        entry_flag: "full_day",
        note: "Bastille Day",
      });
    });

    it("preserves range entries as single sync items", () => {
      const [entry] = [
        buildTimeOffEntryForRange({
          start: "2026-12-24",
          end: "2026-12-26",
          note: undefined,
          entryType: "vacation",
          entryFlag: "full_day",
        }),
      ];
      const items = timeOffEntriesToSyncItems([entry], ts);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        id: entry.id,
        entry_kind: "range",
        start_date: "2026-12-24",
        end_date: "2026-12-26",
        date: null,
      });
    });

    it("maps entry types correctly", () => {
      const entries = [
        buildTimeOffEntryForRange({
          start: "2026-01-01",
          end: "2026-01-01",
          note: undefined,
          entryType: "business",
          entryFlag: "full_day",
        }),
        buildTimeOffEntryForRange({
          start: "2026-01-02",
          end: "2026-01-02",
          note: undefined,
          entryType: "ill",
          entryFlag: "full_day",
        }),
        buildTimeOffEntryForRange({
          start: "2026-01-03",
          end: "2026-01-03",
          note: undefined,
          entryType: "in",
          entryFlag: "full_day",
        }),
      ];
      const items = timeOffEntriesToSyncItems(entries, ts);
      expect(items[0]?.entry_type).toBe("business");
      expect(items[1]?.entry_type).toBe("ill");
      expect(items[2]?.entry_type).toBe("in");
    });

    it("preserves entry flag", () => {
      const items = timeOffEntriesToSyncItems(
        [
          buildTimeOffEntryForRange({
            start: "2026-06-01",
            end: "2026-06-01",
            note: undefined,
            entryType: "vacation",
            entryFlag: "half_am",
          }),
        ],
        ts,
      );
      expect(items[0]?.entry_flag).toBe("half_am");
      expect(items[0]?.entry_type).toBe("vacation");
    });

    it("includes weekly entries directly", () => {
      const [entry] = [
        createWeeklyTimeOffEntry({
          weekday: 1,
          note: undefined,
          entryType: "in",
          entryFlag: "full_day",
        }),
      ];
      const items = timeOffEntriesToSyncItems([entry], ts);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        id: entry.id,
        entry_kind: "weekly",
        weekday: 1,
        date: null,
        start_date: null,
        end_date: null,
        entry_type: "in",
      });
    });

    it("returns empty array for empty entries", () => {
      const items = timeOffEntriesToSyncItems([], ts);
      expect(items).toHaveLength(0);
    });

    it("sets note to null when entry has no note", () => {
      const items = timeOffEntriesToSyncItems(
        [
          buildTimeOffEntryForRange({
            start: "2026-05-01",
            end: "2026-05-01",
            note: undefined,
            entryType: "vacation",
            entryFlag: "full_day",
          }),
        ],
        ts,
      );
      expect(items[0]?.note).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // time-off entries in buildLocalSyncPushPayload
  // ---------------------------------------------------------------------------

  describe("buildLocalSyncPushPayload — time_off_entries", () => {
    it("includes time-off entries from canonical storage", () => {
      const entry: TimeOffDateEntry = {
        id: "e1",
        entryKind: "date",
        date: "2026-07-14",
        entryType: "vacation",
        entryFlag: "full_day",
        note: "Vacation",
      };
      timeOffCollection.insert(entry);
      const payload = buildLocalSyncPushPayload();
      expect(payload.time_off_entries).toHaveLength(1);
      expect(payload.time_off_entries[0]).toMatchObject({
        entry_kind: "date",
        date: "2026-07-14",
        action: "create",
        entry_type: "vacation",
        note: "Vacation",
      });
      expect(payload.time_off_entries[0]?.id).toBe("e1");
    });

    it("preserves multi-day range entries as single entries", () => {
      const entry: TimeOffRangeEntry = {
        id: "e2",
        entryKind: "range",
        start: "2026-12-24",
        end: "2026-12-26",
        entryType: "vacation",
        entryFlag: "full_day",
        note: null,
      };
      timeOffCollection.insert(entry);
      const payload = buildLocalSyncPushPayload();
      expect(payload.time_off_entries).toHaveLength(1);
      expect(payload.time_off_entries[0]).toMatchObject({
        entry_kind: "range",
        start_date: "2026-12-24",
        end_date: "2026-12-26",
      });
    });

    it("includes weekly entries", () => {
      const entry: TimeOffWeeklyEntry = {
        id: "e3",
        entryKind: "weekly",
        weekday: 1,
        entryType: "vacation",
        entryFlag: "full_day",
        note: "Every Monday",
      };
      timeOffCollection.insert(entry);
      const payload = buildLocalSyncPushPayload();
      expect(payload.time_off_entries).toHaveLength(1);
      expect(payload.time_off_entries[0]).toMatchObject({
        entry_kind: "weekly",
        weekday: 1,
        note: "Every Monday",
      });
    });

    it("returns empty time_off_entries when no .hday data", () => {
      const payload = buildLocalSyncPushPayload();
      expect(payload.time_off_entries).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Preferences sync helpers
  // ---------------------------------------------------------------------------

  describe("fetchPreferences", () => {
    it("returns parsed preferences on success", async () => {
      const prefs = {
        user_id: 1,
        data: { theme: "dark" },
        client_updated_at: "2026-01-01T00:00:00Z",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      };
      mockFetch.mockResolvedValue({ ok: true, json: async () => prefs });
      const result = await fetchPreferences(mockFetch);
      expect(result).toEqual(prefs);
      expect(mockFetch).toHaveBeenCalledWith("/api/preferences");
    });

    it("returns null when response is not ok", async () => {
      mockFetch.mockResolvedValue({ ok: false });
      expect(await fetchPreferences(mockFetch)).toBeNull();
    });

    it("returns null when server returns JSON null", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => null });
      expect(await fetchPreferences(mockFetch)).toBeNull();
    });

    it("returns null when fetch throws", async () => {
      mockFetch.mockRejectedValue(new Error("network error"));
      expect(await fetchPreferences(mockFetch)).toBeNull();
    });
  });

  describe("pushPreferences", () => {
    it("PUTs the preferences payload and returns true on success", async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const result = await pushPreferences(mockFetch, { theme: "dark" }, "2026-01-01T00:00:00Z");
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/preferences",
        expect.objectContaining({ method: "PUT" }),
      );
    });

    it("returns false when response is not ok", async () => {
      mockFetch.mockResolvedValue({ ok: false });
      expect(await pushPreferences(mockFetch, {}, "2026-01-01T00:00:00Z")).toBe(false);
    });

    it("returns false when fetch throws", async () => {
      mockFetch.mockRejectedValue(new Error("network error"));
      expect(await pushPreferences(mockFetch, {}, "2026-01-01T00:00:00Z")).toBe(false);
    });
  });

  describe("buildLocalPreferencesPayload", () => {
    it("returns null when worktime_user_state is not in localStorage", () => {
      expect(buildLocalPreferencesPayload()).toBeNull();
    });

    it("returns the parsed user state when present", () => {
      const userState = { hasCompletedOnboarding: true, scheduleType: "9-5" };
      localStorage.setItem(USER_STATE_STORAGE_KEY, JSON.stringify(userState));
      const result = buildLocalPreferencesPayload();
      expect(result).not.toBeNull();
      expect(result?.data).toEqual(userState);
      expect(result?.clientUpdatedAt).toBeTruthy();
    });

    it("returns null for invalid JSON in localStorage", () => {
      localStorage.setItem(USER_STATE_STORAGE_KEY, "not-valid-json{");
      expect(buildLocalPreferencesPayload()).toBeNull();
    });

    it("excludes lastUsed from the payload — it's per-device UI state, not a synced preference", () => {
      const userState = {
        hasCompletedOnboarding: true,
        scheduleType: "9-5",
        lastUsed: { activeTab: "gantt", scheduleView: "transfer" },
      };
      localStorage.setItem(USER_STATE_STORAGE_KEY, JSON.stringify(userState));
      const result = buildLocalPreferencesPayload();
      expect(result?.data).toEqual({ hasCompletedOnboarding: true, scheduleType: "9-5" });
      expect(result?.data).not.toHaveProperty("lastUsed");
    });

    it("excludes device-local settings fields (theme, notification lead time/quiet hours) from the payload", () => {
      const userState = {
        hasCompletedOnboarding: true,
        settings: {
          timeFormat: "24h",
          theme: "dark",
          notifications: "on",
          notificationLeadTimeMinutes: 60,
          notificationQuietHoursStart: 22,
          notificationQuietHoursEnd: 7,
          enableTimeOff: true,
        },
      };
      localStorage.setItem(USER_STATE_STORAGE_KEY, JSON.stringify(userState));
      const result = buildLocalPreferencesPayload();
      expect(result?.data.settings).toEqual({ timeFormat: "24h", enableTimeOff: true });
    });
  });

  describe("applyPreferencesPull", () => {
    it("writes pulled preferences data to worktime_user_state", () => {
      const data = { hasCompletedOnboarding: true, scheduleType: "9-5" };
      applyPreferencesPull(data);
      const stored = localStorage.getItem(USER_STATE_STORAGE_KEY);
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored!)).toEqual(data);
    });

    it("overwrites existing worktime_user_state", () => {
      localStorage.setItem(
        USER_STATE_STORAGE_KEY,
        JSON.stringify({ hasCompletedOnboarding: false }),
      );
      applyPreferencesPull({ hasCompletedOnboarding: true });
      const stored = JSON.parse(localStorage.getItem(USER_STATE_STORAGE_KEY)!);
      expect(stored.hasCompletedOnboarding).toBe(true);
    });

    it("preserves this device's local lastUsed instead of taking the pulled value", () => {
      localStorage.setItem(
        USER_STATE_STORAGE_KEY,
        JSON.stringify({
          hasCompletedOnboarding: false,
          lastUsed: { activeTab: "timetracking", scheduleView: "schedule" },
        }),
      );
      // Simulates a legacy server record pushed before lastUsed was excluded.
      applyPreferencesPull({
        hasCompletedOnboarding: true,
        lastUsed: { activeTab: "calendar", scheduleView: "transfer" },
      });
      const stored = JSON.parse(localStorage.getItem(USER_STATE_STORAGE_KEY)!);
      expect(stored.hasCompletedOnboarding).toBe(true);
      expect(stored.lastUsed).toEqual({ activeTab: "timetracking", scheduleView: "schedule" });
    });

    it("omits lastUsed entirely when there is no local state to preserve it from", () => {
      applyPreferencesPull({
        hasCompletedOnboarding: true,
        lastUsed: { activeTab: "calendar" },
      });
      const stored = JSON.parse(localStorage.getItem(USER_STATE_STORAGE_KEY)!);
      expect(stored).not.toHaveProperty("lastUsed");
    });

    it("preserves this device's local theme and notification settings instead of taking the pulled values", () => {
      localStorage.setItem(
        USER_STATE_STORAGE_KEY,
        JSON.stringify({
          hasCompletedOnboarding: false,
          settings: {
            timeFormat: "24h",
            theme: "dark",
            notifications: "on",
            notificationLeadTimeMinutes: 60,
            notificationQuietHoursStart: 22,
            notificationQuietHoursEnd: 7,
            enableTimeOff: false,
          },
        }),
      );
      // Simulates a legacy server record pushed before these fields were excluded.
      applyPreferencesPull({
        hasCompletedOnboarding: true,
        settings: {
          timeFormat: "12h",
          theme: "light",
          notifications: "off",
          notificationLeadTimeMinutes: 15,
          notificationQuietHoursStart: null,
          notificationQuietHoursEnd: null,
          enableTimeOff: true,
        },
      });
      const stored = JSON.parse(localStorage.getItem(USER_STATE_STORAGE_KEY)!);
      expect(stored.hasCompletedOnboarding).toBe(true);
      expect(stored.settings).toEqual({
        // Synced from the pull.
        timeFormat: "12h",
        enableTimeOff: true,
        // Preserved from this device's local state.
        theme: "dark",
        notifications: "on",
        notificationLeadTimeMinutes: 60,
        notificationQuietHoursStart: 22,
        notificationQuietHoursEnd: 7,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Sync cursor helpers
  // ---------------------------------------------------------------------------

  describe("hasSyncCursor / storeSyncCursor", () => {
    it("returns false when no cursor is stored for the user", () => {
      expect(hasSyncCursor("user-42")).toBe(false);
    });

    it("returns true after storeSyncCursor is called", () => {
      storeSyncCursor("user-42", "2026-03-01T00:00:00.000Z");
      expect(hasSyncCursor("user-42")).toBe(true);
    });

    it("stores the cursor under the per-user key", () => {
      storeSyncCursor("user-42", "2026-03-15T12:00:00.000Z");
      expect(localStorage.getItem(getSyncCursorKey("user-42"))).toBe("2026-03-15T12:00:00.000Z");
    });

    it("isolates cursors between different users", () => {
      storeSyncCursor("user-A", "2026-01-01T00:00:00.000Z");
      expect(hasSyncCursor("user-B")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Outbox management helpers
  // ---------------------------------------------------------------------------

  const emptyPayload = () => ({
    labels: [] as never[],
    tasks: [] as never[],
    templates: [] as never[],
    work_locations: [] as never[],
    time_off_entries: [] as never[],
    gantt_tasks: [] as never[],
  });

  describe("appendToSyncOutbox / getSyncOutboxSize / clearSyncOutbox", () => {
    it("starts with size 0 when no outbox key exists", () => {
      expect(getSyncOutboxSize("user-1")).toBe(0);
    });

    it("increments size for each appended payload", () => {
      appendToSyncOutbox("user-1", emptyPayload());
      expect(getSyncOutboxSize("user-1")).toBe(1);
      appendToSyncOutbox("user-1", emptyPayload());
      expect(getSyncOutboxSize("user-1")).toBe(2);
    });

    it("persists payloads under the per-user outbox key", () => {
      const payload = { ...emptyPayload(), tasks: [{ id: "t1" }] };
      appendToSyncOutbox("user-1", payload as never);
      const raw = localStorage.getItem(getSyncOutboxKey("user-1"));
      expect(raw).not.toBeNull();
      const stored = JSON.parse(raw!);
      expect(stored).toHaveLength(1);
      expect(stored[0]!.tasks[0]!.id).toBe("t1");
    });

    it("clearSyncOutbox removes the outbox key", () => {
      appendToSyncOutbox("user-1", emptyPayload());
      clearSyncOutbox("user-1");
      expect(getSyncOutboxSize("user-1")).toBe(0);
      expect(localStorage.getItem(getSyncOutboxKey("user-1"))).toBeNull();
    });

    it("isolates outboxes between different users", () => {
      appendToSyncOutbox("user-A", emptyPayload());
      expect(getSyncOutboxSize("user-B")).toBe(0);
    });
  });

  describe("appendToPendingSyncOutbox / drainPendingSyncOutbox", () => {
    it("holds writes made before a user is known, under no user's key", () => {
      appendToPendingSyncOutbox({ ...emptyPayload(), tasks: [{ id: "t1" }] } as never);

      expect(getSyncOutboxSize("user-1")).toBe(0);
      const raw = localStorage.getItem(SYNC_PENDING_OUTBOX_KEY);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw!)).toHaveLength(1);
    });

    it("moves pending writes into the now-known user's real outbox and clears the pending queue", () => {
      appendToPendingSyncOutbox({ ...emptyPayload(), tasks: [{ id: "t1" }] } as never);
      appendToPendingSyncOutbox({ ...emptyPayload(), tasks: [{ id: "t2" }] } as never);

      drainPendingSyncOutbox("user-1");

      expect(getSyncOutboxSize("user-1")).toBe(2);
      expect(localStorage.getItem(SYNC_PENDING_OUTBOX_KEY)).toBeNull();
    });

    it("is a no-op when nothing is pending", () => {
      drainPendingSyncOutbox("user-1");
      expect(getSyncOutboxSize("user-1")).toBe(0);
    });

    it("caps growth for a device that never signs in, keeping the most recent entries", () => {
      for (let i = 0; i < 205; i++) {
        appendToPendingSyncOutbox({ ...emptyPayload(), tasks: [{ id: `t${i}` }] } as never);
      }

      const raw = localStorage.getItem(SYNC_PENDING_OUTBOX_KEY);
      const stored = JSON.parse(raw!) as { tasks: { id: string }[] }[];
      expect(stored).toHaveLength(200);
      expect(stored[0]!.tasks[0]!.id).toBe("t5");
      expect(stored.at(-1)!.tasks[0]!.id).toBe("t204");
    });
  });

  describe("dequeueAndMergeSyncOutbox", () => {
    it("returns null when the outbox is empty", () => {
      expect(dequeueAndMergeSyncOutbox("user-1")).toBeNull();
    });

    it("merges multiple payloads into a single SyncPushPayload", () => {
      appendToSyncOutbox("user-1", {
        ...emptyPayload(),
        tasks: [{ id: "task-A" }],
      } as never);
      appendToSyncOutbox("user-1", {
        ...emptyPayload(),
        tasks: [{ id: "task-B" }],
      } as never);

      const result = dequeueAndMergeSyncOutbox("user-1");
      expect(result).not.toBeNull();
      expect(result!.merged.tasks).toHaveLength(2);
      expect(result!.merged.tasks.map((t) => t.id)).toEqual(
        expect.arrayContaining(["task-A", "task-B"]),
      );
    });

    it("does NOT clear the outbox before commit() is called", () => {
      appendToSyncOutbox("user-1", emptyPayload());
      const result = dequeueAndMergeSyncOutbox("user-1");
      expect(result).not.toBeNull();
      // Outbox is still intact — commit not yet called
      expect(getSyncOutboxSize("user-1")).toBe(1);
    });

    it("clears the outbox after commit() is called", () => {
      appendToSyncOutbox("user-1", emptyPayload());
      const result = dequeueAndMergeSyncOutbox("user-1");
      expect(result).not.toBeNull();
      result!.commit();
      expect(getSyncOutboxSize("user-1")).toBe(0);
    });

    it("merges labels, templates, and work_locations in addition to tasks", () => {
      appendToSyncOutbox("user-1", {
        ...emptyPayload(),
        labels: [{ id: "lbl-1" }],
        work_locations: [{ date: "2026-01-01" }],
      } as never);
      appendToSyncOutbox("user-1", {
        ...emptyPayload(),
        templates: [{ id: "tmpl-1" }],
      } as never);

      const result = dequeueAndMergeSyncOutbox("user-1");
      expect(result).not.toBeNull();
      expect(result!.merged.labels).toHaveLength(1);
      expect(result!.merged.work_locations).toHaveLength(1);
      expect(result!.merged.templates).toHaveLength(1);
    });

    it("coalesces duplicate record ids keeping the newest entry", () => {
      appendToSyncOutbox("user-1", {
        ...emptyPayload(),
        tasks: [{ id: "task-A", text: "first edit" }],
        work_locations: [{ date: "2026-01-01", country_code: "BE" }],
      } as never);
      appendToSyncOutbox("user-1", {
        ...emptyPayload(),
        tasks: [{ id: "task-A", text: "second edit" }, { id: "task-B" }],
        work_locations: [{ date: "2026-01-01", country_code: "NL" }],
      } as never);

      const result = dequeueAndMergeSyncOutbox("user-1");
      expect(result).not.toBeNull();
      // task-A appears once, with the newest payload winning.
      expect(result!.merged.tasks).toHaveLength(2);
      const taskA = result!.merged.tasks.find((t) => t.id === "task-A");
      expect((taskA as { text?: string }).text).toBe("second edit");
      // Work locations coalesce by date.
      expect(result!.merged.work_locations).toHaveLength(1);
      expect((result!.merged.work_locations[0] as { country_code?: string }).country_code).toBe(
        "NL",
      );
    });

    it("commit() only removes the dequeued entries, preserving concurrent appends", () => {
      // Simulates the race from #1098: a flush snapshots the outbox and starts
      // its network push, and a write lands in the outbox (e.g. because its own
      // immediate push failed) before that flush's commit() runs.
      appendToSyncOutbox("user-1", {
        ...emptyPayload(),
        tasks: [{ id: "task-A" }],
      } as never);

      const result = dequeueAndMergeSyncOutbox("user-1");
      expect(result).not.toBeNull();

      // A concurrent write appends while the dequeued batch's push is in flight.
      appendToSyncOutbox("user-1", {
        ...emptyPayload(),
        tasks: [{ id: "task-B" }],
      } as never);

      result!.commit();

      // Only the dequeued entry (task-A) is removed; task-B survives.
      expect(getSyncOutboxSize("user-1")).toBe(1);
      const remaining = dequeueAndMergeSyncOutbox("user-1");
      expect(remaining!.merged.tasks.map((t) => t.id)).toEqual(["task-B"]);
    });

    it("a stale commit from an overlapping flush does not drop a newer entry (cross-tab race)", () => {
      // Two tabs share one outbox key with no cross-tab coordination
      // (isFlushingRef is in-memory, per tab). Both dequeue the same
      // snapshot; tab A commits (removing it), a new entry is appended,
      // then tab B's commit fires. A position-based commit (slice by
      // count) would misinterpret its stale count against the new array
      // and delete the newly queued entry. Matching by content instead
      // means B's commit finds none of its own entries still present and
      // removes nothing.
      appendToSyncOutbox("user-1", {
        ...emptyPayload(),
        tasks: [{ id: "task-old" }],
      } as never);

      const tabA = dequeueAndMergeSyncOutbox("user-1");
      const tabB = dequeueAndMergeSyncOutbox("user-1");
      expect(tabA).not.toBeNull();
      expect(tabB).not.toBeNull();

      tabA!.commit();
      expect(getSyncOutboxSize("user-1")).toBe(0);

      appendToSyncOutbox("user-1", {
        ...emptyPayload(),
        tasks: [{ id: "task-new" }],
      } as never);

      tabB!.commit();

      expect(getSyncOutboxSize("user-1")).toBe(1);
      const remaining = dequeueAndMergeSyncOutbox("user-1");
      expect(remaining!.merged.tasks.map((t) => t.id)).toEqual(["task-new"]);
    });

    it("propagates allow_bulk_delete when any queued entry opted in, and recomputes declared_delete_total", () => {
      // A regular optimistic mutation queued alongside a failed "keep local"
      // replace (see buildKeepLocalReplacePayload) — the merged batch must
      // still carry allow_bulk_delete or the server's bulk-delete guard
      // rejects the replace's deletes on retry.
      appendToSyncOutbox("user-1", {
        ...emptyPayload(),
        tasks: [{ id: "task-A", action: "create" }],
      } as never);
      appendToSyncOutbox("user-1", {
        ...emptyPayload(),
        allow_bulk_delete: true,
        labels: [
          { id: "lbl-1", action: "create" },
          { id: "lbl-2", action: "delete" },
        ],
      } as never);

      const result = dequeueAndMergeSyncOutbox("user-1");
      expect(result).not.toBeNull();
      expect(result!.merged.allow_bulk_delete).toBe(true);
      expect(result!.merged.declared_delete_total).toBe(1);
    });

    it("does not set allow_bulk_delete when no queued entry opted in", () => {
      appendToSyncOutbox("user-1", {
        ...emptyPayload(),
        tasks: [{ id: "task-A", action: "delete" }],
      } as never);

      const result = dequeueAndMergeSyncOutbox("user-1");
      expect(result).not.toBeNull();
      expect(result!.merged.allow_bulk_delete).toBeUndefined();
      expect(result!.merged.declared_delete_total).toBeUndefined();
    });

    it("skips corrupted/non-object outbox entries without throwing", () => {
      appendToSyncOutbox("user-1", emptyPayload());
      // Corrupt the outbox by injecting a bad entry directly.
      const key = getSyncOutboxKey("user-1");
      const existing = JSON.parse(localStorage.getItem(key) ?? "[]");
      // Push a primitive and a plain object missing all arrays.
      localStorage.setItem(key, JSON.stringify([...existing, null, {}, 42]));

      const result = dequeueAndMergeSyncOutbox("user-1");
      expect(result).not.toBeNull();
      // The valid entry contributes 0 items; null/42/object-without-arrays are skipped.
      expect(result!.merged.tasks).toHaveLength(0);
      expect(result!.merged.labels).toHaveLength(0);
    });
  });
});
