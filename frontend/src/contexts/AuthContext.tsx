import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";
import { redirectToAuth } from "supertokens-auth-react";
import Session, { useSessionContext } from "supertokens-auth-react/recipe/session";

export interface AuthContextType {
  /** Whether the user has an active SuperTokens session. */
  isAuthenticated: boolean;
  /** True while the SuperTokens session context is loading. */
  isValidating: boolean;
  /** User ID from the SuperTokens session, or null when not authenticated. */
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
 * Must be rendered inside a SuperTokensWrapper.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const session = useSessionContext();

  const isValidating = session.loading;
  const isAuthenticated = !session.loading && session.doesSessionExist;
  const userId = !session.loading && session.doesSessionExist ? session.userId : null;
  const displayName =
    !session.loading && session.doesSessionExist
      ? ((session.accessTokenPayload?.displayName as string | undefined) ?? null)
      : null;

  const triggerLogin = useCallback(() => {
    void redirectToAuth({ show: "signin" });
  }, []);

  const logout = useCallback(() => {
    void Session.signOut();
  }, []);

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
