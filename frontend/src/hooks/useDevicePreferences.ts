import { useCallback } from "react";
import { DEVICE_PREFERENCES_STORAGE_KEY } from "@/constants/storageKeys";
import { useLocalStorage } from "@/hooks/useLocalStorage";

export type DismissibleHint = "unifiedCalendar";

export interface DevicePreferences {
  dismissedHints?: Partial<Record<DismissibleHint, boolean>>;
  flexStartOverride?: { date: string; time: string } | null;
  hdayHelper?: { url: string | null };
  lastHdayTeamId?: string;
  pwaInstall?: {
    visitCount: number;
    installed: boolean;
    lastPromptedAt: string | null;
  };
}

const DEFAULT_DEVICE_PREFERENCES: DevicePreferences = {};

/** Stores UI preferences that intentionally stay local to this browser. */
export function useDevicePreferences() {
  const [preferences, setPreferences] = useLocalStorage<DevicePreferences>(
    DEVICE_PREFERENCES_STORAGE_KEY,
    DEFAULT_DEVICE_PREFERENCES,
  );

  const isHintDismissed = useCallback(
    (hint: DismissibleHint) => preferences?.dismissedHints?.[hint] === true,
    [preferences?.dismissedHints],
  );

  const setHintDismissed = useCallback(
    (hint: DismissibleHint, dismissed: boolean) => {
      setPreferences((current) => ({
        ...current,
        dismissedHints: {
          ...current?.dismissedHints,
          [hint]: dismissed,
        },
      }));
    },
    [setPreferences],
  );

  return { preferences, setPreferences, isHintDismissed, setHintDismissed };
}
