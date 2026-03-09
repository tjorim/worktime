/**
 * Authenticated API client wrapper.
 *
 * Injects the Authorization header, handles common error responses,
 * and surfaces the appropriate callbacks for auth failures.
 */

export interface ApiClientOptions {
  /** Returns the current Authorization headers (or empty object). */
  getAuthHeaders: () => HeadersInit;
  /** Called when a 401 Unauthorized response is received. */
  onUnauthorized: () => void;
  /** Called when a 403 Forbidden response is received. */
  onForbidden: () => void;
}

/**
 * Perform an authenticated fetch request.
 *
 * Merges the Authorization header into the request, then inspects the response:
 * - On 401: calls `onUnauthorized` and throws.
 * - On 403: calls `onForbidden` and throws.
 * - Otherwise: returns the raw Response for the caller to inspect.
 *
 * @param url - The URL to fetch.
 * @param init - Optional fetch options (headers here are merged with auth headers).
 * @param clientOptions - Auth callbacks and header provider.
 * @returns The fetch Response on success (non-401/403 status).
 */
export async function apiFetch(
  url: string,
  init: RequestInit = {},
  clientOptions: ApiClientOptions,
): Promise<Response> {
  const authHeaders = clientOptions.getAuthHeaders();

  const mergedHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(authHeaders as Record<string, string>),
    ...(init.headers as Record<string, string>),
  };

  const response = await fetch(url, { ...init, headers: mergedHeaders });

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
