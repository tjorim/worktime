import { useCallback } from "react";
import { useDeveloperOptions } from "@/contexts/DeveloperOptionsContext";
import { apiFetch } from "@/utils/apiClient";

/**
 * Hook that returns an `apiFetch` function for public endpoints.
 *
 * Unlike `useApiClient`, this hook does not depend on AuthProvider and does not
 * trigger login/logout flows on 401/403 responses. It is intended for backend
 * routes that are deliberately accessible without an authenticated session.
 */
export function usePublicApiClient() {
  const { options } = useDeveloperOptions();

  return useCallback(
    async (url: string, init: RequestInit = {}) =>
      apiFetch(url, init, {
        apiUrl: options.apiUrl,
        onUnauthorized: () => {},
        onForbidden: () => {},
      }),
    [options.apiUrl],
  );
}
