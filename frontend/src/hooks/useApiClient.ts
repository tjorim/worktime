import { useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useDeveloperOptions } from "../contexts/DeveloperOptionsContext";
import { useToast } from "../contexts/ToastContext";
import { apiFetch } from "../utils/apiClient";
import * as m from "../paraglide/messages.js";

/**
 * Hook that returns a `apiFetch` function with standard error handling.
 *
 * The returned function automatically:
 * - Redirects to the login page on 401 Unauthorized and shows a session-expired toast.
 * - Shows an error toast and clears auth on 403 Forbidden.
 *
 * Session credentials are managed by SuperTokens session cookies.
 *
 * Must be used inside AuthProvider and ToastProvider.
 *
 * @returns `apiFetch(url, init?)` — a fetch wrapper with error handling.
 */
export function useApiClient() {
  const { triggerLogin, logout } = useAuth();
  const { options } = useDeveloperOptions();
  const { showError, showWarning } = useToast();

  const authenticatedFetch = useCallback(
    async (url: string, init: RequestInit = {}): Promise<Response> => {
      return apiFetch(url, init, {
        apiUrl: options.apiUrl,
        onUnauthorized: () => {
          logout();
          triggerLogin();
          showWarning(m.auth_session_expired());
        },
        onForbidden: () => {
          logout();
          showError(m.auth_error_forbidden());
        },
      });
    },
    [options.apiUrl, triggerLogin, logout, showError, showWarning],
  );

  return authenticatedFetch;
}
