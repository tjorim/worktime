import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTimeTrackingStorage } from "@/hooks/useTimeTrackingStorage";
import { tasksCollection, templatesCollection } from "@/db/collections";
import type { SyncPushPayload } from "@/utils/syncClient";

// Defined at module scope because vi.mock factories are hoisted before describe
// blocks, so the spy must be accessible at module level. It is reset in afterEach
// to prevent cross-test pollution.
const mockEnqueueChange = vi.fn<[SyncPushPayload], void>();

vi.mock("@/contexts/OngoingSyncContext", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/contexts/OngoingSyncContext")>();
  return {
    ...original,
    useOngoingSyncContext: () => ({
      isSyncing: false,
      lastSyncedAt: null,
      outboxCount: 0,
      enqueueChange: mockEnqueueChange,
    }),
  };
});

describe("useTimeTrackingStorage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    mockEnqueueChange.mockReset();
  });

  describe("addTask", () => {
    it("does not block starting a task when only invalid open raw tasks exist", async () => {
      // Insert a task with an invalid startTime directly into the collection.
      // isValidRawTask() will filter it out, so no "valid running task" exists.
      tasksCollection.insert({
        id: "invalid-open",
        text: "Broken legacy entry",
        label: "Support",
        startTime: "not-a-date",
        stopTime: undefined,
      });

      const { result } = renderHook(() => useTimeTrackingStorage());
      let added = false;

      await act(async () => {
        added = await result.current.addTask({
          id: "new-running-task",
          text: "Start stopwatch",
          label: "Support",
          startTime: "2026-02-07T08:00",
        });
      });

      expect(added).toBe(true);
    });

    it("blocks starting a task when a valid running task already exists", async () => {
      const { result } = renderHook(() => useTimeTrackingStorage());

      // Seed a running task via the hook API.
      await act(async () => {
        await result.current.addTask({
          id: "running-task",
          text: "Already running",
          label: "Support",
          startTime: "2026-02-07T07:30",
        });
      });

      let added = true;

      await act(async () => {
        added = await result.current.addTask({
          id: "new-running-task",
          text: "Should be blocked",
          label: "Support",
          startTime: "2026-02-07T08:00",
        });
      });

      expect(added).toBe(false);
    });

    it("allows adding a completed task even when a running task exists", async () => {
      const { result } = renderHook(() => useTimeTrackingStorage());

      await act(async () => {
        await result.current.addTask({
          id: "running-task",
          text: "Already running",
          label: "Support",
          startTime: "2026-02-07T07:30",
        });
      });

      let added = false;

      await act(async () => {
        added = await result.current.addTask({
          id: "completed-task",
          text: "Finished task",
          label: "Support",
          startTime: "2026-02-07T09:00",
          stopTime: "2026-02-07T10:00",
        });
      });

      expect(added).toBe(true);
      expect(result.current.tasks).toHaveLength(2);
    });
  });

  describe("updateTaskTimes", () => {
    it("updates start and stop times for an existing task", async () => {
      const { result } = renderHook(() => useTimeTrackingStorage());

      await act(async () => {
        await result.current.addTask({
          id: "task-1",
          text: "Original task",
          label: "Support",
          startTime: "2026-02-07T08:00",
          stopTime: "2026-02-07T10:00",
        });
      });

      act(() => {
        result.current.updateTaskTimes({
          id: "task-1",
          newStartTime: "2026-02-07T09:00",
          newStopTime: "2026-02-07T11:00",
        });
      });

      expect(result.current.tasks).toHaveLength(1);
      expect(result.current.tasks[0].startTime).toBe("2026-02-07T09:00");
      expect(result.current.tasks[0].stopTime).toBe("2026-02-07T11:00");
    });

    it("updates text and label alongside times", async () => {
      const { result } = renderHook(() => useTimeTrackingStorage());

      await act(async () => {
        await result.current.addTask({
          id: "task-1",
          text: "Original",
          label: "Support",
          startTime: "2026-02-07T08:00",
          stopTime: "2026-02-07T10:00",
        });
      });

      act(() => {
        result.current.updateTaskTimes({
          id: "task-1",
          newStartTime: "2026-02-07T08:00",
          newStopTime: "2026-02-07T10:00",
          newText: "Renamed",
          newLabel: "Dev",
        });
      });

      expect(result.current.tasks[0].text).toBe("Renamed");
      expect(result.current.tasks[0].label).toBe("Dev");
    });

    it("does not affect other tasks when updating one", async () => {
      const { result } = renderHook(() => useTimeTrackingStorage());

      await act(async () => {
        await result.current.addTask({
          id: "task-1",
          text: "First",
          label: "Support",
          startTime: "2026-02-07T08:00",
          stopTime: "2026-02-07T09:00",
        });
        await result.current.addTask({
          id: "task-2",
          text: "Second",
          label: "Dev",
          startTime: "2026-02-07T10:00",
          stopTime: "2026-02-07T11:00",
        });
      });

      act(() => {
        result.current.updateTaskTimes({
          id: "task-1",
          newStartTime: "2026-02-07T08:30",
          newStopTime: "2026-02-07T09:30",
        });
      });

      expect(result.current.tasks).toHaveLength(2);
      const t2 = result.current.tasks.find((t) => t.id === "task-2");
      expect(t2?.text).toBe("Second");
      expect(t2?.startTime).toBe("2026-02-07T10:00");
    });
  });

  describe("removeTask", () => {
    it("removes a task by id", async () => {
      const { result } = renderHook(() => useTimeTrackingStorage());

      await act(async () => {
        await result.current.addTask({
          id: "task-1",
          text: "Keep me",
          label: "Support",
          startTime: "2026-02-07T08:00",
          stopTime: "2026-02-07T09:00",
        });
        await result.current.addTask({
          id: "task-2",
          text: "Remove me",
          label: "Dev",
          startTime: "2026-02-07T10:00",
          stopTime: "2026-02-07T11:00",
        });
      });

      act(() => {
        result.current.removeTask("task-2");
      });

      expect(result.current.tasks).toHaveLength(1);
      expect(result.current.tasks[0].id).toBe("task-1");
    });

    it("is a no-op when the id does not match any task", async () => {
      const { result } = renderHook(() => useTimeTrackingStorage());

      await act(async () => {
        await result.current.addTask({
          id: "task-1",
          text: "Only task",
          label: "Support",
          startTime: "2026-02-07T08:00",
          stopTime: "2026-02-07T09:00",
        });
      });

      act(() => {
        result.current.removeTask("nonexistent");
      });

      expect(result.current.tasks).toHaveLength(1);
    });
  });

  describe("toggleBreak", () => {
    it("sets includesBreak to true on a task", async () => {
      const { result } = renderHook(() => useTimeTrackingStorage());

      await act(async () => {
        await result.current.addTask({
          id: "task-1",
          text: "Morning work",
          label: "Support",
          startTime: "2026-02-07T08:00",
          stopTime: "2026-02-07T14:00",
        });
      });

      expect(result.current.tasks[0].includesBreak).toBeUndefined();

      act(() => {
        result.current.toggleBreak("task-1", true);
      });

      expect(result.current.tasks[0].includesBreak).toBe(true);
    });

    it("removes includesBreak when toggling from true to false", async () => {
      const { result } = renderHook(() => useTimeTrackingStorage());

      await act(async () => {
        await result.current.addTask({
          id: "task-1",
          text: "Morning work",
          label: "Support",
          startTime: "2026-02-07T08:00",
          stopTime: "2026-02-07T14:00",
        });
      });

      act(() => { result.current.toggleBreak("task-1", true); });
      act(() => { result.current.toggleBreak("task-1", false); });

      expect(result.current.tasks[0].includesBreak).toBeUndefined();
    });

    it("is a no-op when the task id does not exist", async () => {
      const { result } = renderHook(() => useTimeTrackingStorage());

      await act(async () => {
        await result.current.addTask({
          id: "task-1",
          text: "Only task",
          label: "Support",
          startTime: "2026-02-07T08:00",
          stopTime: "2026-02-07T14:00",
        });
      });

      act(() => {
        result.current.toggleBreak("nonexistent", true);
      });

      expect(result.current.tasks).toHaveLength(1);
      expect(result.current.tasks[0].includesBreak).toBeUndefined();
    });
  });

  describe("task validation", () => {
    it("filters out tasks with invalid startTime format", () => {
      // Insert tasks directly into the collection (bypassing hook validation).
      tasksCollection.insert({ id: "bad", text: "Bad", label: "Support", startTime: "invalid", stopTime: undefined });
      tasksCollection.insert({ id: "good", text: "Good", label: "Support", startTime: "2026-02-07T08:00", stopTime: "2026-02-07T09:00" });

      const { result } = renderHook(() => useTimeTrackingStorage());

      expect(result.current.tasks).toHaveLength(1);
      expect(result.current.tasks[0].id).toBe("good");
    });

    it("filters out tasks with cross-day date ranges", () => {
      tasksCollection.insert({
        id: "cross-day",
        text: "Cross day",
        label: "Support",
        startTime: "2026-02-07T23:00",
        stopTime: "2026-02-08T01:00",
      });

      const { result } = renderHook(() => useTimeTrackingStorage());

      expect(result.current.tasks).toHaveLength(0);
    });

    it("filters out tasks with non-boolean includesBreak", () => {
      // Insert tasks directly to bypass the hook's insert validation.
      tasksCollection.insert({ id: "truthy-string", text: "Bad break", label: "Support", startTime: "2026-02-07T08:00", stopTime: "2026-02-07T12:00", includesBreak: "yes" as unknown as true });
      tasksCollection.insert({ id: "numeric", text: "Numeric break", label: "Support", startTime: "2026-02-07T13:00", stopTime: "2026-02-07T14:00", includesBreak: 1 as unknown as true });
      tasksCollection.insert({ id: "valid-true", text: "Valid true", label: "Support", startTime: "2026-02-07T08:00", stopTime: "2026-02-07T09:00", includesBreak: true });
      tasksCollection.insert({ id: "valid-false", text: "Valid false", label: "Support", startTime: "2026-02-07T10:00", stopTime: "2026-02-07T11:00", includesBreak: false });
      tasksCollection.insert({ id: "valid-absent", text: "No field", label: "Support", startTime: "2026-02-07T14:00", stopTime: "2026-02-07T15:00" });

      const { result } = renderHook(() => useTimeTrackingStorage());

      expect(result.current.tasks).toHaveLength(3);
      const ids = result.current.tasks.map((t) => t.id);
      expect(ids).toContain("valid-true");
      expect(ids).toContain("valid-false");
      expect(ids).toContain("valid-absent");
    });

    it("filters out tasks with empty label", () => {
      tasksCollection.insert({
        id: "no-label",
        text: "No label",
        label: "  ",
        startTime: "2026-02-07T08:00",
        stopTime: "2026-02-07T09:00",
      });

      const { result } = renderHook(() => useTimeTrackingStorage());

      expect(result.current.tasks).toHaveLength(0);
    });
  });

  describe("template CRUD", () => {
    it("adds a template", () => {
      vi.stubGlobal("crypto", {
        randomUUID: () => "tpl-uuid",
      } as unknown as Crypto);

      const { result } = renderHook(() => useTimeTrackingStorage());

      act(() => {
        result.current.addTemplate({
          text: "Morning standup",
          label: "Meeting",
          start: "09:00",
          stop: "09:30",
        });
      });

      expect(result.current.templates).toHaveLength(1);
      expect(result.current.templates[0]).toMatchObject({
        id: "tpl-uuid",
        text: "Morning standup",
        label: "Meeting",
        start: "09:00",
        stop: "09:30",
      });
    });

    it("updates an existing template", () => {
      templatesCollection.insert({ id: "tpl-1", text: "Old name", label: "Support", start: "08:00", stop: "09:00" });

      const { result } = renderHook(() => useTimeTrackingStorage());

      act(() => {
        result.current.updateTemplate({
          id: "tpl-1",
          template: { text: "New name", label: "Dev", start: "10:00", stop: "11:00" },
        });
      });

      expect(result.current.templates).toHaveLength(1);
      expect(result.current.templates[0].text).toBe("New name");
      expect(result.current.templates[0].label).toBe("Dev");
    });

    it("deletes a template by id", () => {
      templatesCollection.insert({ id: "tpl-1", text: "Keep", label: "Support", start: "08:00", stop: "09:00" });
      templatesCollection.insert({ id: "tpl-2", text: "Delete", label: "Dev", start: "10:00", stop: "11:00" });

      const { result } = renderHook(() => useTimeTrackingStorage());

      act(() => {
        result.current.deleteTemplate("tpl-2");
      });

      expect(result.current.templates).toHaveLength(1);
      expect(result.current.templates[0].id).toBe("tpl-1");
    });
  });

  describe("label management", () => {
    it("updates labels via updateLabels", () => {
      const { result } = renderHook(() => useTimeTrackingStorage());

      act(() => {
        result.current.updateLabels([
          { id: "lbl-1", name: "Support", color: "#3B82F6" },
          { id: "lbl-2", name: "Dev", color: "#10B981" },
        ]);
      });

      expect(result.current.labels).toHaveLength(2);
      expect(result.current.labels[0].name).toBe("Support");
      expect(result.current.labels[1].name).toBe("Dev");
    });

    it("sanitizes duplicate label names on update", () => {
      const { result } = renderHook(() => useTimeTrackingStorage());

      act(() => {
        result.current.updateLabels([
          { id: "lbl-1", name: "Support", color: "#3B82F6" },
          { id: "lbl-2", name: "support", color: "#10B981" },
        ]);
      });

      // sanitizeLabels deduplicates case-insensitively, keeping the first
      expect(result.current.labels).toHaveLength(1);
      expect(result.current.labels[0].name).toBe("Support");
    });
  });

  describe("updateTemplates", () => {
    it("replaces all templates", () => {
      const { result } = renderHook(() => useTimeTrackingStorage());

      act(() => {
        result.current.updateTemplates([
          { id: "tpl-1", text: "Template", label: "Support", start: "08:00", stop: "09:00" },
        ]);
      });

      expect(result.current.templates).toHaveLength(1);
      expect(result.current.templates[0].id).toBe("tpl-1");
    });

    it("replaces existing templates", () => {
      templatesCollection.insert({ id: "old", text: "Old", label: "Support", start: "08:00", stop: "09:00" });

      const { result } = renderHook(() => useTimeTrackingStorage());
      expect(result.current.templates).toHaveLength(1);

      act(() => {
        result.current.updateTemplates([
          { id: "new", text: "New", label: "Dev", start: "09:00", stop: "10:00" },
        ]);
      });

      expect(result.current.templates).toHaveLength(1);
      expect(result.current.templates[0].id).toBe("new");
    });
  });

  // ---------------------------------------------------------------------------
  // Sync enqueue assertions
  // ---------------------------------------------------------------------------

  describe("sync payload enqueue", () => {
    it("enqueues a create task payload when addTask succeeds", async () => {
      const { result } = renderHook(() => useTimeTrackingStorage());

      await act(async () => {
        await result.current.addTask({
          id: "sync-task-1",
          text: "Sync me",
          label: "Dev",
          startTime: "2026-03-01T09:00",
          stopTime: "2026-03-01T10:00",
        });
      });

      expect(mockEnqueueChange).toHaveBeenCalledOnce();
      const payload = mockEnqueueChange.mock.calls[0]![0];
      expect(payload.tasks).toHaveLength(1);
      expect(payload.tasks[0]).toMatchObject({
        id: "sync-task-1",
        action: "create",
        text: "Sync me",
        label_id: "Dev",
      });
    });

    it("does not enqueue when addTask is blocked (duplicate running task)", async () => {
      const { result } = renderHook(() => useTimeTrackingStorage());

      // Seed a running task via the hook so there's a valid blocker.
      await act(async () => {
        await result.current.addTask({
          id: "running",
          text: "Running",
          label: "Dev",
          startTime: "2026-03-01T08:00",
        });
      });
      mockEnqueueChange.mockReset(); // ignore the seed enqueue

      await act(async () => {
        await result.current.addTask({
          id: "blocked-task",
          text: "Should be blocked",
          label: "Dev",
          startTime: "2026-03-01T09:00",
        });
      });

      expect(mockEnqueueChange).not.toHaveBeenCalled();
    });

    it("enqueues an update task payload when updateTaskTimes is called", async () => {
      const { result } = renderHook(() => useTimeTrackingStorage());

      await act(async () => {
        await result.current.addTask({ id: "t1", text: "Original", label: "Dev", startTime: "2026-03-01T09:00", stopTime: "2026-03-01T10:00" });
      });
      mockEnqueueChange.mockReset();

      act(() => {
        result.current.updateTaskTimes({
          id: "t1",
          newStartTime: "2026-03-01T09:30",
          newStopTime: "2026-03-01T10:30",
        });
      });

      expect(mockEnqueueChange).toHaveBeenCalledOnce();
      const payload = mockEnqueueChange.mock.calls[0]![0];
      expect(payload.tasks[0]).toMatchObject({ id: "t1", action: "update" });
    });

    it("enqueues a delete task payload when removeTask is called", async () => {
      const { result } = renderHook(() => useTimeTrackingStorage());

      await act(async () => {
        await result.current.addTask({ id: "del-task", text: "Delete me", label: "Dev", startTime: "2026-03-01T09:00", stopTime: "2026-03-01T10:00" });
      });
      mockEnqueueChange.mockReset();

      act(() => {
        result.current.removeTask("del-task");
      });

      expect(mockEnqueueChange).toHaveBeenCalledOnce();
      const payload = mockEnqueueChange.mock.calls[0]![0];
      expect(payload.tasks[0]).toMatchObject({ id: "del-task", action: "delete" });
    });

    it("enqueues an update task payload with correct includes_break when toggleBreak is called", async () => {
      const { result } = renderHook(() => useTimeTrackingStorage());

      await act(async () => {
        await result.current.addTask({ id: "break-task", text: "Break task", label: "Dev", startTime: "2026-03-01T09:00", stopTime: "2026-03-01T17:00" });
      });
      mockEnqueueChange.mockReset();

      act(() => {
        result.current.toggleBreak("break-task", true);
      });

      expect(mockEnqueueChange).toHaveBeenCalledOnce();
      const payload = mockEnqueueChange.mock.calls[0]![0];
      expect(payload.tasks[0]).toMatchObject({ id: "break-task", action: "update", includes_break: true });
    });
  });
});
