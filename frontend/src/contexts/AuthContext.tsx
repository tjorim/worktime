import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useAuth as useOidcAuth } from "react-oidc-context";
import * as m from "@/paraglide/messages.js";
import { useToast } from "./ToastContext";
import { logger } from "@/utils/logger";

export interface AuthContextType {
  /** Whether the user has an active OIDC session. */
  isAuthenticated: boolean;
  /** True while the OIDC session is loading. */
  isValidating: boolean;
  /** OIDC subject claim (stable external identity key), or null when not authenticated. */
  userId: string | null;
  /** Human-readable display name from the OIDC token claims, or null. */
  displayName: string | null;
  /** Returns the current OIDC access token, or null when not authenticated. */
  getAccessToken: () => string | null;
  /** Redirect to the OIDC provider sign-in page. */
  triggerLogin: () => void;
  /** Redirect to the OIDC provider sign-in page (sign-up handled by provider). */
  triggerSignup: () => void;
  /** Sign out from the OIDC provider and clear the local session. */
  logout: () => void;
  /**
   * Attempts a silent token renewal against the IdP session, resolving with the
   * fresh access token when one was obtained, or null otherwise. Lets callers
   * recover from a single 401 instead of throwing the user out to the login
   * screen. Returns the token itself — rather than a boolean — because
   * getAccessToken() would still read the pre-renewal token immediately after:
   * the OIDC user state this resolves into hasn't reached a re-render yet in
   * the same synchronous continuation, so a caller re-reading it would retry
   * with the stale token and force a spurious logout.
   */
  renewSession: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * Hook to access the authentication context.
 *
 * @throws {Error} If used outside of an AuthProvider
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Provides authentication state to the application.
 *
 * Delegates session management to the configured OIDC provider via
 * react-oidc-context. Must be rendered inside an OidcAuthProvider.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const oidcAuth = useOidcAuth();

  const isValidating = oidcAuth.isLoading;
  const isAuthenticated = oidcAuth.isAuthenticated;
  const userId = oidcAuth.user?.profile.sub ?? null;
  const displayName =
    (oidcAuth.user?.profile.name as string | undefined) ??
    (oidcAuth.user?.profile.preferred_username as string | undefined) ??
    null;

  const { showError, addToast } = useToast();
  const lastDisplayedOidcErrorRef = useRef<unknown>(null);

  useEffect(() => {
    if (!oidcAuth.error) {
      lastDisplayedOidcErrorRef.current = null;
      return;
    }

    if (lastDisplayedOidcErrorRef.current === oidcAuth.error) {
      return;
    }

    lastDisplayedOidcErrorRef.current = oidcAuth.error;
    logger.error("OIDC authentication error:", oidcAuth.error);
    const errorMessage =
      oidcAuth.error instanceof Error && oidcAuth.error.message.trim() !== ""
        ? oidcAuth.error.message
        : m.auth_error_unknown();
    showError(m.auth_error_oidc({ message: errorMessage }));
  }, [oidcAuth.error, showError]);

  const getAccessToken = useCallback((): string | null => {
    return oidcAuth.user?.access_token ?? null;
  }, [oidcAuth.user]);

  const triggerLogin = useCallback(() => {
    oidcAuth.signinRedirect({ state: { returnTo: window.location.pathname } }).catch((error: unknown) => {
      logger.error("signinRedirect failed:", error);
      showError(m.auth_error_redirect_signin());
    });
  }, [oidcAuth, showError]);

  useEffect(() => {
    if (!oidcAuth.events) {
      return;
    }

    // `accessTokenExpiring` fires 60s before every expiry, and the timer is
    // re-armed each time a token is loaded — so with automaticSilentRenew on it
    // recurs for the whole session. Renewal is about to happen silently and
    // nothing is wrong yet, so this stays a log line: toasting here told users
    // to save their work and sign in again every few minutes for no reason.
    const handleAccessTokenExpiring = () => {
      logger.debug("OIDC access token is expiring soon; silent renew should follow.");
    };

    // These two mean the session is actually gone, so they are worth a toast —
    // and both are actionable, so the toast carries the sign-in affordance
    // rather than only telling the user to find it themselves.
    const warnSessionEnded = (message: string) => {
      addToast({
        message,
        variant: "warning",
        icon: "bi-exclamation-triangle-fill",
        // The default 4s autohide is not long enough to notice a toast and
        // reach its button; match the error delay so the action stays usable.
        delay: 10000,
        action: { label: m.account_sign_in_btn(), onClick: triggerLogin },
      });
    };

    const handleAccessTokenExpired = () => {
      logger.warn("OIDC access token expired without a successful renewal.");
      warnSessionEnded(m.auth_session_expired());
    };

    const handleSilentRenewError = (error: Error) => {
      logger.error("OIDC silent renew failed:", error);
      warnSessionEnded(m.auth_silent_renew_failed());
    };

    oidcAuth.events.addAccessTokenExpiring(handleAccessTokenExpiring);
    oidcAuth.events.addAccessTokenExpired(handleAccessTokenExpired);
    oidcAuth.events.addSilentRenewError(handleSilentRenewError);

    return () => {
      oidcAuth.events?.removeAccessTokenExpiring(handleAccessTokenExpiring);
      oidcAuth.events?.removeAccessTokenExpired(handleAccessTokenExpired);
      oidcAuth.events?.removeSilentRenewError(handleSilentRenewError);
    };
  }, [oidcAuth.events, addToast, triggerLogin]);

  const triggerSignup = useCallback(() => {
    // Most OIDC providers handle sign-up via the same redirect flow.
    // Providers like authentik support a registration URL that can be configured.
    oidcAuth.signinRedirect({ state: { returnTo: window.location.pathname } }).catch((error: unknown) => {
      logger.error("signinRedirect (signup) failed:", error);
      showError(m.auth_error_redirect_signup());
    });
  }, [oidcAuth, showError]);

  const logout = useCallback(() => {
    oidcAuth.signoutRedirect().catch((error: unknown) => {
      logger.error("signoutRedirect failed:", error);
      showError(m.auth_error_signout());
    });
  }, [oidcAuth, showError]);

  const renewSession = useCallback(async (): Promise<string | null> => {
    try {
      // Resolves null when the IdP session is genuinely gone, which is a normal
      // outcome here rather than an error worth surfacing — the caller decides
      // what to do next.
      const renewedUser = await oidcAuth.signinSilent();
      return renewedUser?.access_token ?? null;
    } catch (error: unknown) {
      logger.error("signinSilent failed:", error);
      return null;
    }
  }, [oidcAuth]);

  const contextValue = useMemo<AuthContextType>(
    () => ({
      isAuthenticated,
      isValidating,
      userId,
      displayName,
      getAccessToken,
      triggerLogin,
      triggerSignup,
      logout,
      renewSession,
    }),
    [
      isAuthenticated,
      isValidating,
      userId,
      displayName,
      getAccessToken,
      triggerLogin,
      triggerSignup,
      logout,
      renewSession,
    ],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

