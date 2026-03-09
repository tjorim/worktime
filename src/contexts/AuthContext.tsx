import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useDeveloperOptions } from "./DeveloperOptionsContext";

const AUTH_SESSION_KEY = "worktime_auth";

interface StoredAuth {
  token: string;
  userId: number;
  displayName: string;
  expiresAt: number; // Unix ms timestamp
}

function loadStoredAuth(): StoredAuth | null {
  try {
    const raw = sessionStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredAuth;
    // Treat token as expired if within 60 seconds of expiry to prevent edge-case 401s
    if (Date.now() >= data.expiresAt - 60_000) {
      sessionStorage.removeItem(AUTH_SESSION_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function saveStoredAuth(data: StoredAuth): void {
  sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(data));
}

function clearStoredAuth(): void {
  sessionStorage.removeItem(AUTH_SESSION_KEY);
}

interface MeResponse {
  id: number;
  display_name: string;
}

interface TokenApiResponse {
  access_token: string;
  expires_in: number;
}

export interface AuthContextType {
  /** Whether the user has a valid, unexpired token. */
  isAuthenticated: boolean;
  /** True while validating a stored token against the backend on connect. */
  isValidating: boolean;
  /** Numeric user ID returned by the backend, or null when not authenticated. */
  userId: number | null;
  /** Human-readable display name, or null when not authenticated. */
  displayName: string | null;
  /** Whether the login modal should be visible. */
  showLoginModal: boolean;
  /** Authenticate with username and password. Throws on failure. */
  login: (username: string, password: string) => Promise<void>;
  /** Clear auth state and sessionStorage. */
  logout: () => void;
  /** Programmatically show the login modal (e.g. on 401). */
  triggerLogin: () => void;
  /** Dismiss the login modal without logging in. */
  dismissLogin: () => void;
  /** Return the Authorization header object when authenticated, or empty object. */
  getAuthHeaders: () => HeadersInit;
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
 * Stores the JWT in sessionStorage and validates it against the backend
 * whenever the backend connection is established. Shows the login modal
 * when the backend is connected but no valid token exists.
 *
 * Must be rendered inside both DeveloperOptionsProvider and ToastProvider.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const { options } = useDeveloperOptions();
  const { apiUrl, connectionStatus, enabled } = options;

  // Initialize from sessionStorage on first render
  const [token, setToken] = useState<string | null>(() => loadStoredAuth()?.token ?? null);
  const [userId, setUserId] = useState<number | null>(() => loadStoredAuth()?.userId ?? null);
  const [displayName, setDisplayName] = useState<string | null>(
    () => loadStoredAuth()?.displayName ?? null,
  );
  const [expiresAt, setExpiresAt] = useState<number | null>(
    () => loadStoredAuth()?.expiresAt ?? null,
  );
  const [isValidating, setIsValidating] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const stored = loadStoredAuth();
    return stored !== null && Date.now() < stored.expiresAt - 60_000;
  });
  const currentTokenRef = useRef<string | null>(token);
  currentTokenRef.current = token;

  useEffect(() => {
    if (!token || expiresAt === null) {
      setIsAuthenticated(false);
      return;
    }

    const timeoutMs = expiresAt - 60_000 - Date.now();
    if (timeoutMs <= 0) {
      setIsAuthenticated(false);
      return;
    }

    setIsAuthenticated(true);
    const timeoutId = window.setTimeout(() => {
      setIsAuthenticated(false);
    }, timeoutMs);

    return () => window.clearTimeout(timeoutId);
  }, [token, expiresAt]);

  const clearAuthState = useCallback(() => {
    clearStoredAuth();
    setToken(null);
    setUserId(null);
    setDisplayName(null);
    setExpiresAt(null);
  }, []);

  /**
   * When the backend connects, validate any stored token via GET /v1/auth/me.
   * Show the login modal if no valid token exists or validation fails.
   */
  useEffect(() => {
    if (!enabled || connectionStatus !== "connected") {
      return;
    }

    const stored = loadStoredAuth();
    if (!stored) {
      clearAuthState();
      setShowLoginModal(true);
      return;
    }

    setIsValidating(true);
    const controller = new AbortController();
    const requestToken = stored.token;
    const isStaleRequest = () =>
      controller.signal.aborted || requestToken !== currentTokenRef.current;

    fetch(`${apiUrl}/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${stored.token}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    })
      .then((response) => {
        if (isStaleRequest()) return null;
        if (!response.ok) throw new Error("Token validation failed");
        return response.json() as Promise<MeResponse>;
      })
      .then((user) => {
        if (!user || isStaleRequest()) return;
        setToken(stored.token);
        setUserId(user.id);
        setDisplayName(user.display_name);
        setExpiresAt(stored.expiresAt);
      })
      .catch((error: unknown) => {
        if (isStaleRequest()) return;
        if (error instanceof Error && error.name === "AbortError") return;
        clearAuthState();
        setShowLoginModal(true);
      })
      .finally(() => {
        if (!isStaleRequest()) {
          setIsValidating(false);
        }
      });

    return () => controller.abort();
  }, [apiUrl, enabled, connectionStatus, clearAuthState]);

  const login = useCallback(
    async (username: string, password: string): Promise<void> => {
      const tokenResponse = await fetch(`${apiUrl}/v1/auth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      if (!tokenResponse.ok) {
        if (tokenResponse.status === 429) {
          throw new Error("rate_limited");
        }
        if (tokenResponse.status === 401) {
          throw new Error("invalid_credentials");
        }
        throw new Error("generic");
      }

      const tokenData = (await tokenResponse.json()) as TokenApiResponse;
      const newExpiresAt = Date.now() + tokenData.expires_in * 1000;

      // Fetch user info with the new token
      const meResponse = await fetch(`${apiUrl}/v1/auth/me`, {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: "application/json",
        },
      });

      if (!meResponse.ok) {
        throw new Error("generic");
      }

      const user = (await meResponse.json()) as MeResponse;

      saveStoredAuth({
        token: tokenData.access_token,
        userId: user.id,
        displayName: user.display_name,
        expiresAt: newExpiresAt,
      });

      setToken(tokenData.access_token);
      setUserId(user.id);
      setDisplayName(user.display_name);
      setExpiresAt(newExpiresAt);
      setShowLoginModal(false);
    },
    [apiUrl],
  );

  const logout = useCallback(() => {
    clearAuthState();
  }, [clearAuthState]);

  const triggerLogin = useCallback(() => {
    setShowLoginModal(true);
  }, []);

  const dismissLogin = useCallback(() => {
    setShowLoginModal(false);
  }, []);

  const getAuthHeaders = useCallback((): HeadersInit => {
    if (!token || !isAuthenticated) return {};
    return { Authorization: `Bearer ${token}` };
  }, [token, isAuthenticated]);

  const contextValue = useMemo<AuthContextType>(
    () => ({
      isAuthenticated,
      isValidating,
      userId,
      displayName,
      showLoginModal,
      login,
      logout,
      triggerLogin,
      dismissLogin,
      getAuthHeaders,
    }),
    [
      isAuthenticated,
      isValidating,
      userId,
      displayName,
      showLoginModal,
      login,
      logout,
      triggerLogin,
      dismissLogin,
      getAuthHeaders,
    ],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
