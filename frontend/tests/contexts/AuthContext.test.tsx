import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "../../src/contexts/AuthContext";
import { ToastProvider } from "../../src/contexts/ToastContext";

// Mock supertokens-auth-react modules
const mockRedirectToAuth = vi.fn().mockResolvedValue(undefined);
const mockSignOut = vi.fn().mockResolvedValue(undefined);
let mockSessionContext: Record<string, unknown> = { loading: true };

vi.mock("supertokens-auth-react", () => ({
  redirectToAuth: (...args: unknown[]) => mockRedirectToAuth(...args),
}));

vi.mock("supertokens-auth-react/recipe/session", () => ({
  default: {
    signOut: (...args: unknown[]) => mockSignOut(...args),
  },
  useSessionContext: () => mockSessionContext,
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

function renderWithProviders(ui: React.ReactElement) {
  return render(<ToastProvider><AuthProvider>{ui}</AuthProvider></ToastProvider>);
}

describe("AuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionContext = { loading: true };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initial state", () => {
    it("shows validating state when session is loading", () => {
      mockSessionContext = { loading: true };
      renderWithProviders(<AuthStatusDisplay />);
      expect(screen.getByTestId("is-validating")).toHaveTextContent("true");
      expect(screen.getByTestId("is-authenticated")).toHaveTextContent("false");
      expect(screen.getByTestId("user-id")).toHaveTextContent("null");
    });

    it("is not authenticated when session does not exist", () => {
      mockSessionContext = {
        loading: false,
        doesSessionExist: false,
        userId: "",
        accessTokenPayload: {},
        invalidClaims: [],
      };
      renderWithProviders(<AuthStatusDisplay />);
      expect(screen.getByTestId("is-authenticated")).toHaveTextContent("false");
      expect(screen.getByTestId("user-id")).toHaveTextContent("null");
      expect(screen.getByTestId("display-name")).toHaveTextContent("null");
    });

    it("is authenticated when session exists", () => {
      mockSessionContext = {
        loading: false,
        doesSessionExist: true,
        userId: "42",
        accessTokenPayload: { displayName: "Alice" },
        invalidClaims: [],
      };
      renderWithProviders(<AuthStatusDisplay />);
      expect(screen.getByTestId("is-authenticated")).toHaveTextContent("true");
      expect(screen.getByTestId("user-id")).toHaveTextContent("42");
      expect(screen.getByTestId("display-name")).toHaveTextContent("Alice");
    });

    it("handles missing displayName in access token payload", () => {
      mockSessionContext = {
        loading: false,
        doesSessionExist: true,
        userId: "7",
        accessTokenPayload: {},
        invalidClaims: [],
      };
      renderWithProviders(<AuthStatusDisplay />);
      expect(screen.getByTestId("is-authenticated")).toHaveTextContent("true");
      expect(screen.getByTestId("user-id")).toHaveTextContent("7");
      expect(screen.getByTestId("display-name")).toHaveTextContent("null");
    });

    it("falls back to display_name in access token payload", () => {
      mockSessionContext = {
        loading: false,
        doesSessionExist: true,
        userId: "9",
        accessTokenPayload: { display_name: "Alice Fallback" },
        invalidClaims: [],
      };
      renderWithProviders(<AuthStatusDisplay />);
      expect(screen.getByTestId("is-authenticated")).toHaveTextContent("true");
      expect(screen.getByTestId("display-name")).toHaveTextContent("Alice Fallback");
    });
  });

  describe("triggerLogin", () => {
    it("calls redirectToAuth when triggerLogin is invoked", async () => {
      mockSessionContext = {
        loading: false,
        doesSessionExist: false,
        userId: "",
        accessTokenPayload: {},
        invalidClaims: [],
      };
      const user = userEvent.setup();
      renderWithProviders(<AuthActions />);
      await user.click(screen.getByText("triggerLogin"));
      expect(mockRedirectToAuth).toHaveBeenCalledWith({ show: "signin" });
    });
  });

  describe("triggerSignup", () => {
    it("calls redirectToAuth with signup when triggerSignup is invoked", async () => {
      mockSessionContext = {
        loading: false,
        doesSessionExist: false,
        userId: "",
        accessTokenPayload: {},
        invalidClaims: [],
      };
      const user = userEvent.setup();
      renderWithProviders(<AuthActions />);
      await user.click(screen.getByText("triggerSignup"));
      expect(mockRedirectToAuth).toHaveBeenCalledWith({ show: "signup" });
    });
  });

  describe("logout", () => {
    it("calls Session.signOut when logout is invoked", async () => {
      mockSessionContext = {
        loading: false,
        doesSessionExist: true,
        userId: "3",
        accessTokenPayload: { displayName: "Alice" },
        invalidClaims: [],
      };
      const user = userEvent.setup();
      renderWithProviders(
        <>
          <AuthStatusDisplay />
          <AuthActions />
        </>,
      );
      await user.click(screen.getByText("logout"));
      expect(mockSignOut).toHaveBeenCalled();
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
