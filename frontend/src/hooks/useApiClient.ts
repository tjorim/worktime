import { useCallback, useRef, useLayoutEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { apiFetch } from "@/utils/apiClient";
import { isUnauthorizedError } from "@/utils/apiError";
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
 *   valid. Proactive and reactive renewal share one flight, and late 401s reuse
 *   a newer token. Only redirects to the login page (with a session-expired
 *   toast) if recovery fails for the same account.
 * - Shows an error toast on 403 Forbidden, keeping the session intact.
 *
 * Must be used inside AuthProvider and ToastProvider.
 *
 * @returns `apiFetch(url, init?)` — a fetch wrapper with error handling.
 */
export function useApiClient() {
  const { triggerLogin, getAccessToken, renewSession, userId } = useAuth();
  const { showError, showWarning } = useToast();
  const currentUserId = useRef(userId);
  useLayoutEffect(() => {
    currentUserId.current = userId;
  }, [userId]);

  const authenticatedFetch = useCallback(
    async (url: string, init: AuthenticatedRequestInit = {}): Promise<Response> => {
      const { suppressUnauthorizedRedirect = false, ...requestInit } = init;

      const attempt = (tokenOverride?: string | null) => {
        const token = tokenOverride !== undefined ? tokenOverride : getAccessToken();
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

      const requestUserId = currentUserId.current;
      const requestToken = getAccessToken();
      try {
        return await attempt(requestToken);
      } catch (error: unknown) {
        if (!isUnauthorizedError(error)) {
          throw error;
        }

        if (currentUserId.current !== requestUserId) throw error;
        const renewedToken = await renewSession(requestToken);
        if (currentUserId.current !== requestUserId) throw error;
        if (renewedToken) {
          try {
            return await attempt(renewedToken);
          } catch (retryError: unknown) {
            if (!isUnauthorizedError(retryError)) {
              throw retryError;
            }
            // Renewal reported success but the retry still hit a 401 — fall through
            // to the same session-expired handling as a failed renewal.
          }
        }

        if (currentUserId.current !== requestUserId) throw error;
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
