import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COLLECTION_SCHEMA_VERSION,
  guardStartupMarkReady,
  purgePersistedDataOnOwnerChange,
  resetPersistenceForTests,
  syncCollectionPersistence,
  whenPersistenceReady,
} from "@/db/persistence";
import {
  PERSISTED_COLLECTION_OWNER_KEY,
  PERSISTED_COLLECTION_PURGE_PENDING_KEY,
} from "@/constants/storageKeys";

/**
 * The methods `validatePersistenceAdapter` requires before it will accept an
 * adapter, plus the optional ones the persistence runtime feature-detects by
 * property presence. Missing an optional one does not throw — it silently
 * disables metadata loading and stream positions — so they are asserted here.
 */
const ADAPTER_METHODS = [
  "loadSubset",
  "applyCommittedTx",
  "ensureIndex",
  "loadCollectionMetadata",
  "scanRows",
  "markIndexRemoved",
  "getStreamPosition",
] as const;

/** OPFS is not available under happy-dom, which is the degraded path. */
function stubOpfs(removeEntry: (name: string) => Promise<void>): void {
  vi.stubGlobal("navigator", {
    ...navigator,
    storage: { getDirectory: () => Promise.resolve({ removeEntry }) },
  });
  vi.stubGlobal("Worker", class {});
}

