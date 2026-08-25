import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { appendToPendingSyncOutbox } from "@/utils/syncClient";
import { SYNC_PENDING_OUTBOX_KEY } from "@/constants/storageKeys";

// Mock react-oidc-context
const mockSigninRedirect = vi.fn().mockResolvedValue(undefined);
const mockRemoveUser = vi.fn().mockResolvedValue(undefined);
const mockSignoutRedirect = vi.fn().mockResolvedValue(undefined);
const mockSigninSilent = vi.fn();
const mockAddAccessTokenExpiring = vi.fn();
const mockRemoveAccessTokenExpiring = vi.fn();
const mockAddAccessTokenExpired = vi.fn();
const mockRemoveAccessTokenExpired = vi.fn();
const mockAddSilentRenewError = vi.fn();
const mockRemoveSilentRenewError = vi.fn();
let mockOidcAuth: Record<string, unknown> = {
  isAuthenticated: false,
  isLoading: true,
  user: null,
  signinRedirect: mockSigninRedirect,
  removeUser: mockRemoveUser,
  signoutRedirect: mockSignoutRedirect,
  signinSilent: mockSigninSilent,
  events: {
    addAccessTokenExpiring: mockAddAccessTokenExpiring,
    removeAccessTokenExpiring: mockRemoveAccessTokenExpiring,
    addAccessTokenExpired: mockAddAccessTokenExpired,
    removeAccessTokenExpired: mockRemoveAccessTokenExpired,
    addSilentRenewError: mockAddSilentRenewError,
    removeSilentRenewError: mockRemoveSilentRenewError,
  },
};

vi.mock("react-oidc-context", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => mockOidcAuth,
}));

// Minimal wrapper to expose auth context values via a test component
function AuthStatusDisplay() {
  const { isAuthenticated, userId, displayName, isValidating } = useAuth();
  return (
    <div>
      <span data-testid="is-authenticated">{String(isAuthenticated)}</span>
      <span data-testid="user-id">{userId ?? "null"}</span>
      <span data-testid="display-name">{displayName ?? "null"}</span>
      <span data-testid="is-validating">{String(isValidating)}</span>
    </div>
  );
}

function AuthActions() {
  const { triggerLogin, triggerSignup, logout } = useAuth();
  return (
    <div>
      <button onClick={logout}>logout</button>
      <button onClick={triggerLogin}>triggerLogin</button>
      <button onClick={triggerSignup}>triggerSignup</button>
    </div>
  );
}

