import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTimeTrackingStorage } from "@/hooks/useTimeTrackingStorage";
import { TIME_TRACKING_STORAGE_KEYS } from "@/constants/storageKeys";

describe("useTimeTrackingStorage", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  describe("addTask", () => {
    it("does not block starting a task when only invalid open raw tasks exist", async () => {
      window.localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.tasks,
        JSON.stringify([
          {
            id: "invalid-open",
            text: "Broken legacy entry",
            label: "Support",
            startTime: "not-a-date",
            stopTime: null,
          },
        ]),
      );

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
      window.localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.tasks,
        JSON.stringify([
          {
            id: "running-task",
            text: "Already running",
            label: "Support",
            startTime: "2026-02-07T07:30",
            stopTime: null,
          },
        ]),
      );

      const { result } = renderHook(() => useTimeTrackingStorage());
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
      window.localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.tasks,
        JSON.stringify([
          {
            id: "running-task",
            text: "Already running",
            label: "Support",
            startTime: "2026-02-07T07:30",
            stopTime: null,
          },
        ]),
      );

      const { result } = renderHook(() => useTimeTrackingStorage());
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
    it("updates start and stop times for an existing task", () => {
      window.localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.tasks,
        JSON.stringify([
          {
            id: "task-1",
            text: "Original task",
            label: "Support",
            startTime: "2026-02-07T08:00",
            stopTime: "2026-02-07T10:00",
          },
        ]),
      );

      const { result } = renderHook(() => useTimeTrackingStorage());

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

    it("updates text and label alongside times", () => {
      window.localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.tasks,
        JSON.stringify([
          {
            id: "task-1",
            text: "Original",
            label: "Support",
            startTime: "2026-02-07T08:00",
            stopTime: "2026-02-07T10:00",
          },
        ]),
      );

      const { result } = renderHook(() => useTimeTrackingStorage());

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

    it("does not affect other tasks when updating one", () => {
      window.localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.tasks,
        JSON.stringify([
          {
            id: "task-1",
            text: "First",
            label: "Support",
            startTime: "2026-02-07T08:00",
            stopTime: "2026-02-07T09:00",
          },
          {
            id: "task-2",
            text: "Second",
            label: "Dev",
            startTime: "2026-02-07T10:00",
            stopTime: "2026-02-07T11:00",
          },
        ]),
      );

      const { result } = renderHook(() => useTimeTrackingStorage());

      act(() => {
        result.current.updateTaskTimes({
          id: "task-1",
          newStartTime: "2026-02-07T08:30",
          newStopTime: "2026-02-07T09:30",
        });
      });

      expect(result.current.tasks).toHaveLength(2);
      expect(result.current.tasks[1].text).toBe("Second");
      expect(result.current.tasks[1].startTime).toBe("2026-02-07T10:00");
    });
  });

  describe("removeTask", () => {
    it("removes a task by id", () => {
      window.localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.tasks,
        JSON.stringify([
          {
            id: "task-1",
            text: "Keep me",
            label: "Support",
            startTime: "2026-02-07T08:00",
            stopTime: "2026-02-07T09:00",
          },
          {
            id: "task-2",
            text: "Remove me",
            label: "Dev",
            startTime: "2026-02-07T10:00",
            stopTime: "2026-02-07T11:00",
          },
        ]),
      );

      const { result } = renderHook(() => useTimeTrackingStorage());

      act(() => {
        result.current.removeTask("task-2");
      });

      expect(result.current.tasks).toHaveLength(1);
      expect(result.current.tasks[0].id).toBe("task-1");
    });

    it("is a no-op when the id does not match any task", () => {
      window.localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.tasks,
        JSON.stringify([
          {
            id: "task-1",
            text: "Only task",
            label: "Support",
            startTime: "2026-02-07T08:00",
            stopTime: "2026-02-07T09:00",
          },
        ]),
      );

      const { result } = renderHook(() => useTimeTrackingStorage());

      act(() => {
        result.current.removeTask("nonexistent");
      });

      expect(result.current.tasks).toHaveLength(1);
    });
  });

  describe("toggleBreak", () => {
    it("sets includesBreak to true on a task", () => {
      window.localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.tasks,
        JSON.stringify([
          {
            id: "task-1",
            text: "Morning work",
            label: "Support",
            startTime: "2026-02-07T08:00",
            stopTime: "2026-02-07T14:00",
          },
        ]),
      );

      const { result } = renderHook(() => useTimeTrackingStorage());
      expect(result.current.tasks[0].includesBreak).toBeUndefined();

      act(() => {
        result.current.toggleBreak("task-1", true);
      });

      expect(result.current.tasks[0].includesBreak).toBe(true);
    });

    it("removes includesBreak when toggling from true to false", () => {
      window.localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.tasks,
        JSON.stringify([
          {
            id: "task-1",
            text: "Morning work",
            label: "Support",
            startTime: "2026-02-07T08:00",
            stopTime: "2026-02-07T14:00",
            includesBreak: true,
          },
        ]),
      );

      const { result } = renderHook(() => useTimeTrackingStorage());
      expect(result.current.tasks[0].includesBreak).toBe(true);

      act(() => {
        result.current.toggleBreak("task-1", false);
      });

      expect(result.current.tasks[0].includesBreak).toBeUndefined();
    });

    it("is a no-op when the task id does not exist", () => {
      window.localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.tasks,
        JSON.stringify([
          {
            id: "task-1",
            text: "Only task",
            label: "Support",
            startTime: "2026-02-07T08:00",
            stopTime: "2026-02-07T14:00",
          },
        ]),
      );

      const { result } = renderHook(() => useTimeTrackingStorage());

      act(() => {
        result.current.toggleBreak("nonexistent", true);
      });

      expect(result.current.tasks).toHaveLength(1);
      expect(result.current.tasks[0].includesBreak).toBeUndefined();
    });
  });

  describe("task validation", () => {
    it("filters out tasks with invalid startTime format", () => {
      window.localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.tasks,
        JSON.stringify([
          { id: "bad", text: "Bad", label: "Support", startTime: "invalid", stopTime: null },
          {
            id: "good",
            text: "Good",
            label: "Support",
            startTime: "2026-02-07T08:00",
            stopTime: "2026-02-07T09:00",
          },
        ]),
      );

      const { result } = renderHook(() => useTimeTrackingStorage());

      expect(result.current.tasks).toHaveLength(1);
      expect(result.current.tasks[0].id).toBe("good");
    });

    it("filters out tasks with cross-day date ranges", () => {
      window.localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.tasks,
        JSON.stringify([
          {
            id: "cross-day",
            text: "Cross day",
            label: "Support",
            startTime: "2026-02-07T23:00",
            stopTime: "2026-02-08T01:00",
          },
        ]),
      );

      const { result } = renderHook(() => useTimeTrackingStorage());

      expect(result.current.tasks).toHaveLength(0);
    });

    it("filters out tasks with non-boolean includesBreak", () => {
      window.localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.tasks,
        JSON.stringify([
          {
            id: "truthy-string",
            text: "Bad break",
            label: "Support",
            startTime: "2026-02-07T08:00",
            stopTime: "2026-02-07T12:00",
            includesBreak: "yes",
          },
          {
            id: "numeric",
            text: "Numeric break",
            label: "Support",
            startTime: "2026-02-07T13:00",
            stopTime: "2026-02-07T14:00",
            includesBreak: 1,
          },
          {
            id: "valid-true",
            text: "Valid true",
            label: "Support",
            startTime: "2026-02-07T08:00",
            stopTime: "2026-02-07T09:00",
            includesBreak: true,
          },
          {
            id: "valid-false",
            text: "Valid false",
            label: "Support",
            startTime: "2026-02-07T10:00",
            stopTime: "2026-02-07T11:00",
            includesBreak: false,
          },
          {
            id: "valid-absent",
            text: "No field",
            label: "Support",
            startTime: "2026-02-07T14:00",
            stopTime: "2026-02-07T15:00",
          },
        ]),
      );

      const { result } = renderHook(() => useTimeTrackingStorage());

      expect(result.current.tasks).toHaveLength(3);
      const ids = result.current.tasks.map((t) => t.id);
      expect(ids).toContain("valid-true");
      expect(ids).toContain("valid-false");
      expect(ids).toContain("valid-absent");
    });

    it("filters out tasks with empty label", () => {
      window.localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.tasks,
        JSON.stringify([
          {
            id: "no-label",
            text: "No label",
            label: "  ",
            startTime: "2026-02-07T08:00",
            stopTime: "2026-02-07T09:00",
          },
        ]),
      );

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
      expect(result.current.templates[0]).toEqual({
        id: "tpl-uuid",
        text: "Morning standup",
        label: "Meeting",
        start: "09:00",
        stop: "09:30",
      });

      vi.unstubAllGlobals();
    });

    it("updates an existing template", () => {
      window.localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.templates,
        JSON.stringify([
          { id: "tpl-1", text: "Old name", label: "Support", start: "08:00", stop: "09:00" },
        ]),
      );

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
      window.localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.templates,
        JSON.stringify([
          { id: "tpl-1", text: "Keep", label: "Support", start: "08:00", stop: "09:00" },
          { id: "tpl-2", text: "Delete", label: "Dev", start: "10:00", stop: "11:00" },
        ]),
      );

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
      window.localStorage.setItem(
        TIME_TRACKING_STORAGE_KEYS.templates,
        JSON.stringify([
          { id: "old", text: "Old", label: "Support", start: "08:00", stop: "09:00" },
        ]),
      );

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
});
