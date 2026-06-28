import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";
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

  const { showError } = useToast();

  const getAccessToken = useCallback((): string | null => {
    return oidcAuth.user?.access_token ?? null;
  }, [oidcAuth.user]);

  const triggerLogin = useCallback(() => {
    oidcAuth.signinRedirect({ state: { returnTo: window.location.pathname } }).catch((error: unknown) => {
      logger.error("signinRedirect failed:", error);
      showError(m.auth_error_redirect_signin());
    });
  }, [oidcAuth, showError]);

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
    }),
    [isAuthenticated, isValidating, userId, displayName, getAccessToken, triggerLogin, triggerSignup, logout],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

