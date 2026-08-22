import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Synchronises a React state value with window.localStorage.
 *
 * The hook initialises state from localStorage (or uses `initialValue` when running outside a browser or when no valid stored value exists), keeps state and localStorage in sync, and updates state when the same key changes in other tabs via the `storage` event. The setter accepts either a direct value or an updater function and persists the value as JSON; storage and parsing errors are caught and ignored.
 *
 * @param key - The localStorage key to read and write
 * @param initialValue - Value to use when no stored value is available
 * @returns A tuple [storedValue, setValue]; `setValue` accepts a value of `T` or a function `(prev: T) => T`
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  // State to store our value
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined") {
      return initialValue;
    }

    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      // Return initial value if localStorage is corrupted or unavailable
      return initialValue;
    }
  });

  // Track latest value in a ref to handle multiple setValue calls in the same render
  // This prevents stale closure issues when batching updates
  const latestValueRef = useRef(storedValue);
  latestValueRef.current = storedValue;
  const didMountRef = useRef(false);
  const initialValueRef = useRef(initialValue);
  initialValueRef.current = initialValue;
  // Prevents the hook instance that dispatched a synthetic StorageEvent from
  // re-processing its own event (it already updated state directly in setValue).
  const isSelfDispatch = useRef(false);

  const readValueForKey = useCallback((storageKey: string): T => {
    if (typeof window === "undefined") {
      return initialValueRef.current;
    }

    try {
      const item = window.localStorage.getItem(storageKey);
      return item ? JSON.parse(item) : initialValueRef.current;
    } catch {
      return initialValueRef.current;
    }
  }, []);

  // Re-read localStorage when the key changes after initial mount.
  // Layout effect prevents interactive gaps where functional updates could use stale ref data.
  useIsomorphicLayoutEffect(() => {
    if (typeof window === "undefined") return;

    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    const nextValue = readValueForKey(key);
    latestValueRef.current = nextValue;
    setStoredValue(nextValue);
  }, [
    key,
    setStoredValue,
    readValueForKey,
    // intentionally excludes initialValue to prevent spurious re-reads
  ]);

  // Listen for changes to this key in other tabs
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStorageChange = (e: StorageEvent) => {
      // Skip events we dispatched ourselves (already updated state directly in setValue).
      if (isSelfDispatch.current) return;
      if (e.key !== key) return;

      if (e.newValue === null) {
        latestValueRef.current = initialValueRef.current;
        setStoredValue(initialValueRef.current);
      } else {
        try {
          const parsed = JSON.parse(e.newValue);
          latestValueRef.current = parsed;
          setStoredValue(parsed);
        } catch {
          // Ignore parsing errors
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [key]);

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      try {
        // Use ref for functional updates to handle multiple calls in same render
        const valueToStore = value instanceof Function ? value(latestValueRef.current) : value;

        // Update ref immediately so subsequent calls in this render get the new value
        latestValueRef.current = valueToStore;

        // Update state
        setStoredValue(valueToStore);

        // Persist to localStorage and notify other same-tab instances watching the
        // same key. The browser only fires the native `storage` event for cross-tab
        // changes, so we dispatch a synthetic one to keep same-tab instances in sync.
        if (typeof window !== "undefined") {
          try {
            const serialized = JSON.stringify(valueToStore);
            const oldValue = window.localStorage.getItem(key);
            window.localStorage.setItem(key, serialized);
            isSelfDispatch.current = true;
            try {
              window.dispatchEvent(
                new StorageEvent("storage", {
                  key,
                  newValue: serialized,
                  oldValue,
                  storageArea: window.localStorage,
                }),
              );
            } finally {
              isSelfDispatch.current = false;
            }
          } catch {
            // Handle storage quota exceeded or other localStorage errors silently
            // App continues to function normally even if storage fails
          }
        }
      } catch {
        // Handle any other errors silently - app continues to function
      }
    },
    [key],
  );

  return [storedValue, setValue];
}
