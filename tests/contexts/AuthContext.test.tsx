import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEVELOPER_OPTIONS_STORAGE_KEY } from "../../src/constants/storageKeys";
import { AuthProvider, useAuth } from "../../src/contexts/AuthContext";
import { DeveloperOptionsProvider } from "../../src/contexts/DeveloperOptionsContext";
import { ToastProvider } from "../../src/contexts/ToastContext";

// Minimal wrapper to expose auth context values via a test component
function AuthStatusDisplay() {
  const { isAuthenticated, userId, displayName, showLoginModal, isValidating } = useAuth();
  return (
    <div>
      <span data-testid="is-authenticated">{String(isAuthenticated)}</span>
      <span data-testid="user-id">{userId ?? "null"}</span>
      <span data-testid="display-name">{displayName ?? "null"}</span>
      <span data-testid="show-login-modal">{String(showLoginModal)}</span>
      <span data-testid="is-validating">{String(isValidating)}</span>
    </div>
  );
}

function AuthActions() {
  const { login, logout, triggerLogin, dismissLogin } = useAuth();
  return (
    <div>
      <button onClick={() => login("alice", "secret")}>login</button>
      <button onClick={logout}>logout</button>
      <button onClick={triggerLogin}>triggerLogin</button>
      <button onClick={dismissLogin}>dismissLogin</button>
    </div>
  );
}

interface RenderOptions {
  enabled?: boolean;
  connectionStatus?: "disconnected" | "connecting" | "connected" | "error";
  autoConnect?: boolean;
}

