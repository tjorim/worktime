import type { Dayjs } from "dayjs";
import { useCallback, useMemo } from "react";
import { FLEX_START_OVERRIDE_STORAGE_KEY } from "@/constants/storageKeys";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { dayjs } from "@/utils/dateTimeUtils";

interface StoredFlexStartOverride {
  /** Day the override applies to, `YYYY-MM-DD`. */
  date: string;
  /** Clock-in time, 24-hour `HH:mm`. */
  time: string;
}

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
  const [stored, setStored] = useLocalStorage<StoredFlexStartOverride | null>(
    FLEX_START_OVERRIDE_STORAGE_KEY,
    null,
  );
  const dayKey = day.format("YYYY-MM-DD");

  const startTime = useMemo(() => {
    if (!stored || stored.date !== dayKey) return null;
    const parsed = dayjs(`${stored.date}T${stored.time}`);
    return parsed.isValid() ? parsed : null;
  }, [stored, dayKey]);

  const setStartTime = useCallback(
    (time: string) => {
      setStored({ date: dayKey, time });
    },
    [dayKey, setStored],
  );

  const clear = useCallback(() => setStored(null), [setStored]);

  return { startTime, setStartTime, clear };
}
