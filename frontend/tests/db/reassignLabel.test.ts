import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  ganttTasksCollection,
  labelsCollection,
  reassignAndDeleteLabel,
  replaceTimeTrackingSettings,
  runWriteBatch,
  setSyncCollectionAuth,
  tasksCollection,
  templatesCollection,
} from "@/db/collections";

const body = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string);

/**
 * Answers sync pushes with `respond`; every other request (the collections refetch
 * after sign-in, snapshot refreshes) fails so it can never replace the seeded rows.
 */
function stubServer(respond: (call: number) => Response | Promise<Response>) {
  const pushes: unknown[][] = [];
  const fetch = vi.fn((...args: unknown[]) => {
    if (!String(args[0]).includes("/api/sync/push")) {
      return Promise.resolve(new Response("{}", { status: 500 }));
    }
    pushes.push(args);
    return Promise.resolve(respond(pushes.length - 1));
  });
  vi.stubGlobal("fetch", fetch);
  return { fetch, pushes };
}
const ok = () => new Response(JSON.stringify({ results: {} }));

function seed(taskCount = 2) {
  runWriteBatch(tasksCollection, true, () =>
    tasksCollection.utils.writeUpsert([
      ...Array.from({ length: taskCount }, (_, i) => ({
        id: `task-${i}`,
        text: "Work",
        label: "old",
        startTime: "2026-02-07T08:00",
        stopTime: "2026-02-07T09:00",
      })),
      {
        id: "other-task",
        text: "Other",
        label: "other",
        startTime: "2026-02-08T08:00",
        stopTime: "2026-02-08T09:00",
      },
    ]),
  );
  templatesCollection.utils.writeUpsert([
    { id: "tpl", text: "Template", label: "old", start: "08:00", stop: "09:00" },
  ]);
  runWriteBatch(ganttTasksCollection, true, () =>
    ganttTasksCollection.utils.writeUpsert([
      {
        id: "gantt",
        name: "Plan",
        start: "2026-02-01",
        end: "2026-02-10",
        progress: 0,
        label: "old",
      },
    ]),
  );
}

beforeEach(async () => {
  setSyncCollectionAuth(null);
  await replaceTimeTrackingSettings("templates", []);
  await replaceTimeTrackingSettings("labels", [
    { id: "old", name: "Old", color: "#123456" },
    { id: "new", name: "New", color: "#654321" },
    { id: "other", name: "Other", color: "#abcdef" },
  ]);
});

afterEach(() => {
  setSyncCollectionAuth(null);
  vi.unstubAllGlobals();
  tasksCollection.utils.writeDelete(tasksCollection.toArray.map((task) => task.id));
  ganttTasksCollection.utils.writeDelete(ganttTasksCollection.toArray.map((task) => task.id));
});

it("moves tasks, templates and Gantt tasks first, then deletes the label", async () => {
  seed();
  setSyncCollectionAuth("reassign-user", "token");
  const { pushes } = stubServer(ok);

  await reassignAndDeleteLabel("old", "new");

  expect(pushes).toHaveLength(2);
  const move = body(pushes[0]!);
  expect(move.labels).toEqual([]);
  // Label-only partial updates: nothing else about a record is overwritten.
  for (const item of [...move.tasks, ...move.templates, ...move.gantt_tasks]) {
    expect(item).toEqual({
      id: expect.any(String),
      action: "update",
      client_updated_at: expect.any(String),
      label_id: "new",
    });
  }
  expect(move.tasks.map((item: { id: string }) => item.id)).toEqual(["task-0", "task-1"]);
  expect(move.templates).toHaveLength(1);
  expect(move.gantt_tasks).toHaveLength(1);

  const removal = body(pushes[1]!);
  expect(removal.labels).toEqual([expect.objectContaining({ id: "old", action: "delete" })]);
  expect(removal.tasks).toEqual([]);

  expect(labelsCollection.has("old")).toBe(false);
  expect(tasksCollection.toArray.filter((task) => task.label === "new")).toHaveLength(2);
  expect(tasksCollection.get("other-task")?.label).toBe("other");
  expect(templatesCollection.get("tpl")?.label).toBe("new");
  expect(ganttTasksCollection.get("gantt")?.label).toBe("new");
});

it("splits a large move into capped chunks before deleting", async () => {
  seed(1001);
  setSyncCollectionAuth("reassign-user", "token");
  const { pushes } = stubServer(ok);

  await reassignAndDeleteLabel("old", "new");

  expect(pushes.map((call) => body(call).tasks.length)).toEqual([1000, 1, 0]);
  expect(body(pushes[2]!).labels).toHaveLength(1);
});

it("keeps the label when the server rejects part of the move", async () => {
  seed();
  setSyncCollectionAuth("reassign-user", "token");
  const { pushes } = stubServer(
    () =>
      new Response(
        JSON.stringify({
          results: {
            tasks: [
              { id: "task-0", status: "ok" },
              { id: "task-1", status: "conflict" },
            ],
          },
        }),
      ),
  );

  await expect(reassignAndDeleteLabel("old", "new")).rejects.toMatchObject({
    code: "SETTINGS_PARTIAL",
    conflicts: 1,
  });

  // The move stopped before any label deletion was sent.
  expect(pushes).toHaveLength(1);
  expect(body(pushes[0]!).labels).toEqual([]);
  expect(labelsCollection.has("old")).toBe(true);
});

it("changes nothing when the first request fails", async () => {
  seed();
  setSyncCollectionAuth("reassign-user", "token");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

  await expect(reassignAndDeleteLabel("old", "new")).rejects.toThrow("offline");

  expect(labelsCollection.has("old")).toBe(true);
  expect(tasksCollection.get("task-0")?.label).toBe("old");
  expect(templatesCollection.get("tpl")?.label).toBe("old");
});

it("works without an account by rewriting the local rows", async () => {
  seed();
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);

  await reassignAndDeleteLabel("old", "new");

  expect(fetch).not.toHaveBeenCalled();
  expect(labelsCollection.has("old")).toBe(false);
  expect(tasksCollection.get("task-0")?.label).toBe("new");
  expect(ganttTasksCollection.get("gantt")?.label).toBe("new");
});

it("rejects a missing or identical replacement", async () => {
  seed();
  await expect(reassignAndDeleteLabel("old", "old")).rejects.toThrow("Unknown label");
  await expect(reassignAndDeleteLabel("old", "ghost")).rejects.toThrow("replacement");
  await expect(reassignAndDeleteLabel("ghost", "new")).rejects.toThrow("Unknown label");
  expect(labelsCollection.has("old")).toBe(true);
  expect(tasksCollection.get("task-0")?.label).toBe("old");
});
