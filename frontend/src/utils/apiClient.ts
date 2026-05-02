/**
 * API client wrapper.
 *
 * Handles common error responses and surfaces the appropriate callbacks
 * for auth failures. Authentication is performed using a Bearer JWT from
 * the OIDC provider — pass the token via the `Authorization` header in
 * the `init.headers` argument.
 */

export interface ApiClientOptions {
  /** Called when a 401 Unauthorized response is received. */
  onUnauthorized: () => void;
  /** Called when a 403 Forbidden response is received. */
  onForbidden: () => void;
}

/**
 * Perform a fetch request with standard error handling.
 *
 * Sets default Accept/Content-Type headers, then inspects the response:
 * - On 401: calls `onUnauthorized` and throws.
 * - On 403: calls `onForbidden` and throws.
 * - Otherwise: returns the raw Response for the caller to inspect.
 *
 * Callers should inject the OIDC Bearer token via `init.headers`:
 * ```ts
 * apiFetch(url, { headers: { Authorization: `Bearer ${token}` } }, options)
 * ```
 *
 * @param url - The URL to fetch.
 * @param init - Optional fetch options.
 * @param clientOptions - Error callbacks.
 * @returns The fetch Response on success (non-401/403 status).
 */
export async function apiFetch(
  url: string,
  init: RequestInit = {},
  clientOptions: ApiClientOptions,
): Promise<Response> {
  const mergedHeaders = new Headers({
    Accept: "application/json",
  });

  if (!(init.body instanceof FormData)) {
    mergedHeaders.set("Content-Type", "application/json");
  }

  const requestHeaders = new Headers(init.headers);
  requestHeaders.forEach((value, key) => mergedHeaders.set(key, value));

  // Resolve relative paths against the current origin so production uses the
  // same host consistently without a mutable per-browser API base URL.
  const resolvedUrl =
    typeof window === "undefined" || /^https?:\/\//i.test(url)
      ? url
      : new URL(url, window.location.origin).toString();

  const response = await fetch(resolvedUrl, {
    ...init,
    headers: mergedHeaders,
  });

  if (response.status === 401) {
    clientOptions.onUnauthorized();
    throw new Error("Unauthorized");
  }

  if (response.status === 403) {
    clientOptions.onForbidden();
    throw new Error("Forbidden");
  }

  return response;
}
