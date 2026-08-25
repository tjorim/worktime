/**
 * Regression coverage for the pushAndQueue -> triggerPull wiring: a
 * successful direct collection push (e.g. from adding a time-tracking task)
 * should immediately request a pull, rather than leaving lastSyncedAt/outbox
 * state in OngoingSyncContext stale until an unrelated trigger (SSE, tab
 * visibility, "online") happens to run one.
 *
 * Also covers the pending (pre-auth) outbox: a write made before a user is
 * known must not be silently dropped once auth resolves and the next pull
 * has no record of it.
 */
import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  setSyncCollectionAuth,
  setSyncCollectionAuthResolving,
  setSyncCollectionTriggerPull,
  tasksCollection,
} from "@/db/collections";
import { getSyncOutboxSize } from "@/utils/syncClient";
import { SYNC_PENDING_OUTBOX_KEY } from "@/constants/storageKeys";

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

describe("db/collections pending (pre-auth) outbox", () => {
  afterEach(() => {
    setSyncCollectionAuth(null);
    setSyncCollectionAuthResolving(false);
    localStorage.removeItem(SYNC_PENDING_OUTBOX_KEY);
    vi.unstubAllGlobals();
  });

  it("queues a write made while an existing session is resolving instead of silently dropping it", async () => {
    // No setSyncCollectionAuth call yet in this test — same as a write made
    // while an existing OIDC session is still loading on page load.
    setSyncCollectionAuthResolving(true);
    insertLocalTask("task-pre-auth-1");

    await waitFor(() => {
      expect(localStorage.getItem(SYNC_PENDING_OUTBOX_KEY)).not.toBeNull();
    });
    expect(getSyncOutboxSize(TEST_USER_ID)).toBe(0);
  });

  it("moves the pending write into the real outbox as soon as auth resolves", async () => {
    setSyncCollectionAuthResolving(true);
    insertLocalTask("task-pre-auth-2");
    await waitFor(() => {
      expect(localStorage.getItem(SYNC_PENDING_OUTBOX_KEY)).not.toBeNull();
    });

    setSyncCollectionAuth(TEST_USER_ID, "test-token");

    expect(getSyncOutboxSize(TEST_USER_ID)).toBe(1);
    expect(localStorage.getItem(SYNC_PENDING_OUTBOX_KEY)).toBeNull();
  });

  it("does not queue a write made while settled as signed-out/local-only, to avoid a shared-device cross-account leak", async () => {
    // isAuthResolving is false here (its default) - not mid-resolution, just
    // genuinely no user. If a *different* person then signs in on this same
    // device, this write must not be sitting in a pending queue for their
    // sign-in to silently claim and upload as their own.
    insertLocalTask("task-local-only-1");

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(localStorage.getItem(SYNC_PENDING_OUTBOX_KEY)).toBeNull();

    setSyncCollectionAuth(TEST_USER_ID, "test-token");
    expect(getSyncOutboxSize(TEST_USER_ID)).toBe(0);
  });
});
