import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applySyncPullResponse,
  applyIncrementalSyncPullResponse,
  applyPreferencesPull,
  appendToSyncOutbox,
  bumpClientTimestamps,
  buildKeepLocalReplacePayload,
  buildLocalPreferencesPayload,
  buildLocalSyncPushPayload,
  clearSyncOutbox,
  countPushConflicts,
  dequeueAndMergeSyncOutbox,
  extractConflictedItems,
  fetchPreferences,
  fetchSyncStatus,
  getSyncOutboxSize,
  hasSyncCursor,
  maxConflictServerTimestamp,
  pullSyncData,
  pushPreferences,
  pushSyncPayload,
  storeSyncCursor,
  syncStatusHasData,
  timeOffEntriesToSyncItems,
} from "@/utils/syncClient";
import {
  GANTT_STORAGE_KEY,
  getSyncCursorKey,
  getSyncOutboxKey,
  TIME_OFF_ENTRIES_STORAGE_KEY,
  TIME_TRACKING_STORAGE_KEYS,
  USER_STATE_STORAGE_KEY,
  WORK_LOCATIONS_STORAGE_PREFIX,
} from "@/constants/storageKeys";
import { buildTimeOffEntryForRange, createWeeklyTimeOffEntry } from "@/lib/timeOff/codecs";

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
            tasks: [
              { id: "t1", status: "conflict", conflict_reason: "server is newer" },
            ],
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
        { date: "2026-01-05", action: "update" as const, client_updated_at: "2026-01-01T00:00:00.000Z", country_code: "NL" },
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
      expect(result.labels[0].id).toBe("l2");
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
      expect(result.work_locations[0].date).toBe("2026-01-05");
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
        work_locations: [{ date: "2026-01-05", action: "update" as const, client_updated_at: before, country_code: "NL" }],
        time_off_entries: [{ id: "toe1", action: "update" as const, client_updated_at: before }],
        gantt_tasks: [{ id: "gt1", action: "update" as const, client_updated_at: before }],
      };

      const now = new Date("2026-06-01T12:00:00.000Z").toISOString();
      vi.setSystemTime(new Date(now));

      const result = bumpClientTimestamps(payload);

      expect(result.labels[0].client_updated_at).toBe(now);
      expect(result.tasks[0].client_updated_at).toBe(now);
      expect(result.templates[0].client_updated_at).toBe(now);
      expect(result.work_locations[0].client_updated_at).toBe(now);
      expect(result.time_off_entries[0].client_updated_at).toBe(now);
      expect(result.gantt_tasks[0].client_updated_at).toBe(now);

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

      expect(payload.labels[0].client_updated_at).toBe(before);
    });

    it("uses local clock when serverTimestampFloor is not provided", () => {
      const now = "2026-06-01T12:00:00.000Z";
      vi.setSystemTime(new Date(now));
      const payload = {
        labels: [{ id: "l1", action: "update" as const, client_updated_at: "2026-01-01T00:00:00.000Z" }],
        tasks: [],
        templates: [],
        work_locations: [],
        time_off_entries: [],
        gantt_tasks: [],
      };
      const result = bumpClientTimestamps(payload);
      expect(result.labels[0].client_updated_at).toBe(now);
      vi.useRealTimers();
    });

    it("uses serverTimestampFloor when it is ahead of the local clock", () => {
      // Local clock is set to a time behind the server timestamp.
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      const serverFloor = "2026-06-01T12:00:00.000Z";
      const payload = {
        labels: [{ id: "l1", action: "update" as const, client_updated_at: "2026-01-01T00:00:00.000Z" }],
        tasks: [],
        templates: [],
        work_locations: [],
        time_off_entries: [],
        gantt_tasks: [],
      };
      const result = bumpClientTimestamps(payload, serverFloor);
      expect(result.labels[0].client_updated_at).toBe(serverFloor);
      vi.useRealTimers();
    });

    it("uses local clock when serverTimestampFloor is in the past", () => {
      const now = "2026-06-01T12:00:00.000Z";
      vi.setSystemTime(new Date(now));
      const serverFloor = "2026-01-01T00:00:00.000Z";
      const payload = {
        labels: [{ id: "l1", action: "update" as const, client_updated_at: "2025-01-01T00:00:00.000Z" }],
        tasks: [],
        templates: [],
        work_locations: [],
        time_off_entries: [],
        gantt_tasks: [],
      };
      const result = bumpClientTimestamps(payload, serverFloor);
      expect(result.labels[0].client_updated_at).toBe(now);
      vi.useRealTimers();
    });

    it("falls back to local clock when serverTimestampFloor is an invalid string", () => {
      const now = "2026-06-01T12:00:00.000Z";
      vi.setSystemTime(new Date(now));
      const payload = {
        labels: [{ id: "l1", action: "update" as const, client_updated_at: "2026-01-01T00:00:00.000Z" }],
        tasks: [],
        templates: [],
        work_locations: [],
        time_off_entries: [],
        gantt_tasks: [],
      };
      const result = bumpClientTimestamps(payload, "not-a-date");
      expect(result.labels[0].client_updated_at).toBe(now);
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

      const payload = { labels: [], tasks: [], templates: [], work_locations: [] };
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
      });
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
  });

  // ---------------------------------------------------------------------------
  // buildLocalSyncPushPayload
  // ---------------------------------------------------------------------------

  describe("buildLocalSyncPushPayload", () => {
    it("returns empty arrays when localStorage is empty", () => {
      const payload = buildLocalSyncPushPayload();
      expect(payload.labels).toHaveLength(0);
      expect(payload.tasks).toHaveLength(0);
      expect(payload.templates).toHaveLength(0);
      expect(payload.work_locations).toHaveLength(0);
    });

    it("converts labels to sync items with action=create", () => {
      localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.labels,
        JSON.stringify([{ id: "label-1", name: "Work", color: "#FF0000" }]),
      );

      const payload = buildLocalSyncPushPayload();
      expect(payload.labels).toHaveLength(1);
      expect(payload.labels[0]).toMatchObject({
        id: "label-1",
        action: "create",
        name: "Work",
        color: "#FF0000",
      });
      expect(typeof payload.labels[0].client_updated_at).toBe("string");
    });

    it("converts tasks to sync items with UTC start_time", () => {
      localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.tasks,
        JSON.stringify([
          {
            id: "task-1",
            text: "Hello",
            label: "label-1",
            startTime: "2026-01-01T09:00",
            stopTime: "2026-01-01T17:00",
            includesBreak: true,
          },
        ]),
      );

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
      expect(payload.tasks[0].start_time).toMatch(/Z$/);
      expect(payload.tasks[0].stop_time).toMatch(/Z$/);
    });

    it("handles tasks with no stopTime", () => {
      localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.tasks,
        JSON.stringify([{ id: "task-2", text: "Open", label: "", startTime: "2026-01-01T09:00" }]),
      );

      const payload = buildLocalSyncPushPayload();
      expect(payload.tasks[0].stop_time).toBeNull();
    });

    it("converts templates with HH:mm:ss time format", () => {
      localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.templates,
        JSON.stringify([
          { id: "tmpl-1", text: "Standup", label: "label-1", start: "09:00", stop: "09:15" },
        ]),
      );

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
      localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.labels,
        JSON.stringify([
          { id: "lbl-good", name: "Good", color: "#FF0000" },
          { id: "lbl-no-color", name: "Bad", color: null },
          { id: "lbl-num-color", name: "Numeric", color: 123 },
        ]),
      );

      const payload = buildLocalSyncPushPayload();
      expect(payload.labels).toHaveLength(1);
      expect(payload.labels[0].id).toBe("lbl-good");
    });

    it("excludes templates with missing required fields", () => {
      localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.templates,
        JSON.stringify([
          { id: "tmpl-good", text: "Valid", label: "", start: "09:00", stop: "09:15" },
          { id: "tmpl-no-text", text: "", label: "", start: "09:00", stop: "09:15" },
          { id: "tmpl-bad-start", text: "Bad start", label: "", start: "9:00", stop: "09:15" },
          { id: "tmpl-no-stop", text: "No stop", label: "", start: "09:00", stop: "" },
        ]),
      );

      const payload = buildLocalSyncPushPayload();
      expect(payload.templates).toHaveLength(1);
      expect(payload.templates[0].id).toBe("tmpl-good");
    });

    it("excludes soft-deleted tasks from the payload", () => {
      localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.tasks,
        JSON.stringify([
          { id: "task-live", text: "Live", label: "", startTime: "2026-01-01T09:00" },
          {
            id: "task-deleted",
            text: "Gone",
            label: "",
            startTime: "2026-01-01T10:00",
            deleted_at: "2026-01-02T00:00:00.000Z",
          },
        ]),
      );

      const payload = buildLocalSyncPushPayload();
      expect(payload.tasks).toHaveLength(1);
      expect(payload.tasks[0].id).toBe("task-live");
    });

    it("converts work locations from per-year localStorage keys", () => {
      localStorage.setItem(
        `${WORK_LOCATIONS_STORAGE_PREFIX}2026`,
        JSON.stringify({
          "2026-01-05": { location: "home", countryCode: "NL" },
          "2026-01-06": { location: "office", countryCode: "DE", label: "Berlin" },
        }),
      );

      const payload = buildLocalSyncPushPayload();
      expect(payload.work_locations).toHaveLength(2);

      const nl = payload.work_locations.find((wl) => wl.date === "2026-01-05");
      expect(nl).toMatchObject({ action: "create", country_code: "NL", label: null });

      const de = payload.work_locations.find((wl) => wl.date === "2026-01-06");
      expect(de).toMatchObject({ action: "create", country_code: "DE", label: "Berlin" });
    });
  });

  // ---------------------------------------------------------------------------
  // applySyncPullResponse
  // ---------------------------------------------------------------------------

  describe("applySyncPullResponse", () => {
    const makeBaseResponse = () => ({
      labels: [],
      tasks: [],
      templates: [],
      work_locations: [],
      time_off_entries: [],
      gantt_tasks: [],
      server_timestamp: "2026-01-01T00:00:00Z",
    });

    it("stores labels in localStorage", () => {
      applySyncPullResponse({
        ...makeBaseResponse(),
        labels: [
          {
            id: "lbl-1",
            user_id: 1,
            name: "Work",
            color: "#AABBCC",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            deleted_at: null,
          },
        ],
      });

      const stored = JSON.parse(localStorage.getItem(TIME_TRACKING_STORAGE_KEYS.labels)!);
      expect(stored).toHaveLength(1);
      expect(stored[0]).toEqual({ id: "lbl-1", name: "Work", color: "#AABBCC" });
    });

    it("excludes soft-deleted labels", () => {
      applySyncPullResponse({
        ...makeBaseResponse(),
        labels: [
          {
            id: "lbl-del",
            user_id: 1,
            name: "Gone",
            color: "#000000",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            deleted_at: "2026-01-02T00:00:00Z",
          },
        ],
      });

      const stored = JSON.parse(localStorage.getItem(TIME_TRACKING_STORAGE_KEYS.labels)!);
      expect(stored).toHaveLength(0);
    });

    it("stores templates with HH:mm times", () => {
      applySyncPullResponse({
        ...makeBaseResponse(),
        templates: [
          {
            id: "tmpl-1",
            user_id: 1,
            label_id: "lbl-1",
            text: "Standup",
            start_time: "09:00:00",
            stop_time: "09:15:00",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            deleted_at: null,
          },
        ],
      });

      const stored = JSON.parse(localStorage.getItem(TIME_TRACKING_STORAGE_KEYS.templates)!);
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({
        id: "tmpl-1",
        text: "Standup",
        label: "lbl-1",
        start: "09:00",
        stop: "09:15",
      });
    });

    it("stores work locations grouped by year", () => {
      applySyncPullResponse({
        ...makeBaseResponse(),
        work_locations: [
          {
            id: 1,
            user_id: 1,
            date: "2026-01-05",
            country_code: "NL",
            label: null,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            deleted_at: null,
          },
          {
            id: 2,
            user_id: 1,
            date: "2026-01-06",
            country_code: "DE",
            label: "Berlin",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            deleted_at: null,
          },
        ],
      });

      const stored = JSON.parse(localStorage.getItem(`${WORK_LOCATIONS_STORAGE_PREFIX}2026`)!);
      expect(stored["2026-01-05"]).toMatchObject({ countryCode: "NL" });
      expect(stored["2026-01-06"]).toMatchObject({ countryCode: "DE", label: "Berlin" });
    });

    it("excludes soft-deleted work locations", () => {
      applySyncPullResponse({
        ...makeBaseResponse(),
        work_locations: [
          {
            id: 3,
            user_id: 1,
            date: "2026-01-07",
            country_code: "FR",
            label: null,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            deleted_at: "2026-01-03T00:00:00Z",
          },
        ],
      });

      expect(localStorage.getItem(`${WORK_LOCATIONS_STORAGE_PREFIX}2026`)).toBeNull();
    });

    it("stores gantt tasks in localStorage", () => {
      applySyncPullResponse({
        ...makeBaseResponse(),
        gantt_tasks: [
          {
            id: "gantt-1",
            user_id: 1,
            name: "Design phase",
            start_date: "2026-03-01",
            end_date: "2026-03-15",
            progress: 50,
            dependencies: null,
            notes: null,
            client_updated_at: "2026-01-01T00:00:00Z",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            deleted_at: null,
          },
        ],
      });

      const stored = JSON.parse(localStorage.getItem(GANTT_STORAGE_KEY)!);
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ id: "gantt-1", name: "Design phase", start: "2026-03-01", end: "2026-03-15", progress: 50 });
    });

    it("excludes soft-deleted gantt tasks", () => {
      applySyncPullResponse({
        ...makeBaseResponse(),
        gantt_tasks: [
          {
            id: "gantt-del",
            user_id: 1,
            name: "Deleted task",
            start_date: "2026-03-01",
            end_date: "2026-03-10",
            progress: 0,
            dependencies: null,
            notes: null,
            client_updated_at: "2026-01-01T00:00:00Z",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-02T00:00:00Z",
            deleted_at: "2026-01-02T00:00:00Z",
          },
        ],
      });

      const stored = JSON.parse(localStorage.getItem(GANTT_STORAGE_KEY)!);
      expect(stored).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // buildKeepLocalReplacePayload
  // ---------------------------------------------------------------------------

  describe("buildKeepLocalReplacePayload", () => {
    const makeEmptyPullResponse = () => ({
      labels: [] as never[],
      tasks: [] as never[],
      templates: [] as never[],
      work_locations: [] as never[],
      time_off_entries: [] as never[],
      gantt_tasks: [] as never[],
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
      localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.labels,
        JSON.stringify([{ id: "local-lbl", name: "Local", color: "#FFFFFF" }]),
      );
      const localPayload = buildLocalSyncPushPayload();
      const result = buildKeepLocalReplacePayload(localPayload, makeEmptyPullResponse());

      expect(result.labels.find((l) => l.id === "local-lbl")).toBeDefined();
      expect(result.labels.find((l) => l.id === "local-lbl")?.action).toBe("create");
    });

    it("adds delete entries for server-only labels not present locally", () => {
      localStorage.clear(); // no local labels
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
      const localPayload = buildLocalSyncPushPayload();
      const serverData = {
        ...makeEmptyPullResponse(),
        tasks: [makeServerTask("server-task")],
      };

      const result = buildKeepLocalReplacePayload(localPayload, serverData);
      expect(result.tasks.find((t) => t.id === "server-task")?.action).toBe("delete");
    });

    it("does not re-delete already soft-deleted server tasks", () => {
      localStorage.clear();
      const localPayload = buildLocalSyncPushPayload();
      const serverData = {
        ...makeEmptyPullResponse(),
        tasks: [makeServerTask("deleted-task", "2026-01-02T00:00:00Z")],
      };

      const result = buildKeepLocalReplacePayload(localPayload, serverData);
      expect(result.tasks.find((t) => t.id === "deleted-task")).toBeUndefined();
    });

    it("adds delete entries for server-only templates", () => {
      localStorage.clear();
      const localPayload = buildLocalSyncPushPayload();
      const serverData = {
        ...makeEmptyPullResponse(),
        templates: [makeServerTemplate("server-tmpl")],
      };

      const result = buildKeepLocalReplacePayload(localPayload, serverData);
      expect(result.templates.find((t) => t.id === "server-tmpl")?.action).toBe("delete");
    });

    it("does not delete server labels that also exist locally", () => {
      localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.labels,
        JSON.stringify([{ id: "shared-lbl", name: "Shared", color: "#FF0000" }]),
      );
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
      const localPayload = buildLocalSyncPushPayload();
      const serverData = {
        ...makeEmptyPullResponse(),
        work_locations: [makeServerWorkLocation("2026-01-10", "2026-01-09T00:00:00Z")],
      };

      const result = buildKeepLocalReplacePayload(localPayload, serverData);
      expect(result.work_locations.find((wl) => wl.date === "2026-01-10")).toBeUndefined();
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
          note: null,
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
          note: null,
          entryType: "business",
          entryFlag: "full_day",
        }),
        buildTimeOffEntryForRange({
          start: "2026-01-02",
          end: "2026-01-02",
          note: null,
          entryType: "ill",
          entryFlag: "full_day",
        }),
        buildTimeOffEntryForRange({
          start: "2026-01-03",
          end: "2026-01-03",
          note: null,
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
            note: null,
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
          note: null,
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
            note: null,
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
      const entry = {
        id: "e1",
        entryKind: "date",
        date: "2026-07-14",
        entryType: "vacation",
        entryFlag: "full_day",
        note: "Vacation",
      };
      localStorage.setItem(TIME_OFF_ENTRIES_STORAGE_KEY, JSON.stringify([entry]));
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
      const entry = {
        id: "e2",
        entryKind: "range",
        start: "2026-12-24",
        end: "2026-12-26",
        entryType: "vacation",
        entryFlag: "full_day",
        note: null,
      };
      localStorage.setItem(TIME_OFF_ENTRIES_STORAGE_KEY, JSON.stringify([entry]));
      const payload = buildLocalSyncPushPayload();
      expect(payload.time_off_entries).toHaveLength(1);
      expect(payload.time_off_entries[0]).toMatchObject({
        entry_kind: "range",
        start_date: "2026-12-24",
        end_date: "2026-12-26",
      });
    });

    it("includes weekly entries", () => {
      const entry = {
        id: "e3",
        entryKind: "weekly",
        weekday: 1,
        entryType: "vacation",
        entryFlag: "full_day",
        note: "Every Monday",
      };
      localStorage.setItem(TIME_OFF_ENTRIES_STORAGE_KEY, JSON.stringify([entry]));
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
  // time-off entries in applySyncPullResponse
  // ---------------------------------------------------------------------------

  describe("applySyncPullResponse — time_off_entries", () => {
    const makeBaseResponse = () => ({
      labels: [],
      tasks: [],
      templates: [],
      work_locations: [],
      time_off_entries: [],
      gantt_tasks: [],
      server_timestamp: "2026-01-01T00:00:00Z",
    });

    const makeTimeOffEntry = (
      entry_kind: "date" | "range" | "weekly",
      shape: { date?: string; start_date?: string; end_date?: string; weekday?: number },
      entry_type = "vacation",
      entry_flag: string = "full_day",
      note: string | null = null,
      deleted_at: string | null = null,
    ) => ({
      id: 1,
      entry_id: `entry-${Math.random()}`,
      user_id: 1,
      entry_kind,
      date: shape.date ?? null,
      start_date: shape.start_date ?? null,
      end_date: shape.end_date ?? null,
      weekday: shape.weekday ?? null,
      entry_type,
      entry_flag,
      note,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      deleted_at,
    });

    it("writes canonical time-off entries for pulled sync data", () => {
      applySyncPullResponse({
        ...makeBaseResponse(),
        time_off_entries: [
          makeTimeOffEntry("date", { date: "2026-07-14" }, "vacation", "full_day", "Bastille Day"),
        ],
      });

      const stored = localStorage.getItem(TIME_OFF_ENTRIES_STORAGE_KEY);
      const entries = JSON.parse(stored!);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        entryKind: "date",
        date: "2026-07-14",
        note: "Bastille Day",
      });
    });

    it("clears time-off storage when all entries are soft-deleted", () => {
      localStorage.setItem(
        TIME_OFF_ENTRIES_STORAGE_KEY,
        JSON.stringify([
          {
            id: "e1",
            entryKind: "date",
            date: "2026-07-14",
            entryType: "vacation",
            entryFlag: "full_day",
            note: null,
          },
        ]),
      );
      applySyncPullResponse({
        ...makeBaseResponse(),
        time_off_entries: [
          makeTimeOffEntry(
            "date",
            { date: "2026-07-14" },
            "vacation",
            "full_day",
            null,
            "2026-07-15T00:00:00Z",
          ),
        ],
      });

      expect(localStorage.getItem(TIME_OFF_ENTRIES_STORAGE_KEY)).toBeNull();
    });

    it("clears time-off storage when time_off_entries is empty", () => {
      localStorage.setItem(
        TIME_OFF_ENTRIES_STORAGE_KEY,
        JSON.stringify([
          {
            id: "e1",
            entryKind: "date",
            date: "2026-07-14",
            entryType: "vacation",
            entryFlag: "full_day",
            note: null,
          },
        ]),
      );
      applySyncPullResponse(makeBaseResponse());

      expect(localStorage.getItem(TIME_OFF_ENTRIES_STORAGE_KEY)).toBeNull();
    });

    it("restores weekly and range entries as canonical entries without expanding them", () => {
      applySyncPullResponse({
        ...makeBaseResponse(),
        time_off_entries: [
          makeTimeOffEntry("weekly", { weekday: 1 }, "in", "full_day", "Every Monday"),
          makeTimeOffEntry(
            "range",
            { start_date: "2026-12-24", end_date: "2026-12-26" },
            "vacation",
          ),
        ],
      });

      const stored = localStorage.getItem(TIME_OFF_ENTRIES_STORAGE_KEY);
      const entries = JSON.parse(stored!) as Array<Record<string, unknown>>;
      expect(entries).toHaveLength(2);
      expect(
        entries.some(
          (e) => e.entryKind === "weekly" && e.weekday === 1 && e.note === "Every Monday",
        ),
      ).toBe(true);
      expect(
        entries.some(
          (e) => e.entryKind === "range" && e.start === "2026-12-24" && e.end === "2026-12-26",
        ),
      ).toBe(true);
    });

    it("maps unknown entry_type to 'other'", () => {
      applySyncPullResponse({
        ...makeBaseResponse(),
        time_off_entries: [makeTimeOffEntry("date", { date: "2026-07-14" }, "sick")],
      });

      const stored = localStorage.getItem(TIME_OFF_ENTRIES_STORAGE_KEY);
      const entries = JSON.parse(stored!);
      expect(entries[0]).toMatchObject({
        entryKind: "date",
        date: "2026-07-14",
        entryType: "other",
      });
    });

    it("maps unknown flag to null", () => {
      applySyncPullResponse({
        ...makeBaseResponse(),
        time_off_entries: [
          makeTimeOffEntry("date", { date: "2026-07-14" }, "vacation", "unknown_flag"),
        ],
      });

      const stored = localStorage.getItem(TIME_OFF_ENTRIES_STORAGE_KEY);
      const entries = JSON.parse(stored!);
      expect(entries[0].entryFlag).toBe("full_day");
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
      expect(localStorage.getItem(getSyncCursorKey("user-42"))).toBe(
        "2026-03-15T12:00:00.000Z",
      );
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
      expect(stored[0].tasks[0].id).toBe("t1");
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

  // ---------------------------------------------------------------------------
  // applyIncrementalSyncPullResponse
  // ---------------------------------------------------------------------------

  describe("applyIncrementalSyncPullResponse", () => {
    const baseResponse = () => ({
      labels: [] as never[],
      tasks: [] as never[],
      templates: [] as never[],
      work_locations: [] as never[],
      time_off_entries: [] as never[],
      gantt_tasks: [] as never[],
      server_timestamp: "2026-02-01T00:00:00.000Z",
    });

    const makeLabel = (id: string, name: string, deletedAt: string | null = null) => ({
      id,
      user_id: 1,
      name,
      color: "#AABBCC",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      deleted_at: deletedAt,
    });

    const makeTask = (id: string, deletedAt: string | null = null) => ({
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

    const makeTemplate = (id: string, deletedAt: string | null = null) => ({
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

    const makeWorkLocation = (date: string, countryCode = "NL", deletedAt: string | null = null) => ({
      id: 1,
      user_id: 1,
      date,
      country_code: countryCode,
      label: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      deleted_at: deletedAt,
    });

    it("upserts a new label into localStorage", () => {
      applyIncrementalSyncPullResponse({ ...baseResponse(), labels: [makeLabel("lbl-1", "Work")] }, []);
      const stored = JSON.parse(localStorage.getItem(TIME_TRACKING_STORAGE_KEYS.labels)!);
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ id: "lbl-1", name: "Work" });
    });

    it("merges a new label with existing labels", () => {
      localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.labels,
        JSON.stringify([{ id: "lbl-existing", name: "Existing", color: "#FF0000" }]),
      );
      applyIncrementalSyncPullResponse({ ...baseResponse(), labels: [makeLabel("lbl-new", "New")] }, []);
      const stored = JSON.parse(localStorage.getItem(TIME_TRACKING_STORAGE_KEYS.labels)!);
      expect(stored).toHaveLength(2);
    });

    it("removes a soft-deleted label", () => {
      localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.labels,
        JSON.stringify([{ id: "lbl-del", name: "Gone", color: "#000" }]),
      );
      applyIncrementalSyncPullResponse(
        { ...baseResponse(), labels: [makeLabel("lbl-del", "Gone", "2026-01-02T00:00:00Z")] },
        [],
      );
      const stored = JSON.parse(localStorage.getItem(TIME_TRACKING_STORAGE_KEYS.labels)!);
      expect(stored).toHaveLength(0);
    });

    it("upserts a new task into localStorage", () => {
      applyIncrementalSyncPullResponse({ ...baseResponse(), tasks: [makeTask("task-1")] }, []);
      const stored = JSON.parse(localStorage.getItem(TIME_TRACKING_STORAGE_KEYS.tasks)!);
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe("task-1");
    });

    it("removes a soft-deleted task", () => {
      localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.tasks,
        JSON.stringify([{ id: "task-del", text: "Gone", label: "", startTime: "2026-01-01T09:00" }]),
      );
      applyIncrementalSyncPullResponse(
        { ...baseResponse(), tasks: [makeTask("task-del", "2026-01-02T00:00:00Z")] },
        [],
      );
      const stored = JSON.parse(localStorage.getItem(TIME_TRACKING_STORAGE_KEYS.tasks)!);
      expect(stored).toHaveLength(0);
    });

    it("upserts a new template", () => {
      applyIncrementalSyncPullResponse(
        { ...baseResponse(), templates: [makeTemplate("tmpl-1")] },
        [],
      );
      const stored = JSON.parse(localStorage.getItem(TIME_TRACKING_STORAGE_KEYS.templates)!);
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe("tmpl-1");
    });

    it("removes a soft-deleted template", () => {
      localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.templates,
        JSON.stringify([{ id: "tmpl-del", text: "Gone", label: "", start: "09:00", stop: "09:15" }]),
      );
      applyIncrementalSyncPullResponse(
        { ...baseResponse(), templates: [makeTemplate("tmpl-del", "2026-01-02T00:00:00Z")] },
        [],
      );
      const stored = JSON.parse(localStorage.getItem(TIME_TRACKING_STORAGE_KEYS.templates)!);
      expect(stored).toHaveLength(0);
    });

    it("upserts a work location entry", () => {
      applyIncrementalSyncPullResponse(
        { ...baseResponse(), work_locations: [makeWorkLocation("2026-03-10", "DE")] },
        [],
      );
      const stored = JSON.parse(localStorage.getItem(`${WORK_LOCATIONS_STORAGE_PREFIX}2026`)!);
      expect(stored["2026-03-10"]).toMatchObject({ countryCode: "DE" });
    });

    it("removes a soft-deleted work location entry", () => {
      localStorage.setItem(
        `${WORK_LOCATIONS_STORAGE_PREFIX}2026`,
        JSON.stringify({ "2026-03-10": { location: "other", countryCode: "DE" } }),
      );
      applyIncrementalSyncPullResponse(
        {
          ...baseResponse(),
          work_locations: [makeWorkLocation("2026-03-10", "DE", "2026-03-11T00:00:00Z")],
        },
        [],
      );
      const stored = JSON.parse(localStorage.getItem(`${WORK_LOCATIONS_STORAGE_PREFIX}2026`)!);
      expect(stored["2026-03-10"]).toBeUndefined();
    });

    it("does not touch work_locations key when response has no work_locations", () => {
      localStorage.setItem(
        `${WORK_LOCATIONS_STORAGE_PREFIX}2026`,
        JSON.stringify({ "2026-01-01": { location: "home", countryCode: "NL" } }),
      );
      applyIncrementalSyncPullResponse(baseResponse(), []);
      const stored = JSON.parse(localStorage.getItem(`${WORK_LOCATIONS_STORAGE_PREFIX}2026`)!);
      expect(stored["2026-01-01"]).toBeDefined();
    });

    it("merges time_off_entries: new server entries are added to existing ones", () => {
      const existingEntry = buildTimeOffEntryForRange({
        start: "2026-06-01",
        end: "2026-06-01",
        note: null,
        entryType: "vacation",
        entryFlag: "full_day",
      });
      const newServerEntry = {
        id: 99,
        entry_id: "new-entry-id",
        user_id: 1,
        entry_kind: "date" as const,
        date: "2026-07-14",
        start_date: null,
        end_date: null,
        weekday: null,
        entry_type: "vacation",
        entry_flag: "full_day",
        note: "Bastille Day",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        deleted_at: null,
      };
      const result = applyIncrementalSyncPullResponse(
        { ...baseResponse(), time_off_entries: [newServerEntry] },
        [existingEntry],
      );
      expect(result).toHaveLength(2);
      expect(result.some((e) => e.id === "new-entry-id")).toBe(true);
    });

    it("merges time_off_entries: deleted server entries are removed from the result", () => {
      const existingEntry = buildTimeOffEntryForRange({
        start: "2026-07-14",
        end: "2026-07-14",
        note: null,
        entryType: "vacation",
        entryFlag: "full_day",
      });
      const deletedServerEntry = {
        id: 99,
        entry_id: existingEntry.id,
        user_id: 1,
        entry_kind: "date" as const,
        date: "2026-07-14",
        start_date: null,
        end_date: null,
        weekday: null,
        entry_type: "vacation",
        entry_flag: "full_day",
        note: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z",
        deleted_at: "2026-01-02T00:00:00Z",
      };
      const result = applyIncrementalSyncPullResponse(
        { ...baseResponse(), time_off_entries: [deletedServerEntry] },
        [existingEntry],
      );
      expect(result).toHaveLength(0);
    });

    it("upserts a new gantt task into localStorage", () => {
      applyIncrementalSyncPullResponse(
        {
          ...baseResponse(),
          gantt_tasks: [
            {
              id: "gantt-new",
              user_id: 1,
              name: "Build phase",
              start_date: "2026-04-01",
              end_date: "2026-04-30",
              progress: 10,
              dependencies: null,
              notes: "Important",
              client_updated_at: "2026-01-01T00:00:00Z",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
              deleted_at: null,
            },
          ],
        },
        [],
      );

      const stored = JSON.parse(localStorage.getItem(GANTT_STORAGE_KEY)!);
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ id: "gantt-new", name: "Build phase", progress: 10, notes: "Important" });
    });

    it("removes a soft-deleted gantt task from localStorage", () => {
      localStorage.setItem(
        GANTT_STORAGE_KEY,
        JSON.stringify([{ id: "gantt-del", name: "Old task", start: "2026-01-01", end: "2026-01-10", progress: 0 }]),
      );

      applyIncrementalSyncPullResponse(
        {
          ...baseResponse(),
          gantt_tasks: [
            {
              id: "gantt-del",
              user_id: 1,
              name: "Old task",
              start_date: "2026-01-01",
              end_date: "2026-01-10",
              progress: 0,
              dependencies: null,
              notes: null,
              client_updated_at: "2026-01-01T00:00:00Z",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-02T00:00:00Z",
              deleted_at: "2026-01-02T00:00:00Z",
            },
          ],
        },
        [],
      );

      const stored = JSON.parse(localStorage.getItem(GANTT_STORAGE_KEY)!);
      expect(stored).toHaveLength(0);
    });
  });
});
