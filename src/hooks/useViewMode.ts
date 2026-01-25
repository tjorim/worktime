import { useEffect, useState } from "react";
import { getInitialView } from "../utils/viewUtils";

/**
 * Hook for managing view mode state with async URL parameter support.
 *
 * Handles the common pattern where:
 * 1. initialView is undefined on first render (parent's useEffect hasn't run yet)
 * 2. initialView updates asynchronously after mount
 * 3. View mode needs to sync when initialView changes
 *
 * @param initialView - The view parameter from URL (may be undefined initially)
 * @param validViews - Array of valid view values
 * @param defaultView - The default view to use
 * @returns Tuple of [currentViewMode, setViewMode]
 */
export function useViewMode<T extends string>(
  initialView: string | undefined,
  validViews: readonly T[],
  defaultView: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [viewMode, setViewMode] = useState<T>(defaultView);

  useEffect(() => {
    if (initialView) {
      const validatedView = getInitialView(initialView, validViews, defaultView);
      setViewMode(validatedView);
    }
  }, [initialView, validViews, defaultView]);

  return [viewMode, setViewMode];
}
