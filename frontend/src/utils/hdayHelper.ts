/**
 * Routing helpers for the local .hday helper server (see `hday-helper/`).
 *
 * The helper exposes unprefixed routes (`/team/:id/hday`). The hosted backend
 * intentionally has no access to the legacy planner's network share, so callers
 * must never send these requests to the app origin without a configured helper.
 */

/** Return the normalized helper base URL, or null when no helper is configured. */
export function resolveHdayHelperBaseUrl(hdayHelperUrl: string | null): string | null {
  const normalized = hdayHelperUrl?.trim().replace(/\/+$/, "");
  return normalized || null;
}

/**
 * Extract a user-facing error message from a failed hday-helper response, falling
 * back to a generic message when the body isn't the expected `{ detail }` JSON shape.
 */
export async function getHdayHelperErrorMessage(
  response: Response,
  fallbackMessage: string,
): Promise<string> {
  const contentType = response.headers.get("content-type");

  if (contentType?.includes("application/json")) {
    try {
      const body: unknown = await response.json();

      if (body && typeof body === "object" && "detail" in body) {
        const { detail } = body as { detail: unknown };

        if (typeof detail === "string" && detail.trim()) {
          return detail;
        }
      }
    } catch {
      // Fall back to a generic user-facing message when parsing fails.
    }
  }

  return fallbackMessage;
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
