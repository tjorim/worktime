import type { Dayjs } from "dayjs";
import { useCallback, useMemo } from "react";
import { useDevicePreferences } from "@/hooks/useDevicePreferences";
import { dayjs } from "@/utils/dateTimeUtils";

export interface FlexStartOverride {
  startTime: Dayjs | null;
  setStartTime: (time: string) => void;
  clear: () => void;
}

/**
 * A locally-stored manual "I started at ..." time for a flex shift, for people
 * who do not use time-tracking. The override is scoped to a single day so it
 * does not leak into later days: reading it only returns a value when the
 * stored date matches `day`.
 */
export function useFlexStartOverride(day: Dayjs): FlexStartOverride {
  const { preferences, setPreferences } = useDevicePreferences();
  const stored = preferences?.flexStartOverride ?? null;
  const dayKey = day.format("YYYY-MM-DD");

  const startTime = useMemo(() => {
    if (!stored || stored.date !== dayKey) return null;
    const parsed = dayjs(`${stored.date}T${stored.time}`);
    return parsed.isValid() ? parsed : null;
  }, [stored, dayKey]);

  const setStartTime = useCallback(
    (time: string) => {
      setPreferences((current) => ({
        ...current,
        flexStartOverride: { date: dayKey, time },
      }));
    },
    [dayKey, setPreferences],
  );

  const clear = useCallback(
    () => setPreferences((current) => ({ ...current, flexStartOverride: null })),
    [setPreferences],
  );

  return { startTime, setStartTime, clear };
}
