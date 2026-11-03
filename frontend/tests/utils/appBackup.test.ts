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
import type { IsoAlpha2 } from "@/types/countries";
import {
  ganttTasksCollection,
  labelsCollection,
  tasksCollection,
  templatesCollection,
  timeOffCollection,
  workLocationsCollection,
} from "@/db/collections";
import * as collectionsModule from "@/db/collections";
import { stripVirtualProps } from "@/db/persistence";

import { getPreferenceOwner } from "@/utils/preferenceStorage";
import { buildLocalSyncPushPayload, buildLocalPreferencesPayload } from "@/utils/syncClient";

const USER_STATE_KEY = USER_STATE_STORAGE_KEY;

function plainCollectionItems<T extends object>(items: T[]): Array<Record<string, unknown>> {
  return items.map((item) => stripVirtualProps(item) as Record<string, unknown>);
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

    it("does not export internal preference ownership", () => {
      localStorage.setItem(USER_STATE_KEY, JSON.stringify({ _accountOwner: "user-a", myTeam: 3 }));
      expect(buildBackupPayload().userState).toEqual({ myTeam: 3 });
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
      const loc2025 = { "2025-06-01": { countryCode: "NL" as IsoAlpha2 } };
      const loc2026 = { "2026-02-24": { countryCode: "DE" as IsoAlpha2 } };
      workLocationsCollection.insert({
        date: "2025-06-01",
        countryCode: "NL" as IsoAlpha2,
      });
      workLocationsCollection.insert({
        date: "2026-02-24",
        countryCode: "DE" as IsoAlpha2,
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

  it("round-trips linked tasks, Gantt tasks and labels through export and sync", async () => {
    vi.spyOn(window.location, "reload").mockImplementation(() => {});
    const label = { id: "l1", name: "Work", color: "#198754" };
    const gantt = {
      id: "g1",
      name: "Plan",
      label: "l1",
      start: "2026-01-01",
      end: "2026-01-02",
      progress: 0,
    };
    const task = {
      id: "t1",
      text: "Work",
      label: "l1",
      ganttTaskId: "g1",
      startTime: "2026-01-01T09:00",
    };
    labelsCollection.insert(label);
    ganttTasksCollection.insert(gantt);
    tasksCollection.insert(task);
    const payload = buildBackupPayload();
    expect(payload.tasks).toEqual([task]);
    expect(payload.ganttTasks).toEqual([gantt]);
    await restoreAppBackup(payload);
    expect(buildLocalSyncPushPayload().tasks[0]).toMatchObject({ gantt_task_id: "g1" });
    expect(buildLocalSyncPushPayload().gantt_tasks?.[0]).toMatchObject({ label_id: "l1" });
    expect(validateAppBackupPayload({ version: 1, tasks: [task] })).toBe(true);
    expect(validateAppBackupPayload({ version: 1, labels: [] })).toBe(false);
    expect(validateAppBackupPayload({ version: 1, ganttTasks: [] })).toBe(false);
    expect(validateAppBackupPayload({ version: 1, tasks: [task], ganttTasks: [] })).toBe(false);
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
        countryCode: "NL" as IsoAlpha2,
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
      expect(validateAppBackupPayload({ version: 1, userState: {} })).toBe(true);
    });

    it.each([
      {
        version: 1,
        labels: [
          { id: "l", name: "L", color: "#198754" },
          { id: "l", name: "L", color: "#198754" },
        ],
      },
      {
        version: 1,
        templates: [{ id: "t", text: "T", label: "missing", start: "09:00", stop: "17:00" }],
        labels: [],
      },
      {
        version: 1,
        ganttTasks: [
          {
            id: "g",
            name: "G",
            start: "2026-01-01",
            end: "2026-01-02",
            progress: 0,
            dependencies: "missing",
          },
        ],
      },
      { version: 99, tasks: [] },
      { version: 1, tasks: [null] },
      { version: 1, labels: [{ name: "Missing ID", color: "#198754" }] },
      { version: 1, tasks: [{ id: "t", text: "T", label: "", startTime: "2026-02-30T09:00" }] },
      {
        version: 1,
        timeOff: [
          {
            id: "e",
            entryKind: "weekly",
            weekday: 1.5,
            entryType: "vacation",
            entryFlag: "full_day",
            note: null,
          },
        ],
      },
      {
        version: 1,
        tasks: [
          { id: "t", text: "T", label: "", startTime: "2026-01-01T09:00", ganttTaskId: "missing" },
        ],
      },
      { version: 1, labels: [{ id: "l", name: "L", color: "bad" }] },
      { version: 1, workLocations: { "2026": { "2026-02-30": { countryCode: "NL" } } } },
    ])("rejects malformed backup %j before changing any data", async (invalid) => {
      vi.spyOn(window.location, "reload").mockImplementation(() => {});
      localStorage.setItem(USER_STATE_KEY, JSON.stringify({ myTeam: 5 }));
      const before = buildBackupPayload();
      const payload = { ...invalid, exportedAt: "", userState: { myTeam: 1 } };
      expect(validateAppBackupPayload(payload)).toBe(false);
      await expect(
        restoreAppBackup(payload as Parameters<typeof restoreAppBackup>[0]),
      ).rejects.toThrow();
      expect(buildBackupPayload()).toMatchObject({ ...before, exportedAt: expect.any(String) });
      expect(window.location.reload).not.toHaveBeenCalled();
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
      labelsCollection.insert({ id: "l1", name: "Work", color: "#198754" });
    });

    it("writes userState to localStorage and reloads", async () => {
      const state = { version: 2, myTeam: 1 };
      await restoreAppBackup({ exportedAt: "", version: 1, userState: state });
      expect(JSON.parse(localStorage.getItem(USER_STATE_KEY)!)).toMatchObject(state);
      expect(window.location.reload).toHaveBeenCalledOnce();
    });

    it.each(["user-a", undefined])(
      "binds imported owner %s to the destination account",
      async (sourceOwner) => {
        localStorage.setItem(
          USER_STATE_KEY,
          JSON.stringify({ _accountOwner: "user-b", myTeam: 1 }),
        );
        await restoreAppBackup({
          exportedAt: "",
          version: 1,
          userState: {
            _accountOwner: sourceOwner,
            myTeam: 4,
          },
        });
        expect(getPreferenceOwner()).toBe("user-b");
        expect(buildLocalPreferencesPayload("user-b")?.data.myTeam).toBe(4);
        expect(buildLocalPreferencesPayload("user-b")?.data).not.toHaveProperty("_accountOwner");
        expect(window.location.reload).toHaveBeenCalledOnce();
      },
    );

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

      it.each([false, true])(
        "reconciles explicitly empty domains (all domains: %s)",
        async (all) => {
          const server = {
            ...emptyPullResponse,
            labels: [
              {
                id: "server-only",
                name: "Old",
                color: "#198754",
                deleted_at: null,
                updated_at: "2026-01-01T00:00:00Z",
              },
            ],
            tasks: [{ id: "untouched", deleted_at: null }],
          };
          mockFetch
            .mockResolvedValueOnce({ ok: true, json: async () => server })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ results: {} }) });
          const payload = {
            version: 1 as const,
            exportedAt: "",
            labels: [],
            ...(all
              ? { tasks: [], templates: [], timeOff: [], workLocations: {}, ganttTasks: [] }
              : {}),
          };
          await restoreAppBackup(payload, mockFetch);
          expect(mockFetch).toHaveBeenCalledTimes(2);
          const body = JSON.parse(mockFetch.mock.calls[1]![1].body);
          expect(body.labels).toEqual([
            expect.objectContaining({ id: "server-only", action: "delete" }),
          ]);
          expect(body.tasks).toEqual(
            all ? [expect.objectContaining({ id: "untouched", action: "delete" })] : [],
          );
          expect(body.allow_bulk_delete).toBe(true);
        },
      );

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

      it("preloads every sync collection before building the push payload", async () => {
        // A collection this restore's payload never touches (e.g. tasks, when
        // only labels are being restored) must still be read in full before
        // buildLocalSyncPushPayload() runs — an unloaded collection reads as
        // empty, which would make the keep-local replace delete every
        // server-side record in that domain.
        const preloadSpy = vi.spyOn(collectionsModule, "preloadSyncCollections");
        const labels = [{ id: "l1", name: "Work", color: "#198754" }];
        mockFetch
          .mockResolvedValueOnce({ ok: true, json: async () => emptyPullResponse })
          .mockResolvedValueOnce({ ok: true, json: async () => ({ results: {} }) });

        await restoreAppBackup({ exportedAt: "", version: 1, labels }, mockFetch);

        expect(preloadSpy).toHaveBeenCalled();
      });

      it("does not throw, does not hit the network, and still reloads when the restored state is empty", async () => {
        // No collection sections in the payload: buildLocalSyncPushPayload()
        // produces an empty push, so there is nothing to reconcile with the
        // server and no reason to round-trip for it.
        const preload = vi.spyOn(collectionsModule, "preloadSyncCollections");
        await restoreAppBackup({ exportedAt: "", version: 1, userState: {} }, mockFetch);
        expect(preload).not.toHaveBeenCalled();

        expect(mockFetch).not.toHaveBeenCalled();
        expect(window.location.reload).toHaveBeenCalledOnce();
      });

      it("throws, does not reload, and queues the full replace payload (including allow_bulk_delete) in the outbox when the push fails", async () => {
        const labels = [{ id: "l1", name: "Work", color: "#198754" }];
        // The server has an extra label the local restore doesn't — the
        // queued replace payload must carry its delete plus the bulk-delete
        // opt-in, not just the create-only local payload.
        const pullResponseWithExtraLabel = {
          ...emptyPullResponse,
          labels: [
            {
              id: "server-only",
              name: "Old",
              color: "#000000",
              deleted_at: null,
              updated_at: "2026-01-01T00:00:00.000Z",
            },
          ],
        };
        mockFetch
          .mockResolvedValueOnce({ ok: true, json: async () => pullResponseWithExtraLabel }) // pull succeeds
          .mockResolvedValueOnce({ ok: false, status: 500 }); // push fails

        await expect(
          restoreAppBackup({ exportedAt: "", version: 1, labels }, mockFetch),
        ).rejects.toThrow();

        expect(window.location.reload).not.toHaveBeenCalled();
        const outbox = JSON.parse(localStorage.getItem(getSyncOutboxKey("user-1"))!);
        expect(outbox).toHaveLength(1);
        expect(outbox[0]!.allow_bulk_delete).toBe(true);
        expect(outbox[0]!.labels).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: "l1", action: "create" }),
            expect.objectContaining({ id: "server-only", action: "delete" }),
          ]),
        );
      });

      it("does not push deletes or creates for a domain the backup didn't include, even when local hasn't synced it yet", async () => {
        // Only `labels` is in the backup payload. `tasksCollection` is left
        // empty here to simulate a device that hasn't synced tasks yet, while
        // the server reports an existing task — the old whole-account replace
        // would have read the empty local tasks as "delete this on the
        // server", even though the backup never touched the tasks domain.
        const labels = [{ id: "l1", name: "Work", color: "#198754" }];
        const pullResponseWithServerTask = {
          ...emptyPullResponse,
          tasks: [
            {
              id: "server-task",
              text: "Existing",
              start_time: "2026-01-01T08:00:00.000Z",
              stop_time: null,
              deleted_at: null,
              updated_at: "2026-01-01T00:00:00.000Z",
            },
          ],
        };
        mockFetch
          .mockResolvedValueOnce({ ok: true, json: async () => pullResponseWithServerTask })
          .mockResolvedValueOnce({ ok: true, json: async () => ({ results: {} }) });

        await restoreAppBackup({ exportedAt: "", version: 1, labels }, mockFetch);

        const [, pushInit] = mockFetch.mock.calls[1]!;
        const pushBody = JSON.parse((pushInit as RequestInit).body as string);
        expect(pushBody.labels).toEqual([expect.objectContaining({ id: "l1", action: "create" })]);
        // The untouched tasks domain must carry neither the server's
        // existing task nor any delete for it.
        expect(pushBody.tasks).toEqual([]);
        expect(window.location.reload).toHaveBeenCalledOnce();
      });

      it("throws and does not reload when the server reports a per-record conflict", async () => {
        const labels = [{ id: "l1", name: "Work", color: "#198754" }];
        mockFetch
          .mockResolvedValueOnce({ ok: true, json: async () => emptyPullResponse })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              results: {
                labels: [
                  { id: "l1", status: "conflict", server_updated_at: "2026-01-03T00:00:00.000Z" },
                ],
              },
            }),
          });

        await expect(
          restoreAppBackup({ exportedAt: "", version: 1, labels }, mockFetch),
        ).rejects.toThrow();

        // A conflict means the record was NOT overwritten server-side, so
        // reloading now would show restored data the server doesn't actually
        // have — the local restore itself still stands either way.
        expect(window.location.reload).not.toHaveBeenCalled();
      });

      it("throws, does not reload, and queues nothing when the pre-push pull fails", async () => {
        const labels = [{ id: "l1", name: "Work", color: "#198754" }];
        mockFetch.mockResolvedValueOnce({ ok: false, status: 500 }); // pull fails

        await expect(
          restoreAppBackup({ exportedAt: "", version: 1, labels }, mockFetch),
        ).rejects.toThrow();

        expect(window.location.reload).not.toHaveBeenCalled();
        // No server snapshot to diff against, so there is nothing correct to
        // queue — queuing the create-only local payload would silently drop
        // the deletes a real replace would have needed.
        expect(localStorage.getItem(getSyncOutboxKey("user-1"))).toBeNull();
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
