/**
 * `UserSettings` fields that are per-device, not real cross-device preferences.
 *
 * Excluded from what syncs to the account, the same way `lastUsed` is (see
 * SettingsContext's `setDeviceLocalState` and syncClient's
 * buildLocalPreferencesPayload/applyPreferencesPull):
 *
 * - `theme` is a display preference people often want to differ by device
 *   (e.g. always-dark on a laptop, "auto" on a phone).
 * - `notifications` drives a per-device Web Push subscription — the backend's
 *   PushSubscription table has one row per browser/device. Syncing this here
 *   would let a change on one device silently unsubscribe another.
 *
 * Kept as plain strings (not `keyof UserSettings`) so this file has no
 * dependency on SettingsContext, avoiding a cycle with syncClient.ts.
 */
export const DEVICE_LOCAL_SETTING_KEYS = ["theme", "notifications"] as const;
