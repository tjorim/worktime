import { afterEach, expect, it, vi } from "vitest";
import {
  labelsCollection,
  templatesCollection,
  replaceTimeTrackingSettings,
  setSyncCollectionAuth,
} from "@/db/collections";
import { getSyncOutboxSize } from "@/utils/syncClient";
afterEach(() => {
  setSyncCollectionAuth(null);
  vi.unstubAllGlobals();
});
for (const kind of ["labels", "templates"] as const) {
  it(`${kind} replacement waits for acceptance and keeps rows on rejection`, async () => {
    const item =
      kind === "labels"
        ? { id: "kept", name: "Support", color: "#123456" }
        : { id: "kept", text: "Work", label: "a", start: "09:00", stop: "10:00" };
    await replaceTimeTrackingSettings("labels", [{ id: "a", name: "A", color: "#123456" }]);
    await replaceTimeTrackingSettings(kind, [item] as never);
    const collection = kind === "labels" ? labelsCollection : templatesCollection;
    setSyncCollectionAuth("replacement-user", "token");
    let reject!: (error: Error) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((_, fail) => {
            reject = fail;
          }),
      ),
    );
    const save = replaceTimeTrackingSettings(kind, []);
    expect(collection.has("kept")).toBe(true);
    reject(new Error("offline"));
    await expect(save).rejects.toThrow("offline");
    expect(collection.has("kept")).toBe(true);
    expect(getSyncOutboxSize("replacement-user")).toBe(0);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ detail: "in use" }), { status: 409 })),
    );
    await expect(replaceTimeTrackingSettings(kind, [])).rejects.toThrow();
    expect(collection.has("kept")).toBe(true);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: {} }))),
    );
    await replaceTimeTrackingSettings(kind, []);
    expect(collection.has("kept")).toBe(false);
  });
}
it("keeps newly received rows that were not part of a pending replacement", async () => {
  await replaceTimeTrackingSettings("labels", [{ id: "old", name: "Old", color: "#123456" }]);
  setSyncCollectionAuth("replacement-user", "token");
  let accept!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise((resolve) => {
          accept = resolve;
        }),
    ),
  );
  const save = replaceTimeTrackingSettings("labels", []);
  labelsCollection.utils.writeUpsert({ id: "arrived", name: "New", color: "#123456" });
  accept(new Response(JSON.stringify({ results: {} })));
  await save;
  expect(labelsCollection.has("old")).toBe(false);
  expect(labelsCollection.has("arrived")).toBe(true);
});

it("blocks known conflicts before any push", async () => {
  await replaceTimeTrackingSettings("templates", []);
  await replaceTimeTrackingSettings("labels", [
    { id: "existing", name: "Existing", color: "#123456" },
  ]);
  setSyncCollectionAuth("replacement-user", "token");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(
    replaceTimeTrackingSettings("labels", [{ id: "new", name: "Existing", color: "#123456" }]),
  ).rejects.toThrow("Duplicate");
  await expect(
    replaceTimeTrackingSettings("templates", [
      { id: "bad", text: "Bad", label: "unknown", start: "09:00", stop: "10:00" },
    ]),
  ).rejects.toThrow("Unknown");
  templatesCollection.utils.writeUpsert({
    id: "used",
    text: "Used",
    label: "existing",
    start: "09:00",
    stop: "10:00",
  });
  await expect(replaceTimeTrackingSettings("labels", [])).rejects.toThrow("in use");
  templatesCollection.utils.writeDelete("used");
  expect(fetch).not.toHaveBeenCalled();
});
it("sends only differences in capped chunks and carries explicit removal confirmation", async () => {
  await replaceTimeTrackingSettings("templates", []);
  await replaceTimeTrackingSettings("labels", [{ id: "a", name: "A", color: "#123456" }]);
  const rows = Array.from({ length: 1001 }, (_, i) => ({
    id: `t${i}`,
    text: "Work",
    label: "a",
    start: "09:00",
    stop: "10:00",
  }));
  await replaceTimeTrackingSettings("templates", rows);
  setSyncCollectionAuth("replacement-user", "token");
  const fetch = vi
    .fn()
    .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ results: {} }))));
  vi.stubGlobal("fetch", fetch);
  await replaceTimeTrackingSettings(
    "templates",
    rows.map((row, i) => (i === 0 ? { ...row, text: "Changed" } : row)),
  );
  expect(JSON.parse(fetch.mock.calls[0]![1].body).templates).toHaveLength(1);
  expect(JSON.parse(fetch.mock.calls[0]![1].body).allow_bulk_delete).toBeUndefined();
  fetch.mockClear();
  await replaceTimeTrackingSettings("templates", [], true);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls.map((call) => JSON.parse(call[1].body).templates.length)).toEqual([
    1000, 1,
  ]);
  for (const call of fetch.mock.calls) {
    expect(JSON.parse(call[1].body).allow_bulk_delete).toBe(true);
    expect(JSON.parse(call[1].body).declared_delete_total).toBe(1001);
  }
});
it("refreshes actual saved rows after a partially committed conflict", async () => {
  await replaceTimeTrackingSettings("templates", []);
  await replaceTimeTrackingSettings("labels", [{ id: "old", name: "Old", color: "#123456" }]);
  setSyncCollectionAuth("replacement-user", "token");
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: {
            labels: [
              { id: "new", status: "conflict" },
              { id: "old", status: "ok" },
            ],
          },
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          labels: [],
          templates: [],
          tasks: [],
          gantt_tasks: [],
          work_locations: [],
          time_off_entries: [],
          server_timestamp: "2026-11-04T00:00:00Z",
        }),
      ),
    );
  vi.stubGlobal("fetch", fetch);
  await expect(
    replaceTimeTrackingSettings("labels", [{ id: "new", name: "New", color: "#123456" }], true),
  ).rejects.toMatchObject({ code: "SETTINGS_PARTIAL", applied: 1, conflicts: 1 });
  expect(fetch.mock.calls[1]![0]).toContain("/api/sync/pull");
  expect(labelsCollection.has("old")).toBe(false);
  expect(labelsCollection.has("new")).toBe(false);
});
