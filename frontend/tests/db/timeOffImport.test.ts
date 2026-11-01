import { waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { pushTimeOffImport, setSyncCollectionAuth } from "@/db/collections";
import { hdayToTimeOffEntries } from "@/lib/timeOff/codecs";

afterEach(() => {
  setSyncCollectionAuth(null);
  vi.unstubAllGlobals();
});

it("sends replacement creates and deletes in one push and leaves unchanged rows alone", () => {
  setSyncCollectionAuth("import-user", "test-token");
  const fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetch);
  const current = hdayToTimeOffEntries("2026/01/01\n2026/02/01").entries;
  const additions = hdayToTimeOffEntries("2026/03/01\n2026/04/01").entries;
  pushTimeOffImport(current, [current[0]!, ...additions]);
  expect(fetch).toHaveBeenCalledOnce();
  const payload = JSON.parse(fetch.mock.calls[0]![1].body);
  expect(payload.time_off_entries.map((entry: { action: string }) => entry.action)).toEqual([
    "delete",
    "create",
    "create",
  ]);
  expect(payload.time_off_entries[0].id).toBe(current[1]!.id);
});

it("splits oversized imports sequentially and carries confirmed deletion consent", async () => {
  setSyncCollectionAuth("import-user", "test-token");
  const fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetch);
  const sample = hdayToTimeOffEntries("2026/01/01").entries[0]!;
  const current = Array.from({ length: 1001 }, (_, index) => ({ ...sample, id: `entry-${index}` }));
  pushTimeOffImport(current, [], true);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  const payloads = fetch.mock.calls.map((call) => JSON.parse(call[1].body));
  expect(payloads.map((payload) => payload.time_off_entries.length)).toEqual([1000, 1]);
  for (const payload of payloads) {
    expect(payload.allow_bulk_delete).toBe(true);
    expect(payload.declared_delete_total).toBe(1001);
  }
});
