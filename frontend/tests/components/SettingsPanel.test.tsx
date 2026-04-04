import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "../../src/components/SettingsPanel";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { DeveloperOptionsProvider } from "../../src/contexts/DeveloperOptionsContext";
import { EventStoreProvider } from "../../src/contexts/EventStoreContext";
import { SettingsProvider } from "../../src/contexts/SettingsContext";
import { ToastProvider } from "../../src/contexts/ToastContext";

// Global SuperTokens mocks come from tests/setup.ts (no-session default).
// Override for authenticated state tests using vi.mocked().

const mockRedirectToAuth = vi.mocked(
  (await import("supertokens-auth-react")).redirectToAuth,
);
const mockSignOut = vi.mocked(
  (await import("supertokens-auth-react/recipe/session")).default.signOut,
);

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <SettingsProvider>
      <EventStoreProvider>
        <DeveloperOptionsProvider>
          <ToastProvider>
            <AuthProvider>{ui}</AuthProvider>
          </ToastProvider>
        </DeveloperOptionsProvider>
      </EventStoreProvider>
    </SettingsProvider>,
  );
}

describe("SettingsPanel Account Section", () => {
  it("renders sign in and create account buttons when not authenticated", () => {
    renderWithProviders(<SettingsPanel show onHide={vi.fn()} />);
    expect(screen.getByText("Sign In")).toBeInTheDocument();
    expect(screen.getByText("Create Account")).toBeInTheDocument();
  });

  it("shows sign in description when not authenticated", () => {
    renderWithProviders(<SettingsPanel show onHide={vi.fn()} />);
    expect(
      screen.getByText("Sign in to enable cross-device sync"),
    ).toBeInTheDocument();
  });

  it("calls redirectToAuth with signin when Sign In is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPanel show onHide={vi.fn()} />);
    await user.click(screen.getByText("Sign In"));
    expect(mockRedirectToAuth).toHaveBeenCalledWith({ show: "signin" });
  });

  it("calls redirectToAuth with signup when Create Account is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPanel show onHide={vi.fn()} />);
    await user.click(screen.getByText("Create Account"));
    expect(mockRedirectToAuth).toHaveBeenCalledWith({ show: "signup" });
  });

  it("calls signOut when Sign Out is clicked (authenticated state)", async () => {
    // Override the session mock for this test to simulate an authenticated user
    const sessionMod = await import("supertokens-auth-react/recipe/session");
    const useSessionContextSpy = vi
      .spyOn(sessionMod, "useSessionContext")
      .mockReturnValue({
        loading: false,
        doesSessionExist: true,
        userId: "u1",
        accessTokenPayload: { displayName: "Alice" },
        invalidClaims: [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

    const user = userEvent.setup();
    renderWithProviders(<SettingsPanel show onHide={vi.fn()} />);
    expect(screen.getByText("Signed in as Alice")).toBeInTheDocument();
    await user.click(screen.getByText("Sign Out"));
    expect(mockSignOut).toHaveBeenCalled();

    useSessionContextSpy.mockRestore();
  });

  it("renders account section title regardless of auth state", () => {
    renderWithProviders(<SettingsPanel show onHide={vi.fn()} />);
    expect(screen.getByText("Account")).toBeInTheDocument();
  });
});
