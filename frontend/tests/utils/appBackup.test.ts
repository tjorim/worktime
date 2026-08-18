import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBackupPayload,
  checkBackupDataPresence,
  downloadAppBackup,
  restoreAppBackup,
  validateAppBackupPayload,
} from "@/utils/appBackup";
import { getSyncOutboxKey, USER_STATE_STORAGE_KEY } from "@/constants/storageKeys";
import type { TimeOffEntry } from "@/lib/timeOff/types";
import {
  ganttTasksCollection,
  labelsCollection,
  tasksCollection,
  templatesCollection,
  timeOffCollection,
  workLocationsCollection,
} from "@/db/collections";
import * as collectionsModule from "@/db/collections";

const USER_STATE_KEY = USER_STATE_STORAGE_KEY;

function plainCollectionItems<T extends object>(items: T[]): Array<Record<string, unknown>> {
  return items.map((item) => {
    const plain = { ...item } as Record<string, unknown>;
    delete plain.$collectionId;
    delete plain.$key;
    delete plain.$origin;
    delete plain.$synced;
    return plain;
  });
}

describe("appBackup", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("buildBackupPayload", () => {
    it("returns version 1 and exportedAt timestamp", () => {
      const payload = buildBackupPayload();
      expect(payload.version).toBe(1);
      expect(typeof payload.exportedAt).toBe("string");
      expect(new Date(payload.exportedAt).toISOString()).toBe(payload.exportedAt);
    });

    it("omits sections absent from localStorage", () => {
      const payload = buildBackupPayload();
      expect(payload.userState).toBeUndefined();
      expect(payload.timeOff).toBeUndefined();
      expect(payload.workLocations).toBeUndefined();
      expect(payload.tasks).toBeUndefined();
      expect(payload.templates).toBeUndefined();
      expect(payload.labels).toBeUndefined();
    });

    it("includes userState when present", () => {
      const state = { version: 2, myTeam: 3, scheduleType: "5-shift" };
      localStorage.setItem(USER_STATE_KEY, JSON.stringify(state));
      const payload = buildBackupPayload();
      expect(payload.userState).toEqual(state);
    });

    it("includes timeOff canonical entries when present", () => {
      const entry: TimeOffEntry = {
        id: "e1",
        entryKind: "date",
        date: "2026-01-15",
        entryType: "vacation",
        entryFlag: "full_day",
        note: "Vacation",
      };
      timeOffCollection.insert(entry);
      const payload = buildBackupPayload();
      expect(Array.isArray(payload.timeOff)).toBe(true);
      expect(payload.timeOff).toHaveLength(1);
      expect((payload.timeOff as TimeOffEntry[])[0]).toMatchObject({
        entryKind: "date",
        date: "2026-01-15",
        note: "Vacation",
      });
    });

    it("includes work locations for all stored years", () => {
      const loc2025 = { "2025-06-01": { countryCode: "NL" } };
      const loc2026 = { "2026-02-24": { countryCode: "DE" } };
      workLocationsCollection.insert({
        date: "2025-06-01",
        countryCode: "NL",
      });
      workLocationsCollection.insert({
        date: "2026-02-24",
        countryCode: "DE",
      });
      const payload = buildBackupPayload();
      expect(payload.workLocations).toEqual({ "2025": loc2025, "2026": loc2026 });
    });

    it("includes time tracking tasks, templates and labels", () => {
      const tasks = [
        { id: "t1", text: "Task", label: "l1", startTime: "2026-02-24T09:00", stopTime: null },
      ];
      const templates = [
        { id: "tp1", text: "Template", label: "l1", start: "09:00", stop: "17:00" },
      ];
      const labels = [{ id: "l1", name: "Work", color: "#198754" }];
      tasksCollection.insert(tasks[0]!);
      templatesCollection.insert(templates[0]!);
      labelsCollection.insert(labels[0]!);
      const payload = buildBackupPayload();
      expect(payload.tasks).toEqual([
        { id: "t1", text: "Task", label: "l1", startTime: "2026-02-24T09:00" },
      ]);
      expect(payload.templates).toEqual(templates);
      expect(payload.labels).toEqual(labels);
    });

    it("includes gantt tasks when present", () => {
      const ganttTask = {
        id: "g1",
        name: "Plan release",
        start: "2026-02-24",
        end: "2026-02-28",
        progress: 25,
      };
      ganttTasksCollection.insert(ganttTask);
      const payload = buildBackupPayload();
      expect(payload.ganttTasks).toEqual([ganttTask]);
    });

    it("omits tasks when the collection is empty", () => {
      const payload = buildBackupPayload();
      expect(payload.tasks).toBeUndefined();
    });

    it("excludes sections when include flags are false", () => {
      const entry: TimeOffEntry = {
        id: "e1",
        entryKind: "date",
        date: "2026-01-15",
        entryType: "vacation",
        entryFlag: "full_day",
        note: "Vacation",
      };
      localStorage.setItem(USER_STATE_KEY, JSON.stringify({ myTeam: 1 }));
      timeOffCollection.insert(entry);
      const payload = buildBackupPayload({ includeUserState: false, includeTimeOff: false });
      expect(payload.userState).toBeUndefined();
      expect(payload.timeOff).toBeUndefined();
    });
  });

  describe("checkBackupDataPresence", () => {
    it("returns all false when storage is empty", () => {
      const presence = checkBackupDataPresence();
      expect(presence.hasUserState).toBe(false);
      expect(presence.hasTimeOff).toBe(false);
      expect(presence.hasWorkLocations).toBe(false);
      expect(presence.hasTasks).toBe(false);
      expect(presence.hasTemplates).toBe(false);
      expect(presence.hasLabels).toBe(false);
      expect(presence.hasGanttTasks).toBe(false);
    });

    it("detects user state", () => {
      localStorage.setItem(USER_STATE_KEY, JSON.stringify({ myTeam: 1 }));
      expect(checkBackupDataPresence().hasUserState).toBe(true);
    });

    it("detects time off data", () => {
      const entry: TimeOffEntry = {
        id: "e1",
        entryKind: "date",
        date: "2026-01-15",
        entryType: "vacation",
        entryFlag: "full_day",
        note: null,
      };
      timeOffCollection.insert(entry);
      expect(checkBackupDataPresence().hasTimeOff).toBe(true);
    });

    it("detects tasks", () => {
      tasksCollection.insert({ id: "t1", text: "A", label: "l1", startTime: "2025-06-01T09:00" });
      tasksCollection.insert({ id: "t2", text: "B", label: "l1", startTime: "2026-02-24T09:00" });
      const presence = checkBackupDataPresence();
      expect(presence.hasTasks).toBe(true);
    });

    it("detects work locations", () => {
      workLocationsCollection.insert({
        date: "2025-06-01",
        countryCode: "NL",
      });
      const presence = checkBackupDataPresence();
      expect(presence.hasWorkLocations).toBe(true);
    });

    it("detects gantt tasks", () => {
      ganttTasksCollection.insert({
        id: "g1",
        name: "Plan release",
        start: "2026-02-24",
        end: "2026-02-28",
        progress: 25,
      });
      const presence = checkBackupDataPresence();
      expect(presence.hasGanttTasks).toBe(true);
    });
  });

  describe("validateAppBackupPayload", () => {
    it("accepts a minimal payload with only userState", () => {
      expect(validateAppBackupPayload({ userState: {} })).toBe(true);
    });

    it("accepts a full payload", () => {
      const payload = {
        exportedAt: new Date().toISOString(),
        version: 1,
        userState: {},
        timeOff: [],
        workLocations: { "2026": {} },
        tasks: [],
        templates: [],
        labels: [],
      };
      expect(validateAppBackupPayload(payload)).toBe(true);
    });

    it("rejects null", () => {
      expect(validateAppBackupPayload(null)).toBe(false);
    });

    it("rejects a primitive", () => {
      expect(validateAppBackupPayload("string")).toBe(false);
    });

    it("rejects an empty object with no recognizable sections", () => {
      expect(validateAppBackupPayload({})).toBe(false);
    });

    it("rejects when timeOff is not an array", () => {
      expect(validateAppBackupPayload({ timeOff: 42 })).toBe(false);
      expect(validateAppBackupPayload({ timeOff: "2026/01/01 # Vacation\n" })).toBe(false);
    });

    it("rejects when tasks is not an array", () => {
      expect(validateAppBackupPayload({ tasks: "bad" })).toBe(false);
    });

    it("rejects when templates is not an array", () => {
      expect(validateAppBackupPayload({ templates: {} })).toBe(false);
    });

    it("rejects when labels is not an array", () => {
      expect(validateAppBackupPayload({ labels: 123 })).toBe(false);
    });

    it("rejects when workLocations is null", () => {
      expect(validateAppBackupPayload({ workLocations: null })).toBe(false);
    });

    it("rejects when workLocations is an array", () => {
      expect(validateAppBackupPayload({ workLocations: [] })).toBe(false);
    });

    it("rejects when a work location entry is missing countryCode", () => {
      expect(
        validateAppBackupPayload({
          workLocations: { "2026": { "2026-02-24": { location: "home" } } },
        }),
      ).toBe(false);
    });

    it("rejects when a work location entry has a non-string countryCode", () => {
      expect(
        validateAppBackupPayload({
          workLocations: { "2026": { "2026-02-24": { location: "home", countryCode: 1 } } },
        }),
      ).toBe(false);
    });
  });

  describe("restoreAppBackup", () => {
    beforeEach(() => {
      vi.spyOn(window.location, "reload").mockImplementation(() => {});
    });

    it("writes userState to localStorage and reloads", async () => {
      const state = { version: 2, myTeam: 1 };
      await restoreAppBackup({ exportedAt: "", version: 1, userState: state });
      expect(JSON.parse(localStorage.getItem(USER_STATE_KEY)!)).toMatchObject(state);
      expect(window.location.reload).toHaveBeenCalledOnce();
    });

    it("stamps a fresh _updatedAt on the restored userState, discarding the export-time one", async () => {
      const exportTimeState = { version: 2, myTeam: 1, _updatedAt: "2020-01-01T00:00:00.000Z" };
      await restoreAppBackup({ exportedAt: "", version: 1, userState: exportTimeState });
      const restored = JSON.parse(localStorage.getItem(USER_STATE_KEY)!);
      expect(restored._updatedAt).not.toBe(exportTimeState._updatedAt);
      expect(new Date(restored._updatedAt).toISOString()).toBe(restored._updatedAt);
    });

    it("writes timeOff canonical entries to storage", async () => {
      const entry: TimeOffEntry = {
        id: "e1",
        entryKind: "date",
        date: "2026-01-15",
        entryType: "vacation",
        entryFlag: "full_day",
        note: "Vacation",
      };
      await restoreAppBackup({ exportedAt: "", version: 1, timeOff: [entry] });
      expect(timeOffCollection.toArray).toHaveLength(1);
      expect(timeOffCollection.toArray[0]).toMatchObject({
        entryKind: "date",
        date: "2026-01-15",
        note: "Vacation",
      });
    });

    it("writes work locations for each year", async () => {
      const locs = { "2026": { "2026-02-24": { countryCode: "NL" } } };
      await restoreAppBackup({ exportedAt: "", version: 1, workLocations: locs });
      expect(plainCollectionItems(workLocationsCollection.toArray)).toEqual([
        { date: "2026-02-24", countryCode: "NL" },
      ]);
    });

    it("writes time tracking tasks, templates and labels", async () => {
      const tasks = [{ id: "t1", text: "T", label: "l1", startTime: "2026-02-24T09:00" }];
      const templates = [{ id: "tp1", text: "T", label: "l1", start: "09:00", stop: "17:00" }];
      const labels = [{ id: "l1", name: "Work", color: "#198754" }];
      await restoreAppBackup({ exportedAt: "", version: 1, tasks, templates, labels });
      expect(plainCollectionItems(tasksCollection.toArray)).toEqual(tasks);
      expect(plainCollectionItems(templatesCollection.toArray)).toEqual(templates);
      expect(plainCollectionItems(labelsCollection.toArray)).toEqual(labels);
    });

    it("replaces existing tasks when tasks are present in the backup payload", async () => {
      const existingTasks = [
        { id: "t-2025", text: "A", label: "l1", startTime: "2025-06-01T09:00" },
        { id: "t-2026", text: "B", label: "l1", startTime: "2026-02-24T09:00" },
      ];
      const backupTasks = [
        { id: "t-2025-new", text: "A2", label: "l1", startTime: "2025-07-01T09:00" },
      ];

      tasksCollection.insert(existingTasks[0]!);
      tasksCollection.insert(existingTasks[1]!);
      await restoreAppBackup({ exportedAt: "", version: 1, tasks: backupTasks });

      expect(plainCollectionItems(tasksCollection.toArray)).toEqual(backupTasks);
    });

    it("leaves unspecified sections untouched", async () => {
      localStorage.setItem(USER_STATE_KEY, JSON.stringify({ myTeam: 5 }));
      await restoreAppBackup({ exportedAt: "", version: 1, labels: [] });
      // userState was not in payload, should still be in localStorage
      expect(JSON.parse(localStorage.getItem(USER_STATE_KEY)!)).toEqual({ myTeam: 5 });
    });

    it("always calls window.location.reload when not signed in to a synced account", async () => {
      await restoreAppBackup({ exportedAt: "", version: 1, labels: [] });
      expect(window.location.reload).toHaveBeenCalledOnce();
    });

    describe("on a synced account", () => {
      const mockFetch = vi.fn();

      beforeEach(() => {
        mockFetch.mockReset();
        vi.spyOn(collectionsModule, "hasSyncCollectionAuth").mockReturnValue(true);
        vi.spyOn(collectionsModule, "getSyncCollectionUserId").mockReturnValue("user-1");
      });

      afterEach(() => {
        localStorage.removeItem(getSyncOutboxKey("user-1"));
      });

      const emptyPullResponse = {
        labels: [],
        tasks: [],
        templates: [],
        work_locations: [],
        time_off_entries: [],
        gantt_tasks: [],
        server_timestamp: "2026-01-02T00:00:00.000Z",
      };

      it("pulls, pushes a single keep-local replace payload, then reloads", async () => {
        const labels = [{ id: "l1", name: "Work", color: "#198754" }];
        mockFetch
          .mockResolvedValueOnce({ ok: true, json: async () => emptyPullResponse }) // GET /api/sync/pull
          .mockResolvedValueOnce({ ok: true, json: async () => ({ results: {} }) }); // POST /api/sync/push

        await restoreAppBackup({ exportedAt: "", version: 1, labels }, mockFetch);

        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(mockFetch.mock.calls[0]![0]).toBe("/api/sync/pull");
        const [pushUrl, pushInit] = mockFetch.mock.calls[1]!;
        expect(pushUrl).toBe("/api/sync/push");
        const pushBody = JSON.parse((pushInit as RequestInit).body as string);
        expect(pushBody.allow_bulk_delete).toBe(true);
        expect(pushBody.labels).toEqual([
          expect.objectContaining({ id: "l1", action: "create", name: "Work", color: "#198754" }),
        ]);
        expect(window.location.reload).toHaveBeenCalledOnce();
      });

      it("does not throw, does not hit the network, and still reloads when the restored state is empty", async () => {
        // No collection sections in the payload: buildLocalSyncPushPayload()
        // produces an empty push, so there is nothing to reconcile with the
        // server and no reason to round-trip for it.
        await restoreAppBackup({ exportedAt: "", version: 1, userState: {} }, mockFetch);

        expect(mockFetch).not.toHaveBeenCalled();
        expect(window.location.reload).toHaveBeenCalledOnce();
      });

      it("throws, does not reload, and queues the payload in the outbox when the push fails", async () => {
        const labels = [{ id: "l1", name: "Work", color: "#198754" }];
        mockFetch
          .mockResolvedValueOnce({ ok: true, json: async () => emptyPullResponse }) // pull succeeds
          .mockResolvedValueOnce({ ok: false, status: 500 }); // push fails

        await expect(
          restoreAppBackup({ exportedAt: "", version: 1, labels }, mockFetch),
        ).rejects.toThrow();

        expect(window.location.reload).not.toHaveBeenCalled();
        const outbox = JSON.parse(localStorage.getItem(getSyncOutboxKey("user-1"))!);
        expect(outbox).toHaveLength(1);
        expect(outbox[0].labels).toEqual([
          expect.objectContaining({ id: "l1", action: "create" }),
        ]);
      });

      it("throws and does not reload when the pre-push pull fails", async () => {
        const labels = [{ id: "l1", name: "Work", color: "#198754" }];
        mockFetch.mockResolvedValueOnce({ ok: false, status: 500 }); // pull fails

        await expect(
          restoreAppBackup({ exportedAt: "", version: 1, labels }, mockFetch),
        ).rejects.toThrow();

        expect(window.location.reload).not.toHaveBeenCalled();
      });
    });
  });

  describe("downloadAppBackup", () => {
    it("creates a download link with the correct filename and triggers a click", () => {
      const mockClick = vi.fn();
      const mockCreateObjectURL = vi.fn().mockReturnValue("blob:fake-url");
      const mockRevokeObjectURL = vi.fn();
      URL.createObjectURL = mockCreateObjectURL;
      URL.revokeObjectURL = mockRevokeObjectURL;

      const mockAnchor = {
        href: "",
        download: "",
        click: mockClick,
      };
      vi.spyOn(document, "createElement").mockReturnValue(mockAnchor as unknown as HTMLElement);

      downloadAppBackup("2026-02-24");

      expect(mockAnchor.download).toBe("worktime-backup-2026-02-24.json");
      expect(mockClick).toHaveBeenCalledOnce();
    });
  });
});
