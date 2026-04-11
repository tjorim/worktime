export const USER_STATE_STORAGE_KEY = "worktime_user_state";
export const DEVELOPER_OPTIONS_STORAGE_KEY = "worktime_developer_options";
export const LAST_TEAM_ID_STORAGE_KEY = "worktime_last_team_id";
export const SYNC_CURSOR_KEY_PREFIX = "worktime_sync_cursor_";
export const SYNC_OUTBOX_KEY_PREFIX = "worktime_sync_outbox_";

export function getSyncCursorKey(userId: string): string {
  return `${SYNC_CURSOR_KEY_PREFIX}${userId}`;
}

export function getSyncOutboxKey(userId: string): string {
  return `${SYNC_OUTBOX_KEY_PREFIX}${userId}`;
}
