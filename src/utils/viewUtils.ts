/**
 * Generic utility for determining initial view mode from URL parameters
 * with validation against allowed views and a default fallback.
 *
 * @param initialView - The view parameter from the URL (may be undefined or invalid)
 * @param validViews - Array of valid view values
 * @param defaultView - The default view to use if initialView is invalid/undefined
 * @returns A valid view from the validViews array
 */
export function getInitialView<T extends string>(
  initialView: string | undefined,
  validViews: readonly T[],
  defaultView: T,
): T {
  if (initialView && (validViews as readonly string[]).includes(initialView)) {
    return initialView as T;
  }
  return defaultView;
}
