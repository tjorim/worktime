export const USER_STATE_STORAGE_KEY = "worktime_user_state";
export const SYNC_CURSOR_KEY_PREFIX = "worktime_sync_cursor_";
export const SYNC_OUTBOX_KEY_PREFIX = "worktime_sync_outbox_";
export const SYNC_QUARANTINE_KEY_PREFIX = "worktime_sync_quarantine_";
export const LAST_TEAM_ID_STORAGE_KEY = "worktime_last_team_id";
/** Which account the persisted TanStack DB collections belong to. */
export const PERSISTED_COLLECTION_OWNER_KEY = "worktime_persisted_collection_owner";
export const DEVELOPER_OPTIONS_STORAGE_KEY = "worktime_developer_options";
export const FLEX_START_OVERRIDE_STORAGE_KEY = "worktime_flex_start_override";

export function getSyncCursorKey(userId: string): string {
  return `${SYNC_CURSOR_KEY_PREFIX}${userId}`;
}

export function getSyncOutboxKey(userId: string): string {
  return `${SYNC_OUTBOX_KEY_PREFIX}${userId}`;
}

export function getSyncQuarantineKey(userId: string): string {
  return `${SYNC_QUARANTINE_KEY_PREFIX}${userId}`;
}
