/**
 * Routing helpers for the local .hday helper server (see `hday-helper/`).
 *
 * The helper exposes unprefixed routes (`/team/:id/hday`), while the app's own
 * backend mounts the same handlers under `/api` (and only when
 * `LEGACY_FILESHARE_ENABLED=true`). Callers must pick the right base depending
 * on whether a helper URL is configured.
 */

export interface HdayHelperTarget {
  /** Request base to prepend to a route (e.g. "/team/:id/hday"). No trailing slash. */
  baseUrl: string;
  /** Whether requests are routed to a configured local helper rather than same-origin. */
  usesHelper: boolean;
}

export function resolveHdayHelperTarget(hdayHelperUrl: string | null): HdayHelperTarget {
  return hdayHelperUrl
    ? { baseUrl: hdayHelperUrl, usesHelper: true }
    : { baseUrl: "/api", usesHelper: false };
}

/**
 * True when the page is served over HTTPS but the helper URL is plain HTTP —
 * browsers block that fetch as mixed content, and there's no way to route
 * around it client-side, so callers should surface it to the user instead.
 */
export function isHdayHelperMixedContentBlocked(hdayHelperUrl: string): boolean {
  try {
    const helperOrigin = new URL(hdayHelperUrl);
    return window.location.protocol === "https:" && helperOrigin.protocol === "http:";
  } catch {
    return false;
  }
}
