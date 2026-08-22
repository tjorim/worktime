/**
 * `UserSettings` fields that are per-device, not real cross-device preferences.
 *
 * Excluded from what syncs to the account, the same way `lastUsed` is (see
 * SettingsContext's `setDeviceLocalState` and syncClient's
 * buildLocalPreferencesPayload/applyPreferencesPull):
 *
 * - `theme` is a display preference people often want to differ by device
 *   (e.g. always-dark on a laptop, "auto" on a phone).
 * - The notification fields drive per-device push subscriptions — the
 *   backend's PushSubscription table has one row per browser/device, each
 *   carrying its own lead time and quiet hours. Syncing these here would let
 *   a change on one device silently overwrite another device's chosen
 *   values the next time preferences reconcile.
 *
 * Kept as plain strings (not `keyof UserSettings`) so this file has no
 * dependency on SettingsContext, avoiding a cycle with syncClient.ts.
 */
export const DEVICE_LOCAL_SETTING_KEYS = [
  "theme",
  "notifications",
  "notificationLeadTimeMinutes",
  "notificationQuietHoursStart",
  "notificationQuietHoursEnd",
] as const;
