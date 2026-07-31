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
 * - On 401 Unauthorized, tries one silent token renewal before giving up — a 401
 *   usually means the access token aged out while the Keycloak session is still
 *   valid, since `automaticSilentRenew`'s proactive timer isn't the only way a
 *   token goes stale. Only redirects to the login page (with a session-expired
 *   toast) if that renewal also fails.
 * - Shows an error toast on 403 Forbidden, keeping the session intact.
 *
 * Must be used inside AuthProvider and ToastProvider.
 *
 * @returns `apiFetch(url, init?)` — a fetch wrapper with error handling.
 */
export function useApiClient() {
  const { triggerLogin, getAccessToken, renewSession } = useAuth();
  const { showError, showWarning } = useToast();

  const authenticatedFetch = useCallback(
    async (
      url: string,
      init: AuthenticatedRequestInit = {},
    ): Promise<Response> => {
      const { suppressUnauthorizedRedirect = false, ...requestInit } = init;

      const attempt = () => {
        const token = getAccessToken();
        const headers = new Headers(requestInit.headers);
        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }
        return apiFetch(
          url,
          { ...requestInit, headers },
          {
            // Handled below instead: a bare 401 here might still be recoverable
            // via a silent renewal, so nothing is reported as a session failure
            // until that attempt has actually failed.
            onUnauthorized: () => {},
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
      };

      try {
        return await attempt();
      } catch (error: unknown) {
        if (!(error instanceof Error) || !error.message.startsWith("Unauthorized")) {
          throw error;
        }

        if (await renewSession()) {
          try {
            return await attempt();
          } catch (retryError: unknown) {
            if (!(retryError instanceof Error) || !retryError.message.startsWith("Unauthorized")) {
              throw retryError;
            }
            // Renewal reported success but the retry still hit a 401 — fall through
            // to the same session-expired handling as a failed renewal.
          }
        }

        showWarning(m.auth_session_expired());
        if (!suppressUnauthorizedRedirect) {
          triggerLogin();
        }
        throw error;
      }
    },
    [triggerLogin, getAccessToken, renewSession, showError, showWarning],
  );

  return authenticatedFetch;
}
