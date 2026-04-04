import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applySyncPullResponse,
  buildLocalSyncPushPayload,
  fetchSyncStatus,
  pullSyncData,
  pushSyncPayload,
  syncStatusHasData,
} from "../../src/utils/syncClient";
import { TIME_TRACKING_STORAGE_KEYS } from "../../src/components/timeTracking/constants";
import { WORK_LOCATIONS_STORAGE_PREFIX } from "../../src/constants/storageKeys";

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
});
