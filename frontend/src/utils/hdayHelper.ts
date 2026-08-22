/**
 * Routing helpers for the local .hday helper server (see `hday-helper/`).
 *
 * The helper exposes unprefixed routes (`/team/:id/hday`). The hosted backend
 * intentionally has no access to the legacy planner's network share, so callers
 * must never send these requests to the app origin without a configured helper.
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
    if (window.location.protocol !== "https:" || helperOrigin.protocol !== "http:") {
      return false;
    }

    // Loopback origins are considered potentially trustworthy by browsers, so
    // the expected local helper URL does not need TLS or a localhost certificate.
    const hostname = helperOrigin.hostname.toLowerCase();
    const isLoopback =
      hostname === "localhost" || hostname === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(hostname);
    return !isLoopback;
  } catch {
    return false;
  }
}
