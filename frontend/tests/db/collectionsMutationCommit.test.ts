/**
 * Mutation handlers must commit their own rows to the collection's base state.
 * A query collection drops the optimistic layer when a handler resolves, so
 * without that write an offline or signed-out edit would vanish — and relying
 * on TanStack DB's implicit post-handler refetch is deprecated.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { tasksCollection } from "@/db/collections";

const task = (id: string, text = "Task") => ({
  id,
  text,
  label: "",
  startTime: "2026-01-01T09:00",
  stopTime: null,
  includesBreak: false,
});

describe("db/collections mutation handlers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps inserted, updated and deleted rows after the handler resolves", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await tasksCollection.insert(task("commit-1")).isPersisted.promise;
    expect(tasksCollection.get("commit-1")?.text).toBe("Task");

    await tasksCollection.update("commit-1", (draft) => {
      draft.text = "Renamed";
    }).isPersisted.promise;
    expect(tasksCollection.get("commit-1")?.text).toBe("Renamed");

    await tasksCollection.delete("commit-1").isPersisted.promise;
    expect(tasksCollection.has("commit-1")).toBe(false);

    expect(warn.mock.calls.flat().join(" ")).not.toContain("DEPRECATED");
  });

  it("does not throw when a delete targets a row already removed from the synced state", async () => {
    await tasksCollection.insert(task("commit-2")).isPersisted.promise;
    const deletion = tasksCollection.delete("commit-2");
    // A pull lands between the optimistic delete and the handler's commit.
    tasksCollection.utils.writeDelete("commit-2");

    await expect(deletion.isPersisted.promise).resolves.toBeDefined();
    expect(tasksCollection.has("commit-2")).toBe(false);
  });
});
