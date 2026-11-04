import { describe, expect, it } from "vitest";
import { syncDatasetsMatch, type SyncPushPayload, type SyncPullResponse } from "@/utils/syncClient";

describe("syncDatasetsMatch", () => {
  const local: SyncPushPayload = {
    labels: [
      { id: "one", action: "create", client_updated_at: "now", name: "Work", color: "blue" },
    ],
    tasks: [],
    templates: [],
    work_locations: [],
    time_off_entries: [],
    gantt_tasks: [],
  };
  const server = {
    ...local,
    labels: [{ id: "one", name: "Work", color: "blue", deleted_at: null }],
  } as unknown as SyncPullResponse;
  it("recognises matching identities and content", () =>
    expect(syncDatasetsMatch(local, server)).toBe(true));
  it("does not equate equal counts with different identities", () =>
    expect(
      syncDatasetsMatch(local, { ...server, labels: [{ ...server.labels[0]!, id: "two" }] }),
    ).toBe(false));
  it("compares updated content", () =>
    expect(
      syncDatasetsMatch(local, { ...server, labels: [{ ...server.labels[0]!, name: "Changed" }] }),
    ).toBe(false));
  it("compares deletions", () =>
    expect(
      syncDatasetsMatch(local, {
        ...server,
        labels: [{ ...server.labels[0]!, deleted_at: "2026-11-04" }],
      }),
    ).toBe(false));
});
