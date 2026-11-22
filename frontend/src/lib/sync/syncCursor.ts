import { getSyncCursorKey } from "@/config/storageKeys";

/**
 * Returns true when the given userId already has a sync cursor stored locally,
 * meaning the first-sync flow has already been completed on this device.
 */
export function hasSyncCursor(userId: string): boolean {
  return localStorage.getItem(getSyncCursorKey(userId)) !== null;
}

/**
 * Persist the server_timestamp returned by a successful push or pull as the
 * sync cursor for the given user.
 */
export function storeSyncCursor(userId: string, serverTimestamp: string): void {
  localStorage.setItem(getSyncCursorKey(userId), serverTimestamp);
}
