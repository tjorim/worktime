import { useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { apiFetch } from "../utils/apiClient";
import * as m from "../paraglide/messages.js";

/**
 * Hook that returns an authenticated `apiFetch` function.
 *
 * The returned function automatically:
 * - Injects the Authorization: Bearer header.
 * - Triggers the login modal on 401 Unauthorized and shows a session-expired toast.
 * - Shows an error toast and clears auth on 403 Forbidden.
 *
 * Must be used inside AuthProvider and ToastProvider.
 *
 * @returns `apiFetch(url, init?)` — an authenticated fetch wrapper.
 */
export function useApiClient() {
  const { getAuthHeaders, triggerLogin, logout } = useAuth();
  const { showError, showWarning } = useToast();

  const authenticatedFetch = useCallback(
    async (url: string, init: RequestInit = {}): Promise<Response> => {
      return apiFetch(url, init, {
        getAuthHeaders,
        onUnauthorized: () => {
          logout();
          triggerLogin();
          showWarning(m.auth_session_expired());
        },
        onForbidden: () => {
          showError(m.auth_error_forbidden());
        },
      });
    },
    [getAuthHeaders, triggerLogin, logout, showError, showWarning],
  );

  return authenticatedFetch;
}
