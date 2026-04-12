import { describe, expect, it } from "vitest";
import {
  emptyPullResponse,
  emptyPushResponse,
  emptyStatus,
  resetSyncStore,
  syncStore,
} from "@/mocks/data/syncStore";

describe("syncStore", () => {
  it("starts with cloned fixture data", () => {
    expect(syncStore.status).not.toBe(emptyStatus);
    expect(syncStore.pullData).not.toBe(emptyPullResponse);
    expect(syncStore.pushResponse).not.toBe(emptyPushResponse);
  });

  it("resets nested state with fresh clones", () => {
    syncStore.pullData.labels = [{} as never];
    syncStore.pushResponse.results.labels = [{ id: "label-1", status: "ok" }];

    resetSyncStore();

    expect(syncStore.pullData.labels).toEqual([]);
    expect(syncStore.pushResponse.results).toEqual({});
    expect(syncStore.pullData).not.toBe(emptyPullResponse);
    expect(syncStore.pushResponse).not.toBe(emptyPushResponse);
    expect(emptyPullResponse.labels).toEqual([]);
    expect(emptyPushResponse.results).toEqual({});
  });
});