function RenewSessionProbe() {
  const { renewSession } = useAuth();
  const [result, setResult] = useState<string>("idle");
  return (
    <div>
      <span data-testid="renew-result">{result}</span>
      <button
        onClick={() => {
          void renewSession().then((renewed) => setResult(String(renewed)));
        }}
      >
        renewSession
      </button>
    </div>
  );
}

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <ToastProvider>
      <AuthProvider>{ui}</AuthProvider>
    </ToastProvider>,
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOidcAuth = {
      isAuthenticated: false,
      isLoading: true,
      user: null,
      signinRedirect: mockSigninRedirect,
      removeUser: mockRemoveUser,
      signoutRedirect: mockSignoutRedirect,
      signinSilent: mockSigninSilent,
      events: {
        addAccessTokenExpiring: mockAddAccessTokenExpiring,
        removeAccessTokenExpiring: mockRemoveAccessTokenExpiring,
        addAccessTokenExpired: mockAddAccessTokenExpired,
        removeAccessTokenExpired: mockRemoveAccessTokenExpired,
        addSilentRenewError: mockAddSilentRenewError,
        removeSilentRenewError: mockRemoveSilentRenewError,
      },
    };
    mockSigninSilent.mockReset().mockResolvedValue({ access_token: "renewed-token" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initial state", () => {
    it("shows validating state when OIDC is loading", () => {
      mockOidcAuth = { ...mockOidcAuth, isLoading: true, isAuthenticated: false, user: null };
      renderWithProviders(<AuthStatusDisplay />);
      expect(screen.getByTestId("is-validating")).toHaveTextContent("true");
      expect(screen.getByTestId("is-authenticated")).toHaveTextContent("false");
      expect(screen.getByTestId("user-id")).toHaveTextContent("null");
    });

    it("is not authenticated when OIDC returns no user", () => {
      mockOidcAuth = { ...mockOidcAuth, isLoading: false, isAuthenticated: false, user: null };
      renderWithProviders(<AuthStatusDisplay />);
      expect(screen.getByTestId("is-authenticated")).toHaveTextContent("false");
      expect(screen.getByTestId("user-id")).toHaveTextContent("null");
      expect(screen.getByTestId("display-name")).toHaveTextContent("null");
    });

    it("is authenticated when OIDC returns a user", () => {
      mockOidcAuth = {
        ...mockOidcAuth,
        isLoading: false,
        isAuthenticated: true,
        user: {
          access_token: "tok-abc",
          profile: { sub: "sub-42", name: "Alice" },
        },
      };
      renderWithProviders(<AuthStatusDisplay />);
      expect(screen.getByTestId("is-authenticated")).toHaveTextContent("true");
      expect(screen.getByTestId("user-id")).toHaveTextContent("sub-42");
      expect(screen.getByTestId("display-name")).toHaveTextContent("Alice");
    });

    it("handles missing name in profile and falls back to preferred_username", () => {
      mockOidcAuth = {
        ...mockOidcAuth,
        isLoading: false,
        isAuthenticated: true,
        user: {
          access_token: "tok-abc",
          profile: { sub: "sub-7", preferred_username: "alice" },
        },
      };
      renderWithProviders(<AuthStatusDisplay />);
      expect(screen.getByTestId("is-authenticated")).toHaveTextContent("true");
      expect(screen.getByTestId("user-id")).toHaveTextContent("sub-7");
      expect(screen.getByTestId("display-name")).toHaveTextContent("alice");
    });

    it("returns null displayName when no name or preferred_username in profile", () => {
      mockOidcAuth = {
        ...mockOidcAuth,
        isLoading: false,
        isAuthenticated: true,
        user: {
          access_token: "tok-abc",
          profile: { sub: "sub-9" },
        },
      };
      renderWithProviders(<AuthStatusDisplay />);
      expect(screen.getByTestId("is-authenticated")).toHaveTextContent("true");
      expect(screen.getByTestId("display-name")).toHaveTextContent("null");
    });

    it("shows a toast when OIDC reports an authentication error", async () => {
      mockOidcAuth = {
        ...mockOidcAuth,
        isLoading: false,
        isAuthenticated: false,
        user: null,
        error: new Error("Invalid state parameter"),
      };

      renderWithProviders(<AuthStatusDisplay />);

      expect(await screen.findByText("Sign-in failed: Invalid state parameter")).toBeInTheDocument();
    });

    it("does not show duplicate toasts for the same OIDC error object", async () => {
      const error = new Error("Consent was denied");
      mockOidcAuth = {
        ...mockOidcAuth,
        isLoading: false,
        isAuthenticated: false,
        user: null,
        error,
      };

      const { rerender } = renderWithProviders(<AuthStatusDisplay />);
      expect(await screen.findByText("Sign-in failed: Consent was denied")).toBeInTheDocument();

      rerender(
        <ToastProvider>
          <AuthProvider>
            <AuthStatusDisplay />
          </AuthProvider>
        </ToastProvider>,
      );

      expect(screen.getAllByText("Sign-in failed: Consent was denied")).toHaveLength(1);
    });

    it("shows a toast again when the same OIDC error object recurs after being cleared", async () => {
      const error = new Error("Silent renew failed");
      mockOidcAuth = {
        ...mockOidcAuth,
        isLoading: false,
        isAuthenticated: false,
        user: null,
        error,
      };

      const { rerender } = renderWithProviders(<AuthStatusDisplay />);
      expect(await screen.findByText("Sign-in failed: Silent renew failed")).toBeInTheDocument();

      mockOidcAuth = { ...mockOidcAuth, error: null };
      rerender(
        <ToastProvider>
          <AuthProvider>
            <AuthStatusDisplay />
          </AuthProvider>
        </ToastProvider>,
      );

      mockOidcAuth = { ...mockOidcAuth, error };
      rerender(
        <ToastProvider>
          <AuthProvider>
            <AuthStatusDisplay />
          </AuthProvider>
        </ToastProvider>,
      );

      expect(screen.getAllByText("Sign-in failed: Silent renew failed")).toHaveLength(2);
    });

    it("stays silent while a token is merely approaching expiry", async () => {
      // automaticSilentRenew re-arms this event once per token, so toasting here
      // would nag for the whole session while nothing is actually wrong.
      mockOidcAuth = { ...mockOidcAuth, isLoading: false, isAuthenticated: true };

      renderWithProviders(<AuthStatusDisplay />);

      const handler = mockAddAccessTokenExpiring.mock.calls.at(-1)?.[0];
      expect(handler).toBeTypeOf("function");
      handler();

      expect(await screen.findByTestId("is-authenticated")).toBeInTheDocument();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("warns with a sign-in action once the access token has expired", async () => {
      mockOidcAuth = { ...mockOidcAuth, isLoading: false, isAuthenticated: true };

      renderWithProviders(<AuthStatusDisplay />);

      const handler = mockAddAccessTokenExpired.mock.calls.at(-1)?.[0];
      expect(handler).toBeTypeOf("function");
      handler();

      expect(
        await screen.findByText("Your session has expired. Please sign in again."),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Sign In" }));
      expect(mockSigninRedirect).toHaveBeenCalled();
    });

    it("warns when silent token renewal fails", async () => {
      mockOidcAuth = { ...mockOidcAuth, isLoading: false, isAuthenticated: true };

      renderWithProviders(<AuthStatusDisplay />);

      const handler = mockAddSilentRenewError.mock.calls.at(-1)?.[0];
      expect(handler).toBeTypeOf("function");
      handler(new Error("login_required"));

      expect(
        await screen.findByText("Your session could not be refreshed. Please sign in again to keep syncing changes."),
      ).toBeInTheDocument();
    });

    it("unsubscribes from OIDC session lifecycle events on unmount", () => {
      mockOidcAuth = { ...mockOidcAuth, isLoading: false, isAuthenticated: true };

      const { unmount } = renderWithProviders(<AuthStatusDisplay />);
      const expiringHandler = mockAddAccessTokenExpiring.mock.calls.at(-1)?.[0];
      const expiredHandler = mockAddAccessTokenExpired.mock.calls.at(-1)?.[0];
      const renewErrorHandler = mockAddSilentRenewError.mock.calls.at(-1)?.[0];

      unmount();

      expect(mockRemoveAccessTokenExpiring).toHaveBeenCalledWith(expiringHandler);
      expect(mockRemoveAccessTokenExpired).toHaveBeenCalledWith(expiredHandler);
      expect(mockRemoveSilentRenewError).toHaveBeenCalledWith(renewErrorHandler);
    });
  });

  describe("triggerLogin", () => {
    it("calls signinRedirect when triggerLogin is invoked", async () => {
      mockOidcAuth = { ...mockOidcAuth, isLoading: false, isAuthenticated: false, user: null };
      const user = userEvent.setup();
      renderWithProviders(<AuthActions />);
      await user.click(screen.getByText("triggerLogin"));
      expect(mockSigninRedirect).toHaveBeenCalled();
    });
  });

  describe("triggerSignup", () => {
    it("calls signinRedirect when triggerSignup is invoked", async () => {
      mockOidcAuth = { ...mockOidcAuth, isLoading: false, isAuthenticated: false, user: null };
      const user = userEvent.setup();
      renderWithProviders(<AuthActions />);
      await user.click(screen.getByText("triggerSignup"));
      expect(mockSigninRedirect).toHaveBeenCalled();
    });
  });

  describe("logout", () => {
    it("calls signoutRedirect when logout is invoked", async () => {
      mockOidcAuth = {
        ...mockOidcAuth,
        isLoading: false,
        isAuthenticated: true,
        user: {
          access_token: "tok-abc",
          profile: { sub: "sub-3", name: "Alice" },
        },
      };
      const user = userEvent.setup();
      renderWithProviders(
        <>
          <AuthStatusDisplay />
          <AuthActions />
        </>,
      );
      await user.click(screen.getByText("logout"));
      expect(mockSignoutRedirect).toHaveBeenCalled();
    });
  });

  describe("renewSession", () => {
    it("resolves with the fresh access token when signinSilent returns a renewed user", async () => {
      mockOidcAuth = { ...mockOidcAuth, isLoading: false, isAuthenticated: true };
      const user = userEvent.setup();
      renderWithProviders(<RenewSessionProbe />);

      await user.click(screen.getByText("renewSession"));

      expect(await screen.findByTestId("renew-result")).toHaveTextContent("renewed-token");
      expect(mockSigninSilent).toHaveBeenCalledOnce();
    });

    it("resolves null when the IdP session is gone", async () => {
      mockOidcAuth = { ...mockOidcAuth, isLoading: false, isAuthenticated: true };
      mockSigninSilent.mockResolvedValue(null);
      const user = userEvent.setup();
      renderWithProviders(<RenewSessionProbe />);

      await user.click(screen.getByText("renewSession"));

      expect(await screen.findByTestId("renew-result")).toHaveTextContent("null");
    });

    it("resolves null when signinSilent throws", async () => {
      mockOidcAuth = { ...mockOidcAuth, isLoading: false, isAuthenticated: true };
      mockSigninSilent.mockRejectedValue(new Error("login_required"));
      const user = userEvent.setup();
      renderWithProviders(<RenewSessionProbe />);

      await user.click(screen.getByText("renewSession"));

      expect(await screen.findByTestId("renew-result")).toHaveTextContent("null");
    });
  });

  describe("pending sync outbox cleanup on existing-session resolution", () => {
    afterEach(() => {
      localStorage.removeItem(SYNC_PENDING_OUTBOX_KEY);
    });

    it("discards a queued pre-auth write once resolution finishes without a user", async () => {
      appendToPendingSyncOutbox({ tasks: [{ id: "t1" }] } as never);
      expect(localStorage.getItem(SYNC_PENDING_OUTBOX_KEY)).not.toBeNull();

      mockOidcAuth = { ...mockOidcAuth, isLoading: true, isAuthenticated: false, user: null };
      const { rerender } = renderWithProviders(<AuthStatusDisplay />);

      mockOidcAuth = { ...mockOidcAuth, isLoading: false, isAuthenticated: false, user: null };
      rerender(
        <ToastProvider>
          <AuthProvider>
            <AuthStatusDisplay />
          </AuthProvider>
        </ToastProvider>,
      );

      await waitFor(() => {
        expect(localStorage.getItem(SYNC_PENDING_OUTBOX_KEY)).toBeNull();
      });
    });

    it("keeps a queued pre-auth write when resolution succeeds with a user", async () => {
      appendToPendingSyncOutbox({ tasks: [{ id: "t1" }] } as never);

      mockOidcAuth = { ...mockOidcAuth, isLoading: true, isAuthenticated: false, user: null };
      const { rerender } = renderWithProviders(<AuthStatusDisplay />);

      mockOidcAuth = {
        ...mockOidcAuth,
        isLoading: false,
        isAuthenticated: true,
        user: { access_token: "tok-abc", profile: { sub: "sub-1" } },
      };
      rerender(
        <ToastProvider>
          <AuthProvider>
            <AuthStatusDisplay />
          </AuthProvider>
        </ToastProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("is-authenticated")).toHaveTextContent("true");
      });
      expect(localStorage.getItem(SYNC_PENDING_OUTBOX_KEY)).not.toBeNull();
    });

    it("does not discard on initial mount when resolution was never in progress", async () => {
      appendToPendingSyncOutbox({ tasks: [{ id: "t1" }] } as never);

      mockOidcAuth = { ...mockOidcAuth, isLoading: false, isAuthenticated: false, user: null };
      renderWithProviders(<AuthStatusDisplay />);

      await screen.findByTestId("is-authenticated");
      expect(localStorage.getItem(SYNC_PENDING_OUTBOX_KEY)).not.toBeNull();
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
