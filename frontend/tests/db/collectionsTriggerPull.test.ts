/**
 * Regression coverage for the pushAndQueue -> triggerPull wiring: a
 * successful direct collection push (e.g. from adding a time-tracking task)
 * should immediately request a pull, rather than leaving lastSyncedAt/outbox
 * state in OngoingSyncContext stale until an unrelated trigger (SSE, tab
 * visibility, "online") happens to run one.
 */
import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  setSyncCollectionAuth,
  setSyncCollectionTriggerPull,
  tasksCollection,
} from "@/db/collections";

const TEST_USER_ID = "user-trigger-pull-1";

function insertLocalTask(id: string) {
  tasksCollection.insert({
    id,
    text: "Task",
    label: "",
    startTime: "2026-01-01T09:00",
    stopTime: null,
    includesBreak: false,
  });
}

describe("db/collections pushAndQueue triggerPull wiring", () => {
  beforeEach(() => {
    setSyncCollectionAuth(TEST_USER_ID, "test-token");
  });

  afterEach(() => {
    setSyncCollectionAuth(null);
    setSyncCollectionTriggerPull(null);
    vi.unstubAllGlobals();
  });

  it("calls the registered triggerPull after a successful push", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: {} }) }),
    );
    const triggerPull = vi.fn();
    setSyncCollectionTriggerPull(triggerPull);

    insertLocalTask("task-success-1");

    await waitFor(() => expect(triggerPull).toHaveBeenCalledOnce());
  });

  it("does not call triggerPull when the push fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );
    const triggerPull = vi.fn();
    setSyncCollectionTriggerPull(triggerPull);

    insertLocalTask("task-failure-1");

    // Give the failed push's catch branch a turn to run.
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(triggerPull).not.toHaveBeenCalled();
  });
});
