import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBackupPayload,
  checkBackupDataPresence,
  downloadAppBackup,
  restoreAppBackup,
  validateAppBackupPayload,
} from "@/utils/appBackup";
import {
  TIME_OFF_ENTRIES_STORAGE_KEY,
  TIME_TRACKING_STORAGE_KEYS,
  USER_STATE_STORAGE_KEY,
  WORK_LOCATIONS_STORAGE_PREFIX,
} from "@/constants/storageKeys";
import type { TimeOffEntry } from "@/lib/timeOff/types";

const USER_STATE_KEY = USER_STATE_STORAGE_KEY;
const WORK_LOCATIONS_PREFIX = WORK_LOCATIONS_STORAGE_PREFIX;

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
        kind: "date",
        date: "2026-01-15",
        entryType: "vacation",
        flags: [],
        note: "Vacation",
      };
      localStorage.setItem(TIME_OFF_ENTRIES_STORAGE_KEY, JSON.stringify([entry]));
      const payload = buildBackupPayload();
      expect(Array.isArray(payload.timeOff)).toBe(true);
      expect(payload.timeOff).toHaveLength(1);
      expect((payload.timeOff as TimeOffEntry[])[0]).toMatchObject({
        kind: "date",
        date: "2026-01-15",
        note: "Vacation",
      });
    });

    it("includes work locations for all stored years", () => {
      const loc2025 = { "2025-06-01": { location: "home", countryCode: "NL" } };
      const loc2026 = { "2026-02-24": { location: "office", countryCode: "DE" } };
      localStorage.setItem(`${WORK_LOCATIONS_PREFIX}2025`, JSON.stringify(loc2025));
      localStorage.setItem(`${WORK_LOCATIONS_PREFIX}2026`, JSON.stringify(loc2026));
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
      localStorage.setItem(TIME_TRACKING_STORAGE_KEYS.tasks, JSON.stringify(tasks));
      localStorage.setItem(TIME_TRACKING_STORAGE_KEYS.templates, JSON.stringify(templates));
      localStorage.setItem(TIME_TRACKING_STORAGE_KEYS.labels, JSON.stringify(labels));
      const payload = buildBackupPayload();
      expect(payload.tasks).toEqual(tasks);
      expect(payload.templates).toEqual(templates);
      expect(payload.labels).toEqual(labels);
    });

    it("omits tasks/templates/labels when stored value is not an array", () => {
      localStorage.setItem(TIME_TRACKING_STORAGE_KEYS.tasks, JSON.stringify({ bad: true }));
      const payload = buildBackupPayload();
      expect(payload.tasks).toBeUndefined();
    });

    it("excludes sections when include flags are false", () => {
      const entry: TimeOffEntry = {
        id: "e1",
        kind: "date",
        date: "2026-01-15",
        entryType: "vacation",
        flags: [],
        note: "Vacation",
      };
      localStorage.setItem(USER_STATE_KEY, JSON.stringify({ myTeam: 1 }));
      localStorage.setItem(TIME_OFF_ENTRIES_STORAGE_KEY, JSON.stringify([entry]));
      const payload = buildBackupPayload({ includeUserState: false, includeTimeOff: false });
      expect(payload.userState).toBeUndefined();
      expect(payload.timeOff).toBeUndefined();
    });

    it("filters tasks by year when year option is provided", () => {
      const tasks = [
        { id: "t1", text: "A", label: "l1", startTime: "2025-06-01T09:00" },
        { id: "t2", text: "B", label: "l1", startTime: "2026-02-24T09:00" },
      ];
      localStorage.setItem(TIME_TRACKING_STORAGE_KEYS.tasks, JSON.stringify(tasks));
      const payload = buildBackupPayload({ year: 2025 });
      expect(payload.tasks).toEqual([tasks[0]]);
    });

    it("filters work locations to the selected year", () => {
      const loc2025 = { "2025-06-01": { location: "home" } };
      const loc2026 = { "2026-02-24": { location: "office" } };
      localStorage.setItem(`${WORK_LOCATIONS_PREFIX}2025`, JSON.stringify(loc2025));
      localStorage.setItem(`${WORK_LOCATIONS_PREFIX}2026`, JSON.stringify(loc2026));
      const payload = buildBackupPayload({ year: 2025 });
      expect(payload.workLocations).toEqual({ "2025": loc2025 });
    });

    it("omits filtered tasks when none match the selected year", () => {
      const tasks = [{ id: "t1", text: "A", label: "l1", startTime: "2026-02-24T09:00" }];
      localStorage.setItem(TIME_TRACKING_STORAGE_KEYS.tasks, JSON.stringify(tasks));
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
        kind: "date",
        date: "2026-01-15",
        entryType: "vacation",
        flags: [],
        note: null,
      };
      localStorage.setItem(TIME_OFF_ENTRIES_STORAGE_KEY, JSON.stringify([entry]));
      expect(checkBackupDataPresence().hasTimeOff).toBe(true);
    });

    it("detects tasks and extracts their years", () => {
      const tasks = [
        { id: "t1", startTime: "2025-06-01T09:00" },
        { id: "t2", startTime: "2026-02-24T09:00" },
      ];
      localStorage.setItem(TIME_TRACKING_STORAGE_KEYS.tasks, JSON.stringify(tasks));
      const presence = checkBackupDataPresence();
      expect(presence.hasTasks).toBe(true);
      expect(presence.availableYears).toEqual([2026, 2025]);
    });

    it("detects work locations and includes their years", () => {
      localStorage.setItem(`${WORK_LOCATIONS_PREFIX}2025`, JSON.stringify({}));
      const presence = checkBackupDataPresence();
      expect(presence.hasWorkLocations).toBe(true);
      expect(presence.availableYears).toContain(2025);
    });

    it("merges task years and work location years, sorted newest-first", () => {
      localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.tasks,
        JSON.stringify([{ id: "t1", startTime: "2024-01-01T09:00" }]),
      );
      localStorage.setItem(`${WORK_LOCATIONS_PREFIX}2026`, JSON.stringify({}));
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
        kind: "date",
        date: "2026-01-15",
        entryType: "vacation",
        flags: [],
        note: "Vacation",
      };
      restoreAppBackup({ exportedAt: "", version: 1, timeOff: [entry] });
      const stored = localStorage.getItem(TIME_OFF_ENTRIES_STORAGE_KEY);
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toMatchObject({ kind: "date", date: "2026-01-15", note: "Vacation" });
    });

    it("writes work locations for each year", () => {
      const locs = { "2026": { "2026-02-24": { location: "home", countryCode: "NL" } } };
      restoreAppBackup({ exportedAt: "", version: 1, workLocations: locs });
      expect(JSON.parse(localStorage.getItem(`${WORK_LOCATIONS_PREFIX}2026`)!)).toEqual(
        locs["2026"],
      );
    });

    it("writes time tracking tasks, templates and labels", () => {
      const tasks = [{ id: "t1", text: "T", label: "l1", startTime: "2026-02-24T09:00" }];
      const templates = [{ id: "tp1", text: "T", label: "l1", start: "09:00", stop: "17:00" }];
      const labels = [{ id: "l1", name: "Work", color: "#198754" }];
      restoreAppBackup({ exportedAt: "", version: 1, tasks, templates, labels });
      expect(JSON.parse(localStorage.getItem(TIME_TRACKING_STORAGE_KEYS.tasks)!)).toEqual(tasks);
      expect(JSON.parse(localStorage.getItem(TIME_TRACKING_STORAGE_KEYS.templates)!)).toEqual(
        templates,
      );
      expect(JSON.parse(localStorage.getItem(TIME_TRACKING_STORAGE_KEYS.labels)!)).toEqual(labels);
    });

    it("preserves existing tasks from years not included in the backup payload", () => {
      const existingTasks = [
        { id: "t-2025", text: "A", label: "l1", startTime: "2025-06-01T09:00" },
        { id: "t-2026", text: "B", label: "l1", startTime: "2026-02-24T09:00" },
      ];
      const backupTasks = [
        { id: "t-2025-new", text: "A2", label: "l1", startTime: "2025-07-01T09:00" },
      ];

      localStorage.setItem(TIME_TRACKING_STORAGE_KEYS.tasks, JSON.stringify(existingTasks));
      restoreAppBackup({ exportedAt: "", version: 1, tasks: backupTasks });

      expect(JSON.parse(localStorage.getItem(TIME_TRACKING_STORAGE_KEYS.tasks)!)).toEqual([
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

      localStorage.setItem(TIME_TRACKING_STORAGE_KEYS.tasks, JSON.stringify(existingTasks));
      restoreAppBackup({ exportedAt: "", version: 1, tasks: backupTasks });

      expect(JSON.parse(localStorage.getItem(TIME_TRACKING_STORAGE_KEYS.tasks)!)).toEqual(
        backupTasks,
      );
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
