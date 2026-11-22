import { DEVICE_LOCAL_SETTING_KEYS } from "@/config/deviceLocalSettings";
import { USER_STATE_STORAGE_KEY } from "@/config/storageKeys";
import { getPreferenceOwner, withPreferenceLock } from "@/lib/storage/preferenceStorage";

import type { PreferencesResponse } from "@/api-types";
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
  data: Record<string, unknown>,
  clientUpdatedAt: string,
): Promise<boolean> {
  try {
    const response = await fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, client_updated_at: clientUpdatedAt }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Remove device-local settings fields (see DEVICE_LOCAL_SETTING_KEYS) before a settings object is pushed. */
function omitDeviceLocalSettings(settings: unknown): unknown {
  if (!isRecord(settings)) return settings;
  const result = { ...settings };
  for (const key of DEVICE_LOCAL_SETTING_KEYS) {
    delete result[key];
  }
  return result;
}

/** Overlay this device's own device-local settings values onto pulled settings. */
function withLocalDeviceSettings(incomingSettings: unknown, localSettings: unknown): unknown {
  const overlay: Record<string, unknown> = {};
  if (isRecord(localSettings)) {
    for (const key of DEVICE_LOCAL_SETTING_KEYS) {
      if (key in localSettings) overlay[key] = localSettings[key];
    }
  }
  if (isRecord(incomingSettings)) {
    return { ...incomingSettings, ...overlay };
  }
  return Object.keys(overlay).length > 0 ? overlay : incomingSettings;
}

/**
 * Read the current worktime_user_state from localStorage and return it as a
 * preferences payload suitable for pushPreferences().
 * Returns null if there is no local user state to push.
 *
 * `lastUsed` (active tab, last-viewed sub-view per tab) and the
 * DEVICE_LOCAL_SETTING_KEYS settings fields (theme, notification lead
 * time/quiet hours) are deliberately excluded: they're per-device state, not
 * real cross-device preferences, and SettingsContext already keeps them out
 * of _updatedAt's bumps for the same reason — sending them here would let a
 * device's local-only changes (a tab switch, a theme toggle) poison the
 * account's synced preferences.
 */
export function buildLocalPreferencesPayload(userId?: string): {
  data: Record<string, unknown>;
  clientUpdatedAt: string;
} | null {
  try {
    if (userId !== undefined && getPreferenceOwner() !== userId) return null;
    const raw = localStorage.getItem(USER_STATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const stored = parsed as Record<string, unknown>;
    // Undated state must not become newer on every sync cycle. Existing
    // server preferences win; an empty server can still receive an initial copy.
    const storedTimestamp =
      typeof stored._updatedAt === "string" ? stored._updatedAt : "1970-01-01T00:00:00.000Z";
    const { lastUsed: _lastUsed, _accountOwner: _owner, settings, ...restTop } = stored;
    return {
      data: { ...restTop, settings: omitDeviceLocalSettings(settings) },
      clientUpdatedAt: storedTimestamp,
    };
  } catch {
    return null;
  }
}

/**
 * Write pulled preferences data to worktime_user_state in localStorage,
 * replacing any existing value except `lastUsed` and the
 * DEVICE_LOCAL_SETTING_KEYS settings fields, which stay local to this device
 * (see buildLocalPreferencesPayload) — a pull must not let the account's
 * synced blob (or values pushed before this device excluded them) overwrite
 * this device's own navigation state or device-local settings.
 */
export function applyPreferencesPull(data: Record<string, unknown>, owner?: string): boolean {
  try {
    const raw = localStorage.getItem(USER_STATE_STORAGE_KEY);
    let localLastUsed: unknown;
    let localSettings: unknown;
    let localOwner: unknown;
    if (raw) {
      try {
        const parsedLocal: unknown = JSON.parse(raw);
        if (isRecord(parsedLocal)) {
          localLastUsed = parsedLocal.lastUsed;
          localSettings = parsedLocal.settings;
          localOwner = parsedLocal._accountOwner;
        }
      } catch {
        // Malformed local state; nothing to preserve.
      }
    }
    const {
      lastUsed: _incomingLastUsed,
      _accountOwner: _incomingOwner,
      settings: incomingSettings,
      ...rest
    } = data;
    const merged: Record<string, unknown> = {
      ...rest,
      settings: withLocalDeviceSettings(incomingSettings, localSettings),
    };
    if (localLastUsed !== undefined) {
      merged.lastUsed = localLastUsed;
    }
    const storedOwner = owner ?? localOwner;
    if (typeof storedOwner === "string") merged._accountOwner = storedOwner;
    const serialized = JSON.stringify(merged);
    localStorage.setItem(USER_STATE_STORAGE_KEY, serialized);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: USER_STATE_STORAGE_KEY,
          newValue: serialized,
          oldValue: raw,
          storageArea: localStorage,
        }),
      );
    }
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
 * Preferences are one opaque blob rather than per-field records, so this is a
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
      applyPreferencesPull(serverPrefs.data, userId);
      return { timestamp: serverTimestamp };
    }
    // Undated local state ties with an epoch-dated server copy. Let the server
    // win once and stamp it, so devices converge and later cycles are no-ops.
    if (serverPrefs && localPrefs && localPrefs.data._updatedAt === undefined) {
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
