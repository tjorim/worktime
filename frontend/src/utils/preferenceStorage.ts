import { USER_STATE_OWNER_STORAGE_KEY, USER_STATE_STORAGE_KEY } from "@/constants/storageKeys";

/** The blob's marker is atomic with its data; the separate key is legacy metadata. */
export function getPreferenceOwner(): string | null {
  const raw = localStorage.getItem(USER_STATE_STORAGE_KEY);
  if (raw !== null) {
    let data: { _accountOwner?: unknown } | null;
    try {
      data = JSON.parse(raw) as typeof data;
    } catch {
      return null;
    }
    if (data !== null && typeof data === "object" && "_accountOwner" in data) {
      return typeof data._accountOwner === "string" ? data._accountOwner : null;
    }
  }
  return localStorage.getItem(USER_STATE_OWNER_STORAGE_KEY);
}

/** Preserve ownership even for setters that replace/reset the whole settings object. */
export function preservePreferenceOwner<T extends object>(previous: unknown, next: T): T {
  if (
    previous !== null &&
    typeof previous === "object" &&
    "_accountOwner" in previous &&
    typeof previous._accountOwner === "string"
  ) {
    return { ...next, _accountOwner: previous._accountOwner };
  }
  return next;
}

/** Serialize preference switches and reconciliation across tabs on this origin. */
export async function withPreferenceLock<T>(operation: () => T | Promise<T>): Promise<T> {
  if (!navigator.locks?.request) throw new Error("Account preference sync requires Web Locks");
  return navigator.locks.request(USER_STATE_STORAGE_KEY, operation);
}
