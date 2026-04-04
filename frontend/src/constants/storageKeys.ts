export const USER_STATE_STORAGE_KEY = "worktime_user_state";
export const WORK_LOCATIONS_STORAGE_PREFIX = "worktime_work_locations_";
export const GANTT_STORAGE_KEY = "worktime_gantt_tasks";
export const DEVELOPER_OPTIONS_STORAGE_KEY = "worktime_developer_options";
export const LAST_TEAM_ID_STORAGE_KEY = "worktime_last_team_id";
export const SYNC_CURSOR_KEY_PREFIX = "worktime_sync_cursor_";

export function getWorkLocationsStorageKey(year: number): string {
  return `${WORK_LOCATIONS_STORAGE_PREFIX}${year}`;
}

export function getSyncCursorKey(userId: string): string {
  return `${SYNC_CURSOR_KEY_PREFIX}${userId}`;
}