beforeEach(() => {
  localStorage.clear();
  resetPersistenceForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("syncCollectionPersistence", () => {
  it("exposes every adapter method the persistence runtime looks for", () => {
    const adapter = syncCollectionPersistence.adapter as unknown as Record<string, unknown>;
    for (const method of ADAPTER_METHODS) {
      expect(typeof adapter[method], method).toBe("function");
    }
  });

  it("resolves a per-collection persistence with the same adapter surface", () => {
    const resolved = syncCollectionPersistence.resolvePersistenceForCollection?.({
      collectionId: "worktime/tasks",
      mode: "sync-present",
      schemaVersion: COLLECTION_SCHEMA_VERSION,
    });

    expect(resolved).toBeDefined();
    const adapter = resolved?.adapter as unknown as Record<string, unknown>;
    for (const method of ADAPTER_METHODS) {
      expect(typeof adapter[method], method).toBe("function");
    }
  });
});

describe("degrading when the local store cannot be opened", () => {
  // Private browsing, a storage-disabled profile, or a browser without OPFS
  // sync access handles. Persistence is an enhancement, so the app has to keep
  // working from memory rather than have its sync pipe start rejecting.
  it("reports ready rather than hanging or throwing", async () => {
    await expect(whenPersistenceReady()).resolves.toBeUndefined();
  });

  it("hydrates to an empty store instead of failing", async () => {
    await expect(
      syncCollectionPersistence.adapter.loadSubset("worktime/tasks", {}),
    ).resolves.toEqual([]);
  });

  it("accepts and discards writes instead of rejecting them", async () => {
    await expect(
      syncCollectionPersistence.adapter.applyCommittedTx("worktime/tasks", {
        txId: "tx-1",
        term: 1,
        seq: 1,
        rowVersion: 1,
        mutations: [{ type: "insert", key: "t1", value: { id: "t1" } }],
      }),
    ).resolves.toBeUndefined();
  });

  it("reports the stream position of a store that was never written", async () => {
    await expect(
      syncCollectionPersistence.adapter.getStreamPosition?.("worktime/tasks"),
    ).resolves.toEqual({ latestTerm: 0, latestSeq: 0, latestRowVersion: 0 });
  });
});

describe("guardStartupMarkReady", () => {
  /** Build the options shape the guard wraps, capturing what the inner sync sees. */
  function wrap(markReady: () => void) {
    let captured: (() => void) | undefined;
    const guarded = guardStartupMarkReady({
      id: "worktime/tasks",
      sync: {
        rowUpdateMode: "partial",
        sync: (params: { markReady: () => void }) => {
          captured = params.markReady;
        },
      },
    });
    (guarded.sync as { sync: (p: { markReady: () => void }) => unknown }).sync({ markReady });
    return () => captured?.();
  }

  function transitionError(from: string): Error {
    const err = new Error(
      `Invalid collection status transition from "${from}" to "ready" for collection "worktime/tasks"`,
    );
    err.name = "CollectionStateError";
    return err;
  }

  it("passes a normal markReady straight through", () => {
    const markReady = vi.fn();
    wrap(markReady)();
    expect(markReady).toHaveBeenCalledOnce();
  });

  it("preserves the rest of the sync config", () => {
    const guarded = guardStartupMarkReady({ sync: { rowUpdateMode: "partial", sync: () => {} } });
    expect((guarded.sync as { rowUpdateMode: string }).rowUpdateMode).toBe("partial");
  });

  it("swallows a markReady on a collection cleaned up mid-startup", () => {
    // The persisted wrapper defers markReady behind its async startup without
    // re-checking whether the collection was torn down. Unguarded this escapes
    // as an unhandled rejection and fails the whole run even though every
    // assertion passed.
    const run = wrap(() => {
      throw transitionError("cleaned-up");
    });
    expect(run).not.toThrow();
  });

  it("rethrows any other invalid transition", () => {
    const run = wrap(() => {
      throw transitionError("error");
    });
    expect(run).toThrow(/from "error" to "ready"/);
  });

  it("rethrows unrelated errors", () => {
    const run = wrap(() => {
      throw new TypeError("something else broke");
    });
    expect(run).toThrow(TypeError);
  });
});

describe("purgePersistedDataOnOwnerChange", () => {
  it("records the owner on first run without purging", async () => {
    expect(await purgePersistedDataOnOwnerChange("user-1")).toBe(false);
    expect(localStorage.getItem(PERSISTED_COLLECTION_OWNER_KEY)).toBe("user-1");
  });

  it("keeps the store when the same user signs in again", async () => {
    localStorage.setItem(PERSISTED_COLLECTION_OWNER_KEY, "user-1");
    const removeEntry = vi.fn(() => Promise.resolve());
    stubOpfs(removeEntry);

    expect(await purgePersistedDataOnOwnerChange("user-1")).toBe(false);
    expect(removeEntry).not.toHaveBeenCalled();
  });

  it("keeps anonymous data when that user signs in", async () => {
    // Data entered before signing in belongs to the person signing in, and
    // uploading it is exactly what first sync is for. Purging here would throw
    // away whatever someone entered while trying the app out.
    localStorage.setItem(PERSISTED_COLLECTION_OWNER_KEY, "anonymous");
    const removeEntry = vi.fn(() => Promise.resolve());
    stubOpfs(removeEntry);

    expect(await purgePersistedDataOnOwnerChange("user-1")).toBe(false);
    expect(removeEntry).not.toHaveBeenCalled();
    expect(localStorage.getItem(PERSISTED_COLLECTION_OWNER_KEY)).toBe("user-1");
  });

  it("deletes the store when a different user signs in on the same device", async () => {
    localStorage.setItem(PERSISTED_COLLECTION_OWNER_KEY, "user-1");
    const removeEntry = vi.fn(() => Promise.resolve());
    stubOpfs(removeEntry);

    expect(await purgePersistedDataOnOwnerChange("user-2")).toBe(true);
    expect(removeEntry).toHaveBeenCalledWith("worktime-collections.sqlite");
    expect(localStorage.getItem(PERSISTED_COLLECTION_OWNER_KEY)).toBe("user-2");
  });

  it("deletes the store on sign-out so a signed-out device keeps no one's records", async () => {
    localStorage.setItem(PERSISTED_COLLECTION_OWNER_KEY, "user-1");
    const removeEntry = vi.fn(() => Promise.resolve());
    stubOpfs(removeEntry);

    expect(await purgePersistedDataOnOwnerChange(null)).toBe(true);
    expect(removeEntry).toHaveBeenCalledWith("worktime-collections.sqlite");
    expect(localStorage.getItem(PERSISTED_COLLECTION_OWNER_KEY)).toBe("anonymous");
  });

  it("still reports the purge when the store file was never written", async () => {
    localStorage.setItem(PERSISTED_COLLECTION_OWNER_KEY, "user-1");
    stubOpfs(() => Promise.reject(Object.assign(new Error("missing"), { name: "NotFoundError" })));

    // Nothing on disk is already the desired end state — the caller still has
    // to reload, because user-1's rows are in memory either way.
    expect(await purgePersistedDataOnOwnerChange("user-2")).toBe(true);
    expect(localStorage.getItem(PERSISTED_COLLECTION_OWNER_KEY)).toBe("user-2");
    expect(localStorage.getItem(PERSISTED_COLLECTION_PURGE_PENDING_KEY)).toBeNull();
  });
});

describe("purge when the store cannot be deleted", () => {
  // `removeEntry` fails while another tab of this origin still holds a sync
  // access handle on the file. Treating that as success would reopen the
  // previous account's rows under the new owner on the next load.
  const locked = () =>
    stubOpfs(() =>
      Promise.reject(Object.assign(new Error("locked"), { name: "NoModificationAllowedError" })),
    );

  it("does not hand the store to the new owner", async () => {
    localStorage.setItem(PERSISTED_COLLECTION_OWNER_KEY, "user-1");
    locked();

    expect(await purgePersistedDataOnOwnerChange("user-2")).toBe(true);
    // Still user-1, so the transition is retried on the next auth change
    // instead of being silently marked done.
    expect(localStorage.getItem(PERSISTED_COLLECTION_OWNER_KEY)).toBe("user-1");
  });

  it("marks the store as pending deletion", async () => {
    localStorage.setItem(PERSISTED_COLLECTION_OWNER_KEY, "user-1");
    locked();

    await purgePersistedDataOnOwnerChange("user-2");

    expect(localStorage.getItem(PERSISTED_COLLECTION_PURGE_PENDING_KEY)).not.toBeNull();
  });

  it("does not let a failed sign-out purge become an anonymous store", async () => {
    // The worst case, and the reason the owner is left untouched: sign-out
    // recording "anonymous" would make the *next* sign-in an anonymous → user
    // transition, which is the one exempt case — so user-1's rows would be
    // handed to first sync as the new user's local data and uploaded into
    // their account.
    localStorage.setItem(PERSISTED_COLLECTION_OWNER_KEY, "user-1");
    locked();

    expect(await purgePersistedDataOnOwnerChange(null)).toBe(true);
    expect(localStorage.getItem(PERSISTED_COLLECTION_OWNER_KEY)).not.toBe("anonymous");

    // A later sign-in as somebody else must still be seen as user-1 → user-2.
    expect(await purgePersistedDataOnOwnerChange("user-2")).toBe(true);
  });

  it("still reports the purge so the caller reloads", async () => {
    // The rows are in memory regardless of what happened on disk.
    localStorage.setItem(PERSISTED_COLLECTION_OWNER_KEY, "user-1");
    locked();

    expect(await purgePersistedDataOnOwnerChange("user-2")).toBe(true);
  });
});
