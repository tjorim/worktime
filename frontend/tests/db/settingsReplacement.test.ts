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
