import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clear, get, set } from "idb-keyval";
import {
  getLoadedSnapshot,
  hydrateSyncCollections,
  purgeSnapshotsOnOwnerChange,
  resetHydrationForTests,
  startPersistingSyncCollections,
  stopPersistingSyncCollections,
  whenHydrated,
  type PersistableCollection,
} from "@/db/persistence";

const OWNER_KEY = "worktime_collection_snapshot_owner";
const snapshotKey = (name: string) => `worktime_collection_snapshot_${name}`;

/** Stand-in for a TanStack DB collection with a controllable change stream. */
function fakeCollection<T>(items: T[] = []) {
  let current = items;
  const listeners = new Set<() => void>();
  return {
    get toArray() {
      return current;
    },
    subscribeChanges(cb: () => void) {
      listeners.add(cb);
      return { unsubscribe: () => listeners.delete(cb) };
    },
    /** Test helper: change the contents and notify subscribers. */
    setItems(next: T[]) {
      current = next;
      for (const cb of listeners) cb();
    },
  };
}

beforeEach(async () => {
  await clear();
  resetHydrationForTests();
  stopPersistingSyncCollections();
  vi.useRealTimers();
});

describe("hydrateSyncCollections", () => {
  it("loads a stored snapshot so the queryFn can return it", async () => {
    await set(snapshotKey("tasks"), { version: 1, items: [{ id: "t1" }] });

    await hydrateSyncCollections(["tasks"]);

    expect(getLoadedSnapshot("tasks")).toEqual([{ id: "t1" }]);
  });

  it("ignores a snapshot written by an incompatible version", async () => {
    // Hydrating rows the current code cannot read would be worse than showing
    // nothing and refetching.
    await set(snapshotKey("tasks"), { version: 999, items: [{ id: "t1" }] });

    await hydrateSyncCollections(["tasks"]);

    expect(getLoadedSnapshot("tasks")).toBeNull();
  });

  it("reports no snapshot for a collection that has never been stored", async () => {
    await hydrateSyncCollections(["tasks"]);
    expect(getLoadedSnapshot("tasks")).toBeNull();
  });

  it("resolves whenHydrated only after the snapshots are read", async () => {
    await set(snapshotKey("tasks"), { version: 1, items: [{ id: "t1" }] });

    const hydration = hydrateSyncCollections(["tasks"]);
    // The queryFn awaits this exact promise before deciding what to return —
    // that ordering is what stops a cold start from committing an empty
    // collection over a full local history.
    await whenHydrated();
    await hydration;

    expect(getLoadedSnapshot("tasks")).toEqual([{ id: "t1" }]);
  });
});

describe("startPersistingSyncCollections", () => {
  it("writes a snapshot after a change settles", async () => {
    vi.useFakeTimers();
    const tasks = fakeCollection<{ id: string }>([]);
    startPersistingSyncCollections({ tasks } as unknown as Record<
      string,
      PersistableCollection<never>
    >);

    tasks.setItems([{ id: "t1" }]);
    await vi.advanceTimersByTimeAsync(600);
    vi.useRealTimers();
    // idb-keyval resolves on its own microtask queue.
    await new Promise((r) => setTimeout(r, 0));

    expect(await get(snapshotKey("tasks"))).toEqual({ version: 1, items: [{ id: "t1" }] });
  });

  it("coalesces a burst of changes into one write", async () => {
    vi.useFakeTimers();
    const tasks = fakeCollection<{ id: string }>([]);
    startPersistingSyncCollections({ tasks } as unknown as Record<
      string,
      PersistableCollection<never>
    >);

    tasks.setItems([{ id: "t1" }]);
    tasks.setItems([{ id: "t1" }, { id: "t2" }]);
    tasks.setItems([{ id: "t1" }, { id: "t2" }, { id: "t3" }]);
    await vi.advanceTimersByTimeAsync(600);
    vi.useRealTimers();
    await new Promise((r) => setTimeout(r, 0));

    // Only the settled state is stored, not each intermediate step.
    expect(await get(snapshotKey("tasks"))).toEqual({
      version: 1,
      items: [{ id: "t1" }, { id: "t2" }, { id: "t3" }],
    });
  });
});

