import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTimeTrackingStorage } from "@/hooks/useTimeTrackingStorage";
import { labelsCollection, tasksCollection, templatesCollection } from "@/db/collections";

let uniqueCounter = 0;

function nextId(prefix: string): string {
  uniqueCounter += 1;
  return `${prefix}-${uniqueCounter}`;
}

function clearCollectionById(collection: {
  toArray: Array<{ id: string }>;
  has: (id: string) => boolean;
  delete: (id: string) => void;
}) {
  const items = [...collection.toArray];
  for (const item of items) {
    try {
      if (collection.has(item.id)) {
        collection.delete(item.id);
      }
    } catch {
      // Ignore rows already removed during teardown.
    }
  }
}

describe("useTimeTrackingStorage", () => {
  beforeEach(() => {
    clearCollectionById(tasksCollection);
    clearCollectionById(templatesCollection);
    clearCollectionById(labelsCollection);
  });

  afterEach(() => {
    cleanup();
    clearCollectionById(tasksCollection);
    clearCollectionById(templatesCollection);
    clearCollectionById(labelsCollection);
    vi.unstubAllGlobals();
  });

  describe("addTask", () => {
    it("does not block starting a task when only invalid open raw tasks exist", async () => {
      const invalidId = nextId("invalid-open");
      const runningId = nextId("new-running-task");
      // Insert a task with an invalid startTime directly into the collection.
      // isValidRawTask() will filter it out, so no "valid running task" exists.
      tasksCollection.insert({
        id: invalidId,
        text: "Broken legacy entry",
        label: "Support",
        startTime: "not-a-date",
        stopTime: undefined,
      });

      const { result } = renderHook(() => useTimeTrackingStorage());
      let added = false;

      await act(async () => {
        added = await result.current.addTask({
          id: runningId,
          text: "Start stopwatch",
          label: "Support",
          startTime: "2026-02-07T08:00",
        });
      });

      expect(added).toBe(true);
    });

    it("blocks starting a task when a valid running task already exists", async () => {
      const existingId = nextId("running-task");
      const blockedId = nextId("blocked-task");
      const { result } = renderHook(() => useTimeTrackingStorage());

      // Seed a running task via the hook API.
      await act(async () => {
        await result.current.addTask({
          id: existingId,
          text: "Already running",
          label: "Support",
          startTime: "2026-02-07T07:30",
        });
      });
      await waitFor(() => {
        expect(result.current.tasks.some((task) => task.id === existingId)).toBe(true);
      });

      let added = true;

      await act(async () => {
        added = await result.current.addTask({
          id: blockedId,
          text: "Should be blocked",
          label: "Support",
          startTime: "2026-02-07T08:00",
        });
      });

      expect(added).toBe(false);
    });

    it("allows adding a completed task even when a running task exists", async () => {
      const existingId = nextId("running-task");
      const completedId = nextId("completed-task");
      const { result } = renderHook(() => useTimeTrackingStorage());

      await act(async () => {
        await result.current.addTask({
          id: existingId,
          text: "Already running",
          label: "Support",
          startTime: "2026-02-07T07:30",
        });
      });
      await waitFor(() => {
        expect(result.current.tasks.some((task) => task.id === existingId)).toBe(true);
      });

      let added = false;

      await act(async () => {
        added = await result.current.addTask({
          id: completedId,
          text: "Finished task",
          label: "Support",
          startTime: "2026-02-07T09:00",
          stopTime: "2026-02-07T10:00",
        });
      });

      expect(added).toBe(true);
      await waitFor(() => {
        expect(result.current.tasks.some((task) => task.id === existingId)).toBe(true);
        expect(result.current.tasks.some((task) => task.id === completedId)).toBe(true);
      });
    });
  });

  describe("updateTaskTimes", () => {
    it("updates start and stop times for an existing task", async () => {
      const taskId = nextId("task");
      const { result } = renderHook(() => useTimeTrackingStorage());

      await act(async () => {
        await result.current.addTask({
          id: taskId,
          text: "Original task",
          label: "Support",
          startTime: "2026-02-07T08:00",
          stopTime: "2026-02-07T10:00",
        });
      });
      await waitFor(() => {
        expect(result.current.tasks.some((task) => task.id === taskId)).toBe(true);
      });

      act(() => {
        result.current.updateTaskTimes({
          id: taskId,
          newStartTime: "2026-02-07T09:00",
          newStopTime: "2026-02-07T11:00",
        });
      });

      await waitFor(() => {
        const task = result.current.tasks.find((entry) => entry.id === taskId);
        expect(task?.startTime).toBe("2026-02-07T09:00");
        expect(task?.stopTime).toBe("2026-02-07T11:00");
      });
    });

    it("updates text and label alongside times", async () => {
      const taskId = nextId("task");
      const { result } = renderHook(() => useTimeTrackingStorage());

      await act(async () => {
        await result.current.addTask({
          id: taskId,
          text: "Original",
          label: "Support",
          startTime: "2026-02-07T08:00",
          stopTime: "2026-02-07T10:00",
        });
      });
      await waitFor(() => {
        expect(result.current.tasks.some((task) => task.id === taskId)).toBe(true);
      });

      act(() => {
        result.current.updateTaskTimes({
          id: taskId,
          newStartTime: "2026-02-07T08:00",
          newStopTime: "2026-02-07T10:00",
          newText: "Renamed",
          newLabel: "Dev",
        });
      });

      await waitFor(() => {
        const task = result.current.tasks.find((entry) => entry.id === taskId);
        expect(task?.text).toBe("Renamed");
        expect(task?.label).toBe("Dev");
      });
    });

    it("does not affect other tasks when updating one", async () => {
      const firstId = nextId("task");
      const secondId = nextId("task");
      const { result } = renderHook(() => useTimeTrackingStorage());

      await act(async () => {
        await result.current.addTask({
          id: firstId,
          text: "First",
          label: "Support",
          startTime: "2026-02-07T08:00",
          stopTime: "2026-02-07T09:00",
        });
        await result.current.addTask({
          id: secondId,
          text: "Second",
          label: "Dev",
          startTime: "2026-02-07T10:00",
          stopTime: "2026-02-07T11:00",
        });
      });
      await waitFor(() => {
        expect(result.current.tasks.some((task) => task.id === firstId)).toBe(true);
        expect(result.current.tasks.some((task) => task.id === secondId)).toBe(true);
      });

      act(() => {
        result.current.updateTaskTimes({
          id: firstId,
          newStartTime: "2026-02-07T08:30",
          newStopTime: "2026-02-07T09:30",
        });
      });

      await waitFor(() => {
        const t2 = result.current.tasks.find((t) => t.id === secondId);
        expect(t2?.text).toBe("Second");
        expect(t2?.startTime).toBe("2026-02-07T10:00");
      });
    });
  });

  describe("removeTask", () => {
    it("removes a task by id", async () => {
      const keepId = nextId("task");
      const deleteId = nextId("task");
      const { result } = renderHook(() => useTimeTrackingStorage());

      await act(async () => {
        await result.current.addTask({
          id: keepId,
          text: "Keep me",
          label: "Support",
          startTime: "2026-02-07T08:00",
          stopTime: "2026-02-07T09:00",
        });
        await result.current.addTask({
          id: deleteId,
          text: "Remove me",
          label: "Dev",
          startTime: "2026-02-07T10:00",
          stopTime: "2026-02-07T11:00",
        });
      });
      await waitFor(() => {
        expect(result.current.tasks.some((task) => task.id === keepId)).toBe(true);
        expect(result.current.tasks.some((task) => task.id === deleteId)).toBe(true);
      });

      act(() => {
        result.current.removeTask(deleteId);
      });

      await waitFor(() => {
        expect(result.current.tasks.some((task) => task.id === keepId)).toBe(true);
        expect(result.current.tasks.some((task) => task.id === deleteId)).toBe(false);
      });
    });

    it("is a no-op when the id does not match any task", async () => {
      const taskId = nextId("task");
      const { result } = renderHook(() => useTimeTrackingStorage());

      await act(async () => {
        await result.current.addTask({
          id: taskId,
          text: "Only task",
          label: "Support",
          startTime: "2026-02-07T08:00",
          stopTime: "2026-02-07T09:00",
        });
      });
      await waitFor(() => {
        expect(result.current.tasks.some((task) => task.id === taskId)).toBe(true);
      });

      act(() => {
        result.current.removeTask(nextId("nonexistent"));
      });

      await waitFor(() => {
        expect(result.current.tasks.some((task) => task.id === taskId)).toBe(true);
      });
    });
  });

  describe("toggleBreak", () => {
    it("sets includesBreak to true on a task", async () => {
      const taskId = nextId("task");
      const { result } = renderHook(() => useTimeTrackingStorage());

      await act(async () => {
        await result.current.addTask({
          id: taskId,
          text: "Morning work",
          label: "Support",
          startTime: "2026-02-07T08:00",
          stopTime: "2026-02-07T14:00",
        });
      });
      await waitFor(() => {
        expect(result.current.tasks.some((task) => task.id === taskId)).toBe(true);
      });

      expect(
        result.current.tasks.find((task) => task.id === taskId)?.includesBreak,
      ).toBeUndefined();

      act(() => {
        result.current.toggleBreak(taskId, true);
      });

      await waitFor(() => {
        expect(result.current.tasks.find((task) => task.id === taskId)?.includesBreak).toBe(true);
      });
    });

    it("removes includesBreak when toggling from true to false", async () => {
      const taskId = nextId("task");
      const { result } = renderHook(() => useTimeTrackingStorage());

      await act(async () => {
        await result.current.addTask({
          id: taskId,
          text: "Morning work",
          label: "Support",
          startTime: "2026-02-07T08:00",
          stopTime: "2026-02-07T14:00",
        });
      });
      await waitFor(() => {
        expect(result.current.tasks.some((task) => task.id === taskId)).toBe(true);
      });

      act(() => {
        result.current.toggleBreak(taskId, true);
      });
      act(() => {
        result.current.toggleBreak(taskId, false);
      });

      await waitFor(() => {
        expect(
          result.current.tasks.find((task) => task.id === taskId)?.includesBreak,
        ).toBeUndefined();
      });
    });

    it("is a no-op when the task id does not exist", async () => {
      const taskId = nextId("task");
      const { result } = renderHook(() => useTimeTrackingStorage());

      await act(async () => {
        await result.current.addTask({
          id: taskId,
          text: "Only task",
          label: "Support",
          startTime: "2026-02-07T08:00",
          stopTime: "2026-02-07T14:00",
        });
      });
      await waitFor(() => {
        expect(result.current.tasks.some((task) => task.id === taskId)).toBe(true);
      });

      act(() => {
        result.current.toggleBreak(nextId("nonexistent"), true);
      });

      await waitFor(() => {
        expect(result.current.tasks.some((task) => task.id === taskId)).toBe(true);
        expect(
          result.current.tasks.find((task) => task.id === taskId)?.includesBreak,
        ).toBeUndefined();
      });
    });
  });

  describe("task validation", () => {
    it("filters out tasks with invalid startTime format", async () => {
      const badId = nextId("bad");
      const goodId = nextId("good");
      // Insert tasks directly into the collection (bypassing hook validation).
      tasksCollection.insert({
        id: badId,
        text: "Bad",
        label: "Support",
        startTime: "invalid",
        stopTime: undefined,
      });
      tasksCollection.insert({
        id: goodId,
        text: "Good",
        label: "Support",
        startTime: "2026-02-07T08:00",
        stopTime: "2026-02-07T09:00",
      });

      const { result } = renderHook(() => useTimeTrackingStorage());

      await waitFor(() => {
        const ids = result.current.tasks.map((task) => task.id);
        expect(ids).toContain(goodId);
        expect(ids).not.toContain(badId);
      });
    });

    it("filters out tasks with cross-day date ranges", async () => {
      const taskId = nextId("cross-day");
      tasksCollection.insert({
        id: taskId,
        text: "Cross day",
        label: "Support",
        startTime: "2026-02-07T23:00",
        stopTime: "2026-02-08T01:00",
      });

      const { result } = renderHook(() => useTimeTrackingStorage());

      await waitFor(() => {
        expect(result.current.tasks.some((task) => task.id === taskId)).toBe(false);
      });
    });

    it("filters out tasks with non-boolean includesBreak", async () => {
      const truthyId = nextId("truthy-string");
      const numericId = nextId("numeric");
      const validTrueId = nextId("valid-true");
      const validFalseId = nextId("valid-false");
      const validAbsentId = nextId("valid-absent");
      // Insert tasks directly to bypass the hook's insert validation.
      tasksCollection.insert({
        id: truthyId,
        text: "Bad break",
        label: "Support",
        startTime: "2026-02-07T08:00",
        stopTime: "2026-02-07T12:00",
        includesBreak: "yes" as unknown as true,
      });
      tasksCollection.insert({
        id: numericId,
        text: "Numeric break",
        label: "Support",
        startTime: "2026-02-07T13:00",
        stopTime: "2026-02-07T14:00",
        includesBreak: 1 as unknown as true,
      });
      tasksCollection.insert({
        id: validTrueId,
        text: "Valid true",
        label: "Support",
        startTime: "2026-02-07T08:00",
        stopTime: "2026-02-07T09:00",
        includesBreak: true,
      });
      tasksCollection.insert({
        id: validFalseId,
        text: "Valid false",
        label: "Support",
        startTime: "2026-02-07T10:00",
        stopTime: "2026-02-07T11:00",
        includesBreak: false,
      });
      tasksCollection.insert({
        id: validAbsentId,
        text: "No field",
        label: "Support",
        startTime: "2026-02-07T14:00",
        stopTime: "2026-02-07T15:00",
      });

      const { result } = renderHook(() => useTimeTrackingStorage());

      await waitFor(() => {
        const ids = result.current.tasks.map((t) => t.id);
        expect(ids).toContain(validTrueId);
        expect(ids).toContain(validFalseId);
        expect(ids).toContain(validAbsentId);
        expect(ids).not.toContain(truthyId);
        expect(ids).not.toContain(numericId);
      });
    });

    it("filters out tasks with empty label", async () => {
      const taskId = nextId("no-label");
      tasksCollection.insert({
        id: taskId,
        text: "No label",
        label: "  ",
        startTime: "2026-02-07T08:00",
        stopTime: "2026-02-07T09:00",
      });

      const { result } = renderHook(() => useTimeTrackingStorage());

      await waitFor(() => {
        expect(result.current.tasks.some((task) => task.id === taskId)).toBe(false);
      });
    });
  });

  describe("template CRUD", () => {
    it("adds a template", () => {
      const templateId = nextId("tpl");
      vi.stubGlobal("crypto", {
        randomUUID: () => templateId,
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
        id: templateId,
        text: "Morning standup",
        label: "Meeting",
        start: "09:00",
        stop: "09:30",
      });
    });

    it("updates an existing template", async () => {
      const templateId = nextId("tpl");
      templatesCollection.insert({
        id: templateId,
        text: "Old name",
        label: "Support",
        start: "08:00",
        stop: "09:00",
      });

      const { result } = renderHook(() => useTimeTrackingStorage());
      await waitFor(() => {
        expect(result.current.templates.some((template) => template.id === templateId)).toBe(true);
      });

      act(() => {
        result.current.updateTemplate({
          id: templateId,
          template: { text: "New name", label: "Dev", start: "10:00", stop: "11:00" },
        });
      });

      await waitFor(() => {
        const template = result.current.templates.find((entry) => entry.id === templateId);
        expect(template?.text).toBe("New name");
        expect(template?.label).toBe("Dev");
      });
    });

    it("deletes a template by id", async () => {
      const keepId = nextId("tpl");
      const deleteId = nextId("tpl");
      templatesCollection.insert({
        id: keepId,
        text: "Keep",
        label: "Support",
        start: "08:00",
        stop: "09:00",
      });
      templatesCollection.insert({
        id: deleteId,
        text: "Delete",
        label: "Dev",
        start: "10:00",
        stop: "11:00",
      });

      const { result } = renderHook(() => useTimeTrackingStorage());
      await waitFor(() => {
        expect(result.current.templates.some((template) => template.id === keepId)).toBe(true);
        expect(result.current.templates.some((template) => template.id === deleteId)).toBe(true);
      });

      act(() => {
        result.current.deleteTemplate(deleteId);
      });

      await waitFor(() => {
        expect(result.current.templates.some((template) => template.id === keepId)).toBe(true);
        expect(result.current.templates.some((template) => template.id === deleteId)).toBe(false);
      });
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

    it("resets labels when updateLabels is called with an empty list", () => {
      const { result } = renderHook(() => useTimeTrackingStorage());

      act(() => {
        result.current.updateLabels([{ id: "lbl-1", name: "Support", color: "#3B82F6" }]);
      });
      expect(result.current.labels).toHaveLength(1);

      act(() => {
        result.current.updateLabels([]);
      });

      expect(result.current.labels).toEqual([]);
    });
  });

  describe("updateTemplates", () => {
    it("replaces all templates", () => {
      const { result } = renderHook(() => useTimeTrackingStorage());
      const templateId = nextId("tpl");

      act(() => {
        result.current.updateTemplates([
          { id: templateId, text: "Template", label: "Support", start: "08:00", stop: "09:00" },
        ]);
      });

      expect(result.current.templates).toHaveLength(1);
      expect(result.current.templates[0].id).toBe(templateId);
    });

    it("replaces existing templates", async () => {
      const oldId = nextId("tpl-old");
      const newId = nextId("tpl-new");
      templatesCollection.insert({
        id: oldId,
        text: "Old",
        label: "Support",
        start: "08:00",
        stop: "09:00",
      });

      const { result } = renderHook(() => useTimeTrackingStorage());
      await waitFor(() => {
        expect(result.current.templates.some((template) => template.id === oldId)).toBe(true);
      });

      act(() => {
        result.current.updateTemplates([
          { id: newId, text: "New", label: "Dev", start: "09:00", stop: "10:00" },
        ]);
      });

      await waitFor(() => {
        expect(result.current.templates.some((template) => template.id === oldId)).toBe(false);
        expect(result.current.templates.some((template) => template.id === newId)).toBe(true);
      });
    });

    it("resets templates when updateTemplates is called with an empty list", async () => {
      const existingId = nextId("tpl-existing");
      templatesCollection.insert({
        id: existingId,
        text: "Existing",
        label: "Support",
        start: "08:00",
        stop: "09:00",
      });

      const { result } = renderHook(() => useTimeTrackingStorage());
      await waitFor(() => {
        expect(result.current.templates.some((template) => template.id === existingId)).toBe(true);
      });

      act(() => {
        result.current.updateTemplates([]);
      });

      await waitFor(() => {
        expect(result.current.templates).toEqual([]);
      });
    });
  });
});
