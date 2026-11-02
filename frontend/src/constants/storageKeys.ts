/** OIDC subject whose account preferences are currently stored on this device. */
export const USER_STATE_OWNER_STORAGE_KEY = "worktime_user_state_owner";
export const USER_STATE_STORAGE_KEY = "worktime_user_state";
export const SYNC_CURSOR_KEY_PREFIX = "worktime_sync_cursor_";
export const SYNC_OUTBOX_KEY_PREFIX = "worktime_sync_outbox_";
/**
 * Holds writes made before the current user is known (auth not yet
 * resolved). Not per-user, since there is no userId to key it by yet - see
 * appendToPendingSyncOutbox / drainPendingSyncOutbox in utils/syncClient.ts.
 */
export const SYNC_PENDING_OUTBOX_KEY = "worktime_sync_outbox_pending";
export const SYNC_QUARANTINE_KEY_PREFIX = "worktime_sync_quarantine_";
export const SYNC_COLLECTION_SNAPSHOT_KEY_PREFIX = "worktime_collection_snapshot_";
export const SYNC_COLLECTION_SNAPSHOT_OWNER_KEY = "worktime_collection_snapshot_owner";
export const SYNC_COLLECTION_SNAPSHOT_GENERATION_KEY = "worktime_collection_snapshot_generation";
export const DEVICE_PREFERENCES_STORAGE_KEY = "worktime_device_preferences";

export function getSyncCursorKey(userId: string): string {
  return `${SYNC_CURSOR_KEY_PREFIX}${userId}`;
}

export function getSyncOutboxKey(userId: string): string {
  return `${SYNC_OUTBOX_KEY_PREFIX}${userId}`;
}

export function getSyncQuarantineKey(userId: string): string {
  return `${SYNC_QUARANTINE_KEY_PREFIX}${userId}`;
}

/** Saved account preferences, including edits not yet accepted by the server. */
export const USER_STATE_ACCOUNT_KEY_PREFIX = "worktime_user_state_account_";
/** Legacy preferences whose account cannot be safely inferred. Never auto-uploaded. */
export const USER_STATE_UNCLAIMED_STORAGE_KEY = "worktime_user_state_unclaimed";
/** Empty OIDC subjects are invalid; this explicitly marks new anonymous state. */
export const ANONYMOUS_USER_STATE_OWNER = "";

export function getAccountPreferencesKey(userId: string): string {
  return `${USER_STATE_ACCOUNT_KEY_PREFIX}${userId}`;
}

/** Incoming account preferences staged until an account switch is committed. */
export const USER_STATE_SWITCH_STORAGE_KEY = "worktime_user_state_switch";

/** Additional unclaimed copies retained when legacy settings were edited during recovery. */
export const USER_STATE_UNCLAIMED_HISTORY_STORAGE_KEY = "worktime_user_state_unclaimed_history";
