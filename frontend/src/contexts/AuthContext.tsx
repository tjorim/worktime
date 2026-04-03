import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";
import { redirectToAuth } from "supertokens-auth-react";
import Session, { useSessionContext } from "supertokens-auth-react/recipe/session";
import { useToast } from "./ToastContext";

export interface AuthContextType {
  /** Whether the user has an active SuperTokens session. */
  isAuthenticated: boolean;
  /** True while the SuperTokens session context is loading. */
  isValidating: boolean;
  /** User ID (string) from the SuperTokens session, or null when not authenticated. */
  userId: string | null;
  /** Human-readable display name from the access token payload, or null. */
  displayName: string | null;
  /** Redirect to the SuperTokens login page. */
  triggerLogin: () => void;
  /** Sign out and end the SuperTokens session. */
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
 * Delegates session management to SuperTokens. Session cookies and token
 * refresh are handled automatically by the SuperTokens session recipe.
 *
 * Must be rendered inside both a SuperTokensWrapper and a ToastProvider.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const session = useSessionContext();

  const isValidating = session.loading;
  const isAuthenticated = !session.loading && session.doesSessionExist;
  const userId = !session.loading && session.doesSessionExist ? session.userId : null;
  // displayName is populated from a custom claim injected by the backend (PR #469).
  // It will be null when authenticated but the backend has not yet set this claim.
  const displayName =
    !session.loading && session.doesSessionExist
      ? (((session.accessTokenPayload?.displayName as string | undefined) ??
          (session.accessTokenPayload?.display_name as string | undefined)) ??
        null)
      : null;

  const { showError } = useToast();

  const triggerLogin = useCallback(() => {
    redirectToAuth({ show: "signin" }).catch(() => {
      showError("Failed to redirect to the login page. Please refresh and try again.");
    });
  }, [showError]);

  const logout = useCallback(() => {
    Session.signOut().catch(() => {
      showError("Sign out failed. Please refresh the page.");
    });
  }, [showError]);

  const contextValue = useMemo<AuthContextType>(
    () => ({
      isAuthenticated,
      isValidating,
      userId,
      displayName,
      triggerLogin,
      logout,
    }),
    [isAuthenticated, isValidating, userId, displayName, triggerLogin, logout],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
