import { useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { apiFetch } from "@/utils/apiClient";
import * as m from "@/paraglide/messages.js";

/**
 * Hook that returns an `apiFetch` function with standard error handling.
 *
 * The returned function automatically:
 * - Injects the OIDC Bearer token into the `Authorization` header.
 * - Redirects to the login page on 401 Unauthorized and shows a session-expired toast.
 * - Shows an error toast and clears auth on 403 Forbidden.
 *
 * Must be used inside AuthProvider and ToastProvider.
 *
 * @returns `apiFetch(url, init?)` — a fetch wrapper with error handling.
 */
export function useApiClient() {
  const { triggerLogin, logout, getAccessToken } = useAuth();
  const { showError, showWarning } = useToast();

  const authenticatedFetch = useCallback(
    async (url: string, init: RequestInit = {}): Promise<Response> => {
      const token = getAccessToken();
      const headers = new Headers(init.headers);
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      return apiFetch(url, { ...init, headers }, {
        onUnauthorized: () => {
          logout();
          showWarning(m.auth_session_expired());
          triggerLogin();
        },
        onForbidden: () => {
          logout();
          showError(m.auth_error_forbidden());
        },
      });
    },
    [triggerLogin, logout, getAccessToken, showError, showWarning],
  );

  return authenticatedFetch;
}
