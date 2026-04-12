/**
 * Mutable in-memory seed data for sync MSW handlers.
 *
 * Handlers read from (and write to) these objects so tests can seed specific
 * states, assert on side-effects, and reset between runs.
 */

import type { SyncPullResponse, SyncPushResponse, SyncStatusResponse } from "@/utils/syncClient";

// ---------------------------------------------------------------------------
// Seed status variants
// ---------------------------------------------------------------------------

/** An empty sync status — server has no data for the user yet. */
export const emptyStatus: SyncStatusResponse = {
  labels_updated_at: null,
  tasks_updated_at: null,
  templates_updated_at: null,
  work_locations_updated_at: null,
  time_off_entries_updated_at: null,
  gantt_tasks_updated_at: null,
  preferences_updated_at: null,
  server_timestamp: "2026-01-01T00:00:00.000Z",
};

/** A populated sync status — server has at least one entity for the user. */
export const populatedStatus: SyncStatusResponse = {
  ...emptyStatus,
  labels_updated_at: "2026-01-01T00:00:00.000Z",
};

/** An empty pull response — server has no records to return. */
export const emptyPullResponse: SyncPullResponse = {
  labels: [],
  tasks: [],
  templates: [],
  work_locations: [],
  time_off_entries: [],
  gantt_tasks: [],
  server_timestamp: "2026-01-02T00:00:00.000Z",
};

/** An empty push response — no conflicts or errors from the server. */
export const emptyPushResponse: SyncPushResponse = {
  results: {},
};

// ---------------------------------------------------------------------------
// Runtime store — tests can mutate these to control handler behavior.
// ---------------------------------------------------------------------------

export interface SyncStore {
  status: SyncStatusResponse;
  pullData: SyncPullResponse;
  pushResponse: SyncPushResponse;
  /** When non-null, the status endpoint returns a 500 error. */
  statusError: number | null;
  /** When non-null, the push endpoint returns this HTTP error code. */
  pushError: number | null;
  /** When non-null, the pull endpoint returns this HTTP error code. */
  pullError: number | null;
  preferences: PreferencesPayload | null;
}

export interface PreferencesPayload {
  user_id: number;
  data: Record<string, unknown>;
  client_updated_at: string;
  created_at: string;
  updated_at: string;
}

function createInitialSyncStore(): SyncStore {
  return {
    status: structuredClone(emptyStatus),
    pullData: structuredClone(emptyPullResponse),
    pushResponse: structuredClone(emptyPushResponse),
    statusError: null,
    pushError: null,
    pullError: null,
    preferences: null,
  };
}

export const syncStore: SyncStore = createInitialSyncStore();

/** Reset the store to its initial seed state. */
export function resetSyncStore(): void {
  Object.assign(syncStore, createInitialSyncStore());
}
