import { describe, expect, it, vi } from "vitest";
import { USER_STATE_OWNER_STORAGE_KEY, USER_STATE_STORAGE_KEY } from "@/constants/storageKeys";
import { getPreferenceOwner, withPreferenceLock } from "@/utils/preferenceStorage";

describe("preference ownership", () => {
  it("prefers the atomic data owner over a stale legacy owner key", () => {
    localStorage.setItem(USER_STATE_OWNER_STORAGE_KEY, "user-a");
    localStorage.setItem(USER_STATE_STORAGE_KEY, JSON.stringify({ _accountOwner: "user-b" }));
    expect(getPreferenceOwner()).toBe("user-b");
  });

  it("does not infer ownership of malformed data", () => {
    localStorage.setItem(USER_STATE_OWNER_STORAGE_KEY, "user-a");
    localStorage.setItem(USER_STATE_STORAGE_KEY, "{");
    expect(getPreferenceOwner()).toBeNull();
  });

  it("does not perform an unlocked switch when Web Locks are unavailable", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "locks")!;
    Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    const operation = vi.fn();
    try {
      await expect(withPreferenceLock(operation)).rejects.toThrow("Web Locks");
      expect(operation).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(navigator, "locks", descriptor);
    }
  });
});
