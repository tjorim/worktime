import { useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { apiFetch } from "@/utils/apiClient";
import * as m from "@/paraglide/messages.js";

export interface AuthenticatedRequestInit extends RequestInit {
  /**
   * When true, 401 responses show the session-expired warning without starting
   * an OIDC redirect. Use this for passive/background work that must not yank
   * the user away from unsaved edits.
   */
  suppressUnauthorizedRedirect?: boolean;
}

/**
 * Hook that returns an `apiFetch` function with standard error handling.
 *
 * The returned function automatically:
 * - Injects the OIDC Bearer token into the `Authorization` header.
 * - Redirects to the login page on 401 Unauthorized and shows a session-expired toast.
 *   This avoids also starting logout, so only one OIDC navigation is triggered.
 * - Shows an error toast on 403 Forbidden, keeping the session intact.
 *
 * Must be used inside AuthProvider and ToastProvider.
 *
 * @returns `apiFetch(url, init?)` — a fetch wrapper with error handling.
 */
export function useApiClient() {
  const { triggerLogin, getAccessToken } = useAuth();
  const { showError, showWarning } = useToast();

  const authenticatedFetch = useCallback(
    async (
      url: string,
      init: AuthenticatedRequestInit = {},
    ): Promise<Response> => {
      const { suppressUnauthorizedRedirect = false, ...requestInit } = init;
      const token = getAccessToken();
      const headers = new Headers(requestInit.headers);
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      return apiFetch(
        url,
        { ...requestInit, headers },
        {
          onUnauthorized: () => {
            showWarning(m.auth_session_expired());
            if (!suppressUnauthorizedRedirect) {
              triggerLogin();
            }
          },
          // 403 is an authorization boundary, not a broken session: the backend
          // returns it for admin-only endpoints, user-id mismatches, and the
          // OIDC-only surfaces a Pebble token cannot reach. The session is still
          // valid, so signing the user out of the whole app is the wrong remedy —
          // report the denial and leave them where they are.
          onForbidden: () => {
            showError(m.auth_error_forbidden());
          },
        },
      );
    },
    [triggerLogin, getAccessToken, showError, showWarning],
  );

  return authenticatedFetch;
}
