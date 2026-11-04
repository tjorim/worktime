import { clearPushSubscription } from "@/utils/pushNotifications";
import { TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useLayoutEffect,
} from "react";
import { useAuth as useOidcAuth } from "react-oidc-context";
import * as m from "@/paraglide/messages.js";
import { useToast } from "@/contexts/ToastContext";
import { logger } from "@/utils/logger";
import { setSyncCollectionAuthResolving } from "@/db/collections";
import { discardPendingSyncOutbox } from "@/utils/syncClient";

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
   * screen. Concurrent callers share one renewal. Pass the rejected token to
   * reuse a newer token if another caller already recovered the session.
   * The returned token is available before React renders the renewed user.
   */
  renewSession: (failedToken?: string | null) => Promise<string | null>;
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

  const { showError, addToast, removeToast } = useToast();
  const lastDisplayedOidcErrorRef = useRef<unknown>(null);
  const sessionWarningToastIdRef = useRef<string | null>(null);

  // Let db/collections.ts tell a write made right now apart from a write
  // made once we're settled as signed-out/local-only — see
  // setSyncCollectionAuthResolving's own comment for why that distinction
  // matters (a shared-device cross-account data leak, not just staleness).
  //
  // That gate alone still leaves one gap: an existing session that starts
  // resolving and then fails (or finds nothing) also ends with isValidating
  // false, but never produces a userId for setSyncCollectionAuth to drain
  // the pending queue into. Left alone, whatever was queued during that
  // window would sit there for a *different* user's next sign-in on this
  // device to silently claim. Catch that specific transition — isValidating
  // true -> false without isAuthenticated ever becoming true — and discard
  // the pending queue instead.
  const wasValidatingRef = useRef(false);
  useEffect(() => {
    setSyncCollectionAuthResolving(isValidating);
    if (wasValidatingRef.current && !isValidating && !isAuthenticated) {
      discardPendingSyncOutbox();
    }
    wasValidatingRef.current = isValidating;
  }, [isValidating, isAuthenticated]);

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
    showError(m.auth_error_oidc());
  }, [oidcAuth.error, showError]);

  // Keep callbacks usable by requests that started before the latest render.
  const sessionRef = useRef({ userId, token: oidcAuth.user?.access_token ?? null });
  const renderedUserRef = useRef(oidcAuth.user);
  useLayoutEffect(() => {
    if (renderedUserRef.current === oidcAuth.user) return;
    renderedUserRef.current = oidcAuth.user;
    if (sessionRef.current.userId === userId) {
      sessionRef.current.token = oidcAuth.user?.access_token ?? null;
    } else {
      sessionRef.current = { userId, token: oidcAuth.user?.access_token ?? null };
    }
  }, [oidcAuth.user, userId]);
  const renewalRef = useRef<{
    session: typeof sessionRef.current;
    promise: Promise<string | null>;
  } | null>(null);

  // Preserve token-change notifications for consumers whose effects depend on
  // this getter, while old request callbacks still read the latest session.
  const getAccessToken = useCallback(() => sessionRef.current.token, [oidcAuth.user]);

  const renewSession = useCallback(
    (failedToken?: string | null): Promise<string | null> => {
      const session = sessionRef.current;
      if (failedToken !== undefined && session.token !== failedToken) {
        return Promise.resolve(session.token);
      }
      if (renewalRef.current?.session === session) {
        return renewalRef.current.promise;
      }
      const startingToken = session.token;
      const promise = Promise.resolve().then(async () => {
        try {
          const renewedUser = await oidcAuth.signinSilent();
          const current = sessionRef.current;
          if (current !== session) return null;
          if (renewedUser?.profile?.sub && renewedUser.profile.sub !== session.userId) return null;
          current.token = renewedUser?.access_token ?? null;
          return current.token;
        } catch (error: unknown) {
          logger.error("signinSilent failed:", error);
          const current = sessionRef.current;
          return current === session && current.token !== startingToken ? current.token : null;
        } finally {
          if (renewalRef.current?.promise === promise) renewalRef.current = null;
        }
      });
      renewalRef.current = { session, promise };
      return promise;
    },
    [oidcAuth],
  );

  const triggerLogin = useCallback(() => {
    oidcAuth
      .signinRedirect({
        state: {
          returnTo: window.location.pathname === "/auth/callback" ? "/" : window.location.pathname,
        },
      })
      .catch((error: unknown) => {
        logger.error("signinRedirect failed:", error);
        showError(m.auth_error_redirect_signin());
      });
  }, [oidcAuth, showError]);

  useEffect(() => {
    if (!oidcAuth.events) {
      return;
    }

    // Own proactive renewal so it shares the same flight as 401 recovery.
    const handleAccessTokenExpiring = () => {
      void renewSession();
    };

    // These two mean the session is actually gone, so they are worth a toast —
    // and both are actionable, so the toast carries the sign-in affordance
    // rather than only telling the user to find it themselves.
    const warnSessionEnded = (message: string) => {
      if (sessionWarningToastIdRef.current !== null) {
        removeToast(sessionWarningToastIdRef.current);
      }
      sessionWarningToastIdRef.current = addToast({
        message,
        variant: "warning",
        icon: TriangleAlertIcon,
        // The default 4s autohide is not long enough to notice a toast and
        // reach its button; match the error delay so the action stays usable.
        delay: 10000,
        action: { label: m.account_sign_in_btn(), onClick: triggerLogin },
      });
    };

    // A transient renewal failure can be followed by a successful automatic
    // retry. Once a fresh user/token is loaded, the sign-in warning is stale.
    const handleUserLoaded = () => {
      if (sessionWarningToastIdRef.current !== null) {
        removeToast(sessionWarningToastIdRef.current);
        sessionWarningToastIdRef.current = null;
      }
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
    oidcAuth.events.addUserLoaded(handleUserLoaded);

    return () => {
      oidcAuth.events?.removeAccessTokenExpiring(handleAccessTokenExpiring);
      oidcAuth.events?.removeAccessTokenExpired(handleAccessTokenExpired);
      oidcAuth.events?.removeSilentRenewError(handleSilentRenewError);
      oidcAuth.events?.removeUserLoaded(handleUserLoaded);
    };
  }, [oidcAuth.events, addToast, removeToast, triggerLogin, renewSession]);

  const triggerSignup = useCallback(() => {
    // Most OIDC providers handle sign-up via the same redirect flow.
    // Providers like authentik support a registration URL that can be configured.
    oidcAuth
      .signinRedirect({ state: { returnTo: window.location.pathname } })
      .catch((error: unknown) => {
        logger.error("signinRedirect (signup) failed:", error);
        showError(m.auth_error_redirect_signup());
      });
  }, [oidcAuth, showError]);

  const logout = useCallback(() => {
    void clearPushSubscription(getAccessToken())
      .then(() => oidcAuth.signoutRedirect())
      .catch((error: unknown) => {
        logger.error("signoutRedirect failed:", error);
        showError(m.auth_error_signout());
      });
  }, [oidcAuth, showError, getAccessToken]);

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
