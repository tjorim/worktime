import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applySyncPullResponse,
  applyPreferencesPull,
  buildKeepLocalReplacePayload,
  buildLocalPreferencesPayload,
  buildLocalSyncPushPayload,
  fetchPreferences,
  fetchSyncStatus,
  pullSyncData,
  pushPreferences,
  pushSyncPayload,
  syncItemsToHdayRaw,
  syncStatusHasData,
  timeOffEntriesToSyncItems,
} from "../../src/utils/syncClient";
import { TIME_TRACKING_STORAGE_KEYS } from "../../src/components/timeTracking/constants";
import { WORK_LOCATIONS_STORAGE_PREFIX, USER_STATE_STORAGE_KEY } from "../../src/constants/storageKeys";
import { TIME_OFF_STORAGE_KEY } from "../../src/contexts/EventStoreContext";
import { buildTimeOffEntryForRange, createWeeklyTimeOffEntry } from "../../src/lib/timeOff/codecs";

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
          preferences_updated_at: "2026-01-01T00:00:00Z",
          server_timestamp: "2026-01-01T00:00:00Z",
        }),
      ).toBe(true);
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
      expect(mockFetch).toHaveBeenCalledWith("/db/sync/status");
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
        "/db/sync/push",
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
      expect(mockFetch).toHaveBeenCalledWith("/db/sync/pull");
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
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("since="),
      );
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
        JSON.stringify([
          { id: "task-2", text: "Open", label: "", startTime: "2026-01-01T09:00" },
        ]),
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

      const stored = JSON.parse(
        localStorage.getItem(`${WORK_LOCATIONS_STORAGE_PREFIX}2026`)!,
      );
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
          flags: [],
        }),
      ];
      const items = timeOffEntriesToSyncItems([entry], ts);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        id: entry.id,
        kind: "date",
        date: "2026-07-14",
        action: "create",
        entry_type: "vacation",
        flags: [],
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
          flags: [],
        }),
      ];
      const items = timeOffEntriesToSyncItems([entry], ts);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        id: entry.id,
        kind: "range",
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
          flags: [],
        }),
        buildTimeOffEntryForRange({
          start: "2026-01-02",
          end: "2026-01-02",
          note: null,
          entryType: "ill",
          flags: [],
        }),
        buildTimeOffEntryForRange({
          start: "2026-01-03",
          end: "2026-01-03",
          note: null,
          entryType: "in",
          flags: [],
        }),
      ];
      const items = timeOffEntriesToSyncItems(entries, ts);
      expect(items[0]?.entry_type).toBe("business");
      expect(items[1]?.entry_type).toBe("ill");
      expect(items[2]?.entry_type).toBe("in");
    });

    it("preserves entry flags in the flags array", () => {
      const items = timeOffEntriesToSyncItems(
        [
          buildTimeOffEntryForRange({
            start: "2026-06-01",
            end: "2026-06-01",
            note: null,
            entryType: "vacation",
            flags: ["half_am"],
          }),
        ],
        ts,
      );
      expect(items[0]?.flags).toEqual(["half_am"]);
      expect(items[0]?.entry_type).toBe("vacation");
    });

    it("includes weekly entries directly", () => {
      const [entry] = [createWeeklyTimeOffEntry({ weekday: 1, note: null, entryType: "in", flags: [] })];
      const items = timeOffEntriesToSyncItems(
        [entry],
        ts,
      );
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        id: entry.id,
        kind: "weekly",
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
            flags: [],
          }),
        ],
        ts,
      );
      expect(items[0]?.note).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // syncItemsToHdayRaw
  // ---------------------------------------------------------------------------

  describe("syncItemsToHdayRaw", () => {
    const makeEntry = (
      kind: "date" | "range" | "weekly",
      shape: { date?: string; start_date?: string; end_date?: string; weekday?: number },
      entry_type: string,
      flags: string[] = [],
      note: string | null = null,
      deleted_at: string | null = null,
    ) => ({
      id: 1,
      entry_id: `entry-${Math.random()}`,
      user_id: 1,
      kind,
      date: shape.date ?? null,
      start_date: shape.start_date ?? null,
      end_date: shape.end_date ?? null,
      weekday: shape.weekday ?? null,
      entry_type,
      flags,
      note,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      deleted_at,
    });

    it("converts a vacation entry to an un-prefixed .hday line", () => {
      const raw = syncItemsToHdayRaw([makeEntry("date", { date: "2026-07-14" }, "vacation")]);
      expect(raw).toBe("2026/07/14");
    });

    it("converts a business entry to a b-prefixed .hday line", () => {
      const raw = syncItemsToHdayRaw([makeEntry("date", { date: "2026-07-14" }, "business")]);
      expect(raw).toBe("b2026/07/14");
    });

    it("includes a note as a comment", () => {
      const raw = syncItemsToHdayRaw([
        makeEntry("date", { date: "2026-07-14" }, "vacation", [], "Bastille Day"),
      ]);
      expect(raw).toBe("2026/07/14 # Bastille Day");
    });

    it("includes time/location flags in the prefix", () => {
      const raw = syncItemsToHdayRaw([
        makeEntry("date", { date: "2026-07-14" }, "vacation", ["half_am"]),
      ]);
      expect(raw).toBe("a2026/07/14");
    });

    it("skips soft-deleted entries", () => {
      const raw = syncItemsToHdayRaw([
        makeEntry("date", { date: "2026-07-14" }, "vacation", [], null, "2026-01-02T00:00:00Z"),
      ]);
      expect(raw).toBe("");
    });

    it("produces multiple lines for multiple entries", () => {
      const raw = syncItemsToHdayRaw([
        makeEntry("date", { date: "2026-07-14" }, "vacation"),
        makeEntry("weekly", { weekday: 1 }, "in"),
      ]);
      const lines = raw.split("\n");
      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe("2026/07/14");
      expect(lines[1]).toBe("d1k");
    });

    it("serializes range entries as a single range line", () => {
      const raw = syncItemsToHdayRaw([
        makeEntry("range", { start_date: "2026-12-24", end_date: "2026-12-26" }, "vacation"),
      ]);
      expect(raw).toBe("2026/12/24-2026/12/26");
    });
  });

  // ---------------------------------------------------------------------------
  // time-off entries in buildLocalSyncPushPayload
  // ---------------------------------------------------------------------------

  describe("buildLocalSyncPushPayload — time_off_entries", () => {
    it("includes time-off entries from .hday raw text", () => {
      localStorage.setItem(TIME_OFF_STORAGE_KEY, "2026/07/14 # Vacation");
      const payload = buildLocalSyncPushPayload();
      expect(payload.time_off_entries).toHaveLength(1);
      expect(payload.time_off_entries[0]).toMatchObject({
        kind: "date",
        date: "2026-07-14",
        action: "create",
        entry_type: "vacation",
        note: "Vacation",
      });
      expect(payload.time_off_entries[0]?.id).toBeTypeOf("string");
    });

    it("preserves multi-day range events from .hday as single entries", () => {
      localStorage.setItem(TIME_OFF_STORAGE_KEY, "2026/12/24-2026/12/26");
      const payload = buildLocalSyncPushPayload();
      expect(payload.time_off_entries).toHaveLength(1);
      expect(payload.time_off_entries[0]).toMatchObject({
        kind: "range",
        start_date: "2026-12-24",
        end_date: "2026-12-26",
      });
    });

    it("includes weekly events from .hday", () => {
      localStorage.setItem(TIME_OFF_STORAGE_KEY, "d1 # Every Monday");
      const payload = buildLocalSyncPushPayload();
      expect(payload.time_off_entries).toHaveLength(1);
      expect(payload.time_off_entries[0]).toMatchObject({
        kind: "weekly",
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
      server_timestamp: "2026-01-01T00:00:00Z",
    });

    const makeTimeOffEntry = (
      kind: "date" | "range" | "weekly",
      shape: { date?: string; start_date?: string; end_date?: string; weekday?: number },
      entry_type = "vacation",
      flags: string[] = [],
      note: string | null = null,
      deleted_at: string | null = null,
    ) => ({
      id: 1,
      entry_id: `entry-${Math.random()}`,
      user_id: 1,
      kind,
      date: shape.date ?? null,
      start_date: shape.start_date ?? null,
      end_date: shape.end_date ?? null,
      weekday: shape.weekday ?? null,
      entry_type,
      flags,
      note,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      deleted_at,
    });

    it("writes .hday raw text for pulled time-off entries", () => {
      applySyncPullResponse({
        ...makeBaseResponse(),
        time_off_entries: [
          makeTimeOffEntry("date", { date: "2026-07-14" }, "vacation", [], "Bastille Day"),
        ],
      });

      const stored = localStorage.getItem(TIME_OFF_STORAGE_KEY);
      expect(stored).toContain("2026/07/14");
      expect(stored).toContain("Bastille Day");
    });

    it("removes .hday key when all entries are soft-deleted", () => {
      localStorage.setItem(TIME_OFF_STORAGE_KEY, "2026/07/14");
      applySyncPullResponse({
        ...makeBaseResponse(),
        time_off_entries: [
          makeTimeOffEntry(
            "date",
            { date: "2026-07-14" },
            "vacation",
            [],
            null,
            "2026-07-15T00:00:00Z",
          ),
        ],
      });

      expect(localStorage.getItem(TIME_OFF_STORAGE_KEY)).toBeNull();
    });

    it("removes .hday key when time_off_entries is empty", () => {
      localStorage.setItem(TIME_OFF_STORAGE_KEY, "2026/07/14");
      applySyncPullResponse(makeBaseResponse());

      expect(localStorage.getItem(TIME_OFF_STORAGE_KEY)).toBeNull();
    });

    it("restores weekly and range entries without expanding them", () => {
      applySyncPullResponse({
        ...makeBaseResponse(),
        time_off_entries: [
          makeTimeOffEntry("weekly", { weekday: 1 }, "in", [], "Every Monday"),
          makeTimeOffEntry("range", { start_date: "2026-12-24", end_date: "2026-12-26" }, "vacation"),
        ],
      });

      const stored = localStorage.getItem(TIME_OFF_STORAGE_KEY);
      expect(stored).toContain("d1k # Every Monday");
      expect(stored).toContain("2026/12/24-2026/12/26");
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
      expect(mockFetch).toHaveBeenCalledWith("/db/preferences");
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
      const result = await pushPreferences(
        mockFetch,
        { theme: "dark" },
        "2026-01-01T00:00:00Z",
      );
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "/db/preferences",
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
      localStorage.setItem(USER_STATE_STORAGE_KEY, JSON.stringify({ hasCompletedOnboarding: false }));
      applyPreferencesPull({ hasCompletedOnboarding: true });
      const stored = JSON.parse(localStorage.getItem(USER_STATE_STORAGE_KEY)!);
      expect(stored.hasCompletedOnboarding).toBe(true);
    });
  });
});
