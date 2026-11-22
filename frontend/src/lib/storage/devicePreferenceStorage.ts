import { DEVICE_PREFERENCES_STORAGE_KEY } from "@/config/storageKeys";
import { isPreferenceRecord } from "@/lib/storage/accountPreferences";

export function splitLegacyPreferences(state: Record<string, unknown>) {
  const { settings, lastUsed, ...account } = state;
  const { theme, notifications, ...accountSettings } = isPreferenceRecord(settings) ? settings : {};
  const accountState: Record<string, unknown> = {
    ...account,
    ...(isPreferenceRecord(settings) && { settings: accountSettings }),
  };
  return {
    account: accountState,
    device: {
      ...(theme === "auto" || theme === "light" || theme === "dark" ? { theme } : {}),
      ...(notifications === "on" || notifications === "off"
        ? { notifications: notifications === "on" }
        : {}),
      ...(isPreferenceRecord(lastUsed) ? { lastUsed } : {}),
    },
    needsMigration:
      "lastUsed" in state ||
      (isPreferenceRecord(settings) && ("theme" in settings || "notifications" in settings)),
  };
}

export function readDevicePreferences(): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(DEVICE_PREFERENCES_STORAGE_KEY) ?? "{}",
    );
    return isPreferenceRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function writePreferenceStorage(key: string, data: Record<string, unknown>): void {
  const newValue = JSON.stringify(data);
  const oldValue = localStorage.getItem(key);
  if (newValue === oldValue) return;
  localStorage.setItem(key, newValue);
  window.dispatchEvent(
    new StorageEvent("storage", { key, newValue, oldValue, storageArea: localStorage }),
  );
}

/** Save device data first so an interrupted upgrade can safely retry. */
export function migrateLegacyDevicePreferences(state: Record<string, unknown>) {
  const { account, device, needsMigration } = splitLegacyPreferences(state);
  if (Object.keys(device).length > 0) {
    const current = readDevicePreferences();
    writePreferenceStorage(DEVICE_PREFERENCES_STORAGE_KEY, {
      ...device,
      ...current,
      ...(device.lastUsed && {
        lastUsed: {
          ...device.lastUsed,
          ...(isPreferenceRecord(current.lastUsed) && current.lastUsed),
        },
      }),
    });
  }
  return { account, needsMigration };
}
