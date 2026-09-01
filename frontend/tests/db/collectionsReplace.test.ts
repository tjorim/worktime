import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { replaceCollectionContents, setSyncCollectionAuth } from "@/db/collections";

interface Row {
  id: string;
  value: string;
}

describe("replaceCollectionContents", () => {
  afterEach(() => {
    setSyncCollectionAuth(null);
  });

  it("upserts overlapping snapshot keys instead of deleting and inserting the same key", () => {
    setSyncCollectionAuth("user-1", "test-token");

    const deleted: string[] = [];
    const upserted: Row[] = [];
    const collection = {
      startSyncImmediate: vi.fn(),
      toArray: [
        { id: "shared", value: "local" },
        { id: "local-only", value: "remove" },
      ],
      has: vi.fn(() => true),
      delete: vi.fn(),
      insert: vi.fn(),
      utils: {
        writeBatch: (callback: () => void) => callback(),
        writeDelete: (keys: string[]) => deleted.push(...keys),
        writeUpsert: (items: Row[]) => upserted.push(...items),
      },
    };

    replaceCollectionContents(
      collection,
      [
        { id: "shared", value: "server" },
        { id: "server-only", value: "add" },
      ],
      (row) => row.id,
    );

    expect(deleted).toEqual(["local-only"]);
    expect(upserted).toEqual([
      { id: "shared", value: "server" },
      { id: "server-only", value: "add" },
    ]);
    expect(collection.delete).not.toHaveBeenCalled();
    expect(collection.insert).not.toHaveBeenCalled();
  });
});
