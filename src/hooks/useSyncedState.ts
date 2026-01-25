import { useEffect, useState } from "react";

/**
 * Hook for state that syncs from a prop but can be locally modified.
 *
 * Use this when:
 * - You need local state that can diverge from a prop
 * - But should reset when the prop changes externally
 *
 * Example: A dropdown that defaults to user's schedule but can be changed
 * to view other schedules. When user changes their schedule in settings,
 * the dropdown resets to match.
 *
 * @param propValue - The prop value to sync from
 * @returns Tuple of [currentValue, setValue] like useState
 */
export function useSyncedState<T>(propValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(propValue);

  useEffect(() => {
    setValue(propValue);
  }, [propValue]);

  return [value, setValue];
}