describe("purgeSnapshotsOnOwnerChange", () => {
  it("records the owner on first run without purging", async () => {
    expect(await purgeSnapshotsOnOwnerChange("user-1", ["tasks"])).toBe(false);
    expect(await get(OWNER_KEY)).toBe("user-1");
  });

  it("keeps the snapshots when the same user signs in again", async () => {
    await set(OWNER_KEY, "user-1");
    await set(snapshotKey("tasks"), { version: 1, items: [{ id: "t1" }] });

    expect(await purgeSnapshotsOnOwnerChange("user-1", ["tasks"])).toBe(false);
    expect(await get(snapshotKey("tasks"))).toBeDefined();
  });

  it("keeps anonymous data when that user signs in", async () => {
    // Data entered before signing in belongs to the person signing in, and
    // uploading it is exactly what first sync is for. Purging here would throw
    // away whatever someone entered while trying the app out.
    await set(OWNER_KEY, "anonymous");
    await set(snapshotKey("tasks"), { version: 1, items: [{ id: "t1" }] });

    expect(await purgeSnapshotsOnOwnerChange("user-1", ["tasks"])).toBe(false);
    expect(await get(snapshotKey("tasks"))).toBeDefined();
    expect(await get(OWNER_KEY)).toBe("user-1");
  });

  it("clears the in-memory snapshots too when purging", async () => {
    // The stored keys and the in-memory map are two copies of the same
    // records, and the pull fallback reads the in-memory one. Purging only
    // IndexedDB would let user A's rows render in user B's session the first
    // time a pull fails for B.
    await set(snapshotKey("tasks"), { version: 1, items: [{ id: "a-task" }] });
    await hydrateSyncCollections(["tasks"]);
    expect(getLoadedSnapshot("tasks")).toEqual([{ id: "a-task" }]);
    await set(OWNER_KEY, "user-a");

    expect(await purgeSnapshotsOnOwnerChange("user-b", ["tasks"])).toBe(true);

    expect(await get(snapshotKey("tasks"))).toBeUndefined();
    expect(getLoadedSnapshot("tasks")).toBeNull();
  });

  it("keeps the in-memory snapshots when there is nothing to purge", async () => {
    // anonymous -> signed in: the data belongs to the person signing in, so it
    // must survive for first sync to upload it.
    await set(snapshotKey("tasks"), { version: 1, items: [{ id: "own-task" }] });
    await hydrateSyncCollections(["tasks"]);
    await set(OWNER_KEY, "anonymous");

    expect(await purgeSnapshotsOnOwnerChange("user-a", ["tasks"])).toBe(false);
    expect(getLoadedSnapshot("tasks")).toEqual([{ id: "own-task" }]);
  });

  it("purges when a different user signs in on the same device", async () => {
    await set(OWNER_KEY, "user-1");
    await set(snapshotKey("tasks"), { version: 1, items: [{ id: "t1" }] });

    expect(await purgeSnapshotsOnOwnerChange("user-2", ["tasks"])).toBe(true);
    expect(await get(snapshotKey("tasks"))).toBeUndefined();
    expect(await get(OWNER_KEY)).toBe("user-2");
  });

  it("purges on sign-out so a signed-out device keeps no one's records", async () => {
    await set(OWNER_KEY, "user-1");
    await set(snapshotKey("tasks"), { version: 1, items: [{ id: "t1" }] });

    expect(await purgeSnapshotsOnOwnerChange(null, ["tasks"])).toBe(true);
    expect(await get(snapshotKey("tasks"))).toBeUndefined();
    expect(await get(OWNER_KEY)).toBe("anonymous");
  });

  it("reports no purge when storage is unavailable", async () => {
    vi.spyOn(indexedDB, "open").mockImplementation(() => {
      throw new Error("IndexedDB disabled");
    });

    // Private browsing or disabled storage: persistence is an enhancement, so
    // the app must keep working from memory rather than throwing.
    expect(await purgeSnapshotsOnOwnerChange("user-1", ["tasks"])).toBe(false);
  });
});
