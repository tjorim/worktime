import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBackupPayload,
  checkBackupDataPresence,
  downloadAppBackup,
  restoreAppBackup,
  validateAppBackupPayload,
} from "@/utils/appBackup";
import {
  USER_STATE_STORAGE_KEY,
} from "@/constants/storageKeys";
import type { TimeOffEntry } from "@/lib/timeOff/types";
import {
  ganttTasksCollection,
  labelsCollection,
  tasksCollection,
  templatesCollection,
  timeOffCollection,
  workLocationsCollection,
} from "@/db/collections";

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
      const loc2025 = { "2025-06-01": { location: "home", countryCode: "NL" } };
      const loc2026 = { "2026-02-24": { location: "office", countryCode: "DE" } };
      workLocationsCollection.insert({
        date: "2025-06-01",
        location: "home",
        countryCode: "NL",
      });
      workLocationsCollection.insert({
        date: "2026-02-24",
        location: "office",
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

    it("filters tasks by year when year option is provided", () => {
      const tasks = [
        { id: "t1", text: "A", label: "l1", startTime: "2025-06-01T09:00" },
        { id: "t2", text: "B", label: "l1", startTime: "2026-02-24T09:00" },
      ];
      tasksCollection.insert(tasks[0]!);
      tasksCollection.insert(tasks[1]!);
      const payload = buildBackupPayload({ year: 2025 });
      expect(payload.tasks).toEqual([tasks[0]]);
    });

    it("filters work locations to the selected year", () => {
      workLocationsCollection.insert({
        date: "2025-06-01",
        location: "home",
        countryCode: "NL",
      });
      workLocationsCollection.insert({
        date: "2026-02-24",
        location: "office",
        countryCode: "DE",
      });
      const payload = buildBackupPayload({ year: 2025 });
      expect(payload.workLocations).toEqual({
        "2025": { "2025-06-01": { location: "home", countryCode: "NL" } },
      });
    });

    it("omits filtered tasks when none match the selected year", () => {
      const tasks = [{ id: "t1", text: "A", label: "l1", startTime: "2026-02-24T09:00" }];
      tasksCollection.insert(tasks[0]!);
      const payload = buildBackupPayload({ year: 2025 });
      expect(payload.tasks).toBeUndefined();
    });
  });

  describe("checkBackupDataPresence", () => {
    it("returns all false and empty years when localStorage is empty", () => {
      const presence = checkBackupDataPresence();
      expect(presence.hasUserState).toBe(false);
      expect(presence.hasTimeOff).toBe(false);
      expect(presence.hasWorkLocations).toBe(false);
      expect(presence.hasTasks).toBe(false);
      expect(presence.hasTemplates).toBe(false);
      expect(presence.hasLabels).toBe(false);
      expect(presence.availableYears).toEqual([]);
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

    it("detects tasks and extracts their years", () => {
      const tasks = [
        { id: "t1", startTime: "2025-06-01T09:00" },
        { id: "t2", startTime: "2026-02-24T09:00" },
      ];
      tasksCollection.insert({ id: "t1", text: "A", label: "l1", startTime: "2025-06-01T09:00" });
      tasksCollection.insert({ id: "t2", text: "B", label: "l1", startTime: "2026-02-24T09:00" });
      const presence = checkBackupDataPresence();
      expect(presence.hasTasks).toBe(true);
      expect(presence.availableYears).toEqual([2026, 2025]);
    });

    it("detects work locations and includes their years", () => {
      workLocationsCollection.insert({
        date: "2025-06-01",
        location: "home",
        countryCode: "NL",
      });
      const presence = checkBackupDataPresence();
      expect(presence.hasWorkLocations).toBe(true);
      expect(presence.availableYears).toContain(2025);
    });

    it("merges task years and work location years, sorted newest-first", () => {
      tasksCollection.insert({ id: "t1", text: "A", label: "l1", startTime: "2024-01-01T09:00" });
      workLocationsCollection.insert({
        date: "2026-02-24",
        location: "office",
        countryCode: "DE",
      });
      const presence = checkBackupDataPresence();
      expect(presence.availableYears).toEqual([2026, 2024]);
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

    it("writes userState to localStorage and reloads", () => {
      const state = { version: 2, myTeam: 1 };
      restoreAppBackup({ exportedAt: "", version: 1, userState: state });
      expect(JSON.parse(localStorage.getItem(USER_STATE_KEY)!)).toEqual(state);
      expect(window.location.reload).toHaveBeenCalledOnce();
    });

    it("writes timeOff canonical entries to storage", () => {
      const entry: TimeOffEntry = {
        id: "e1",
        entryKind: "date",
        date: "2026-01-15",
        entryType: "vacation",
        entryFlag: "full_day",
        note: "Vacation",
      };
      restoreAppBackup({ exportedAt: "", version: 1, timeOff: [entry] });
      expect(timeOffCollection.toArray).toHaveLength(1);
      expect(timeOffCollection.toArray[0]).toMatchObject({
        entryKind: "date",
        date: "2026-01-15",
        note: "Vacation",
      });
    });

    it("writes work locations for each year", () => {
      const locs = { "2026": { "2026-02-24": { location: "home", countryCode: "NL" } } };
      restoreAppBackup({ exportedAt: "", version: 1, workLocations: locs });
      expect(plainCollectionItems(workLocationsCollection.toArray)).toEqual([
        { date: "2026-02-24", location: "home", countryCode: "NL" },
      ]);
    });

    it("writes time tracking tasks, templates and labels", () => {
      const tasks = [{ id: "t1", text: "T", label: "l1", startTime: "2026-02-24T09:00" }];
      const templates = [{ id: "tp1", text: "T", label: "l1", start: "09:00", stop: "17:00" }];
      const labels = [{ id: "l1", name: "Work", color: "#198754" }];
      restoreAppBackup({ exportedAt: "", version: 1, tasks, templates, labels });
      expect(plainCollectionItems(tasksCollection.toArray)).toEqual(tasks);
      expect(plainCollectionItems(templatesCollection.toArray)).toEqual(templates);
      expect(plainCollectionItems(labelsCollection.toArray)).toEqual(labels);
    });

    it("preserves existing tasks from years not included in the backup payload", () => {
      const existingTasks = [
        { id: "t-2025", text: "A", label: "l1", startTime: "2025-06-01T09:00" },
        { id: "t-2026", text: "B", label: "l1", startTime: "2026-02-24T09:00" },
      ];
      const backupTasks = [
        { id: "t-2025-new", text: "A2", label: "l1", startTime: "2025-07-01T09:00" },
      ];

      tasksCollection.insert(existingTasks[0]!);
      tasksCollection.insert(existingTasks[1]!);
      restoreAppBackup({ exportedAt: "", version: 1, tasks: backupTasks });

      expect(plainCollectionItems(tasksCollection.toArray)).toEqual([
        existingTasks[1],
        backupTasks[0],
      ]);
    });

    it("replaces existing tasks from years included in the backup payload", () => {
      const existingTasks = [
        { id: "t-2025", text: "A", label: "l1", startTime: "2025-06-01T09:00" },
        { id: "t-2025-b", text: "B", label: "l1", startTime: "2025-06-02T09:00" },
      ];
      const backupTasks = [
        { id: "t-2025-new", text: "A2", label: "l1", startTime: "2025-07-01T09:00" },
      ];

      tasksCollection.insert(existingTasks[0]!);
      tasksCollection.insert(existingTasks[1]!);
      restoreAppBackup({ exportedAt: "", version: 1, tasks: backupTasks });

      expect(plainCollectionItems(tasksCollection.toArray)).toEqual(backupTasks);
    });

    it("leaves unspecified sections untouched", () => {
      localStorage.setItem(USER_STATE_KEY, JSON.stringify({ myTeam: 5 }));
      restoreAppBackup({ exportedAt: "", version: 1, labels: [] });
      // userState was not in payload, should still be in localStorage
      expect(JSON.parse(localStorage.getItem(USER_STATE_KEY)!)).toEqual({ myTeam: 5 });
    });

    it("always calls window.location.reload", () => {
      restoreAppBackup({ exportedAt: "", version: 1, labels: [] });
      expect(window.location.reload).toHaveBeenCalledOnce();
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
