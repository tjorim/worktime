import { isPreferenceRecord, toAccountPreferences } from "@/lib/storage/accountPreferences";
import {
  migrateLegacyDevicePreferences,
  splitLegacyPreferences,
  writePreferenceStorage,
} from "@/lib/storage/devicePreferenceStorage";
import { USER_STATE_STORAGE_KEY } from "@/config/storageKeys";
import { getPreferenceOwner, withPreferenceLock } from "@/lib/storage/preferenceStorage";

import type {
  AccountPreferencesInput,
  PreferencesResponse,
  UserPreferencesWrite,
} from "@/api-types";
import type { FetchFn } from "@/lib/sync/syncRequests";

/**
 * Call GET /api/preferences.
 * Returns null if the request fails or returns 404 (no preferences stored yet).
 */
export async function fetchPreferences(fetch: FetchFn): Promise<PreferencesResponse | null> {
  try {
    const response = await fetch("/api/preferences");
    if (!response.ok) return null;
    const body: unknown = await response.json();
    // The endpoint returns null (JSON null) when no preferences exist yet.
    if (body === null || typeof body !== "object") return null;
    return body as PreferencesResponse;
  } catch {
    return null;
  }
}

/**
 * Call PUT /api/preferences to push local user state to the server.
 * Returns true on success, false on failure.
 */
export async function pushPreferences(
  fetch: FetchFn,
  data: AccountPreferencesInput,
  clientUpdatedAt: string,
): Promise<boolean> {
  try {
    const response = await fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data,
        client_updated_at: clientUpdatedAt,
      } satisfies UserPreferencesWrite),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Build a versioned account payload from the current owner's local state. */
export function buildLocalPreferencesPayload(userId?: string): {
  data: AccountPreferencesInput;
  hasStoredTimestamp: boolean;
  clientUpdatedAt: string;
} | null {
  try {
    if (userId !== undefined && getPreferenceOwner() !== userId) return null;
    const raw = localStorage.getItem(USER_STATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isPreferenceRecord(parsed)) return null;
    if (parsed.schemaVersion !== undefined && parsed.schemaVersion !== 1) return null;
    const hasStoredTimestamp =
      typeof parsed._updatedAt === "string" && Number.isFinite(Date.parse(parsed._updatedAt));
    const clientUpdatedAt = hasStoredTimestamp
      ? String(parsed._updatedAt)
      : "1970-01-01T00:00:00.000Z";
    return {
      data: {
        ...toAccountPreferences(parsed),
        ...(hasStoredTimestamp && { _updatedAt: clientUpdatedAt }),
      },
      clientUpdatedAt,
      hasStoredTimestamp,
    };
  } catch {
    return null;
  }
}

/** Replace account preferences while keeping the browser's own device state. */
export function applyPreferencesPull(data: Record<string, unknown>, owner?: string): boolean {
  try {
    if (data.schemaVersion !== undefined && data.schemaVersion !== 1) return false;
    const raw = localStorage.getItem(USER_STATE_STORAGE_KEY);
    let localState: unknown;
    try {
      localState = raw === null ? null : JSON.parse(raw);
    } catch {
      // An unreadable account document contains no device state to migrate.
    }
    if (isPreferenceRecord(localState)) migrateLegacyDevicePreferences(localState);
    const storedOwner =
      owner ?? (isPreferenceRecord(localState) ? localState._accountOwner : undefined);
    const { _accountOwner: _incomingOwner, ...account } = splitLegacyPreferences(data).account;
    writePreferenceStorage(USER_STATE_STORAGE_KEY, {
      ...account,
      ...(typeof storedOwner === "string" && { _accountOwner: storedOwner }),
    });
    return true;
  } catch {
    // Callers switching accounts must fail closed if the old copy remains.
    return false;
  }
}

function parseTimestampMs(ts: string | null | undefined): number {
  if (!ts) return 0;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Reconcile local and server preferences by last-write-wins on the stored
 * `_updatedAt` timestamp, and return the winning timestamp.
 *
 * Preferences are stored as a single document, so this is a
 * whole-document comparison: the newer side replaces the older one outright.
 * Used by both the first-sync flow and every ongoing sync cycle so a device
 * that signs in with newer local settings does not silently lose them to an
 * older server copy (and vice versa).
 */
export async function reconcilePreferences(
  fetch: FetchFn,
  userId?: string,
): Promise<string | null> {
  if (userId !== undefined && getPreferenceOwner() !== userId) return null;
  const serverPrefs = await fetchPreferences(fetch);
  const decide = (): {
    timestamp: string | null;
    push?: NonNullable<ReturnType<typeof buildLocalPreferencesPayload>>;
  } => {
    if (userId !== undefined && getPreferenceOwner() !== userId) return { timestamp: null };
    const localPrefs = buildLocalPreferencesPayload(userId);
    const localTimestamp = localPrefs?.clientUpdatedAt ?? null;
    const serverTimestamp = serverPrefs?.client_updated_at ?? null;
    const localMs = parseTimestampMs(localTimestamp);
    const serverMs = parseTimestampMs(serverTimestamp);
    if (localPrefs && (!serverPrefs || localMs > serverMs))
      return { push: localPrefs, timestamp: serverTimestamp };
    if (serverPrefs && (!localPrefs || serverMs > localMs)) {
      applyPreferencesPull({ ...serverPrefs.data, _updatedAt: serverTimestamp }, userId);
      return { timestamp: serverTimestamp };
    }
    // Undated local state ties with an epoch-dated server copy. Let the server
    // win once and stamp it, so devices converge and later cycles are no-ops.
    if (serverPrefs && localPrefs && !localPrefs.hasStoredTimestamp) {
      applyPreferencesPull({ ...serverPrefs.data, _updatedAt: serverTimestamp }, userId);
      return { timestamp: serverTimestamp };
    }
    return { timestamp: localTimestamp ?? serverTimestamp };
  };
  const decision = userId === undefined ? decide() : await withPreferenceLock(decide);
  if (decision.push) {
    const { data, clientUpdatedAt } = decision.push;
    return (await pushPreferences(fetch, data, clientUpdatedAt))
      ? clientUpdatedAt
      : decision.timestamp;
  }
  return decision.timestamp;
}