function renderWithProviders(ui: React.ReactElement, options: RenderOptions = {}) {
  const { enabled, connectionStatus, autoConnect } = options;

  if (enabled !== undefined || connectionStatus !== undefined || autoConnect !== undefined) {
    localStorage.setItem(
      DEVELOPER_OPTIONS_STORAGE_KEY,
      JSON.stringify({
        enabled: enabled ?? false,
        apiUrl: "http://localhost:8000",
        connectionStatus: connectionStatus ?? "disconnected",
        lastConnectionTest: null,
        autoConnect: autoConnect ?? false,
        isDevMode: false,
      }),
    );
  }

  return render(
    <DeveloperOptionsProvider>
      <ToastProvider>
        <AuthProvider>{ui}</AuthProvider>
      </ToastProvider>
    </DeveloperOptionsProvider>,
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("initial state", () => {
    it("is not authenticated by default", () => {
      renderWithProviders(<AuthStatusDisplay />);
      expect(screen.getByTestId("is-authenticated")).toHaveTextContent("false");
      expect(screen.getByTestId("user-id")).toHaveTextContent("null");
      expect(screen.getByTestId("display-name")).toHaveTextContent("null");
    });

    it("does not show login modal initially when backend is disconnected", () => {
      renderWithProviders(<AuthStatusDisplay />);
      expect(screen.getByTestId("show-login-modal")).toHaveTextContent("false");
    });

    it("loads valid token from sessionStorage", async () => {
      const expiresAt = Date.now() + 3_600_000;
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/v1/health")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ status: "ok" }),
          };
        }

        if (url.endsWith("/v1/auth/me")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 7, display_name: "Bob" }),
          };
        }

        throw new Error(`Unexpected fetch URL: ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      sessionStorage.setItem(
        "worktime_auth",
        JSON.stringify({
          token: "stored-token",
          userId: 7,
          displayName: "Bob",
          expiresAt,
        }),
      );
      renderWithProviders(<AuthStatusDisplay />, { enabled: true, connectionStatus: "connected", autoConnect: true });

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith("http://localhost:8000/v1/auth/me", {
          headers: {
            Authorization: "Bearer stored-token",
            Accept: "application/json",
          },
          signal: expect.any(AbortSignal),
        });
      });
      expect(screen.getByTestId("is-authenticated")).toHaveTextContent("true");
      expect(screen.getByTestId("user-id")).toHaveTextContent("7");
      expect(screen.getByTestId("display-name")).toHaveTextContent("Bob");
    });

    it("ignores expired token in sessionStorage", () => {
      const expiresAt = Date.now() - 1000;
      sessionStorage.setItem(
        "worktime_auth",
        JSON.stringify({ token: "old", userId: 1, displayName: "X", expiresAt }),
      );
      renderWithProviders(<AuthStatusDisplay />, { enabled: true, connectionStatus: "connected" });
      expect(screen.getByTestId("is-authenticated")).toHaveTextContent("false");
    });
  });

  describe("triggerLogin / dismissLogin", () => {
    it("triggerLogin sets showLoginModal to true", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <>
          <AuthStatusDisplay />
          <AuthActions />
        </>,
      );
      expect(screen.getByTestId("show-login-modal")).toHaveTextContent("false");
      await user.click(screen.getByText("triggerLogin"));
      expect(screen.getByTestId("show-login-modal")).toHaveTextContent("true");
    });

    it("dismissLogin sets showLoginModal to false", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <>
          <AuthStatusDisplay />
          <AuthActions />
        </>,
      );
      await user.click(screen.getByText("triggerLogin"));
      expect(screen.getByTestId("show-login-modal")).toHaveTextContent("true");
      await user.click(screen.getByText("dismissLogin"));
      expect(screen.getByTestId("show-login-modal")).toHaveTextContent("false");
    });
  });

  describe("logout", () => {
    it("clears auth state and sessionStorage on logout", async () => {
      const user = userEvent.setup();
      const expiresAt = Date.now() + 3_600_000;
      sessionStorage.setItem(
        "worktime_auth",
        JSON.stringify({ token: "t", userId: 3, displayName: "Alice", expiresAt }),
      );
      renderWithProviders(
        <>
          <AuthStatusDisplay />
          <AuthActions />
        </>,
      );
      expect(screen.getByTestId("is-authenticated")).toHaveTextContent("true");
      await user.click(screen.getByText("logout"));
      expect(screen.getByTestId("is-authenticated")).toHaveTextContent("false");
      expect(screen.getByTestId("user-id")).toHaveTextContent("null");
      expect(sessionStorage.getItem("worktime_auth")).toBeNull();
    });
  });

  describe("login()", () => {
    it("calls /v1/auth/token and then /v1/auth/me on success", async () => {
      const user = userEvent.setup();
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ access_token: "jwt-token", expires_in: 86400 }),
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ id: 42, display_name: "Alice" }),
          }),
      );

      renderWithProviders(
        <>
          <AuthStatusDisplay />
          <AuthActions />
        </>,
      );

      await user.click(screen.getByText("login"));

      await waitFor(() => {
        expect(screen.getByTestId("is-authenticated")).toHaveTextContent("true");
      });
      expect(screen.getByTestId("user-id")).toHaveTextContent("42");
      expect(screen.getByTestId("display-name")).toHaveTextContent("Alice");
      expect(screen.getByTestId("show-login-modal")).toHaveTextContent("false");

      const stored = JSON.parse(sessionStorage.getItem("worktime_auth")!);
      expect(stored.token).toBe("jwt-token");
      expect(stored.userId).toBe(42);
    });

    it("throws 'invalid_credentials' error on 401 from token endpoint", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({ ok: false, status: 401 }),
      );

      let thrownError: Error | null = null;

      function LoginTester() {
        const { login } = useAuth();
        return (
          <button
            onClick={() =>
              login("bad", "creds").catch((e: Error) => {
                thrownError = e;
              })
            }
          >
            try-login
          </button>
        );
      }

      renderWithProviders(<LoginTester />);
      await userEvent.setup().click(screen.getByText("try-login"));
      await waitFor(() => expect(thrownError).not.toBeNull());
      expect(thrownError!.message).toBe("invalid_credentials");
    });

    it("throws 'rate_limited' error on 429 from token endpoint", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({ ok: false, status: 429 }),
      );

      let thrownError: Error | null = null;

      function LoginTester() {
        const { login } = useAuth();
        return (
          <button
            onClick={() =>
              login("u", "p").catch((e: Error) => {
                thrownError = e;
              })
            }
          >
            try-login
          </button>
        );
      }

      renderWithProviders(<LoginTester />);
      await userEvent.setup().click(screen.getByText("try-login"));
      await waitFor(() => expect(thrownError).not.toBeNull());
      expect(thrownError!.message).toBe("rate_limited");
    });
  });

  describe("getAuthHeaders()", () => {
    it("returns empty object when not authenticated", () => {
      let headers: HeadersInit = {};

      function HeaderReader() {
        const { getAuthHeaders } = useAuth();
        headers = getAuthHeaders();
        return null;
      }

      renderWithProviders(<HeaderReader />);
      expect(headers).toEqual({});
    });

    it("returns Authorization header when authenticated", () => {
      const expiresAt = Date.now() + 3_600_000;
      sessionStorage.setItem(
        "worktime_auth",
        JSON.stringify({ token: "my-jwt", userId: 1, displayName: "User", expiresAt }),
      );

      let headers: HeadersInit = {};

      function HeaderReader() {
        const { getAuthHeaders } = useAuth();
        headers = getAuthHeaders();
        return null;
      }

      renderWithProviders(<HeaderReader />);
      expect((headers as Record<string, string>)["Authorization"]).toBe("Bearer my-jwt");
    });
  });

  describe("useAuth outside provider", () => {
    it("throws when used outside AuthProvider", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      function BareComponent() {
        useAuth();
        return null;
      }

      expect(() => render(<BareComponent />)).toThrow(
        "useAuth must be used within an AuthProvider",
      );

      consoleSpy.mockRestore();
    });
  });
});
