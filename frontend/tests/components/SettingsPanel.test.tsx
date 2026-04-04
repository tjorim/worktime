import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders connect account and sign in buttons when not authenticated", () => {
    renderWithProviders(<SettingsPanel show onHide={vi.fn()} />);
    expect(screen.getByText("Connect Account")).toBeInTheDocument();
    expect(screen.getByText("Sign In")).toBeInTheDocument();
  });

  it("shows sync benefits description when not authenticated", () => {
    renderWithProviders(<SettingsPanel show onHide={vi.fn()} />);
    expect(
      screen.getByText(/Your data stays local by default/i),
    ).toBeInTheDocument();
  });

  it("calls redirectToAuth with signin when Sign In is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPanel show onHide={vi.fn()} />);
    await user.click(screen.getByText("Sign In"));
    expect(mockRedirectToAuth).toHaveBeenCalledWith({ show: "signin" });
  });

  it("calls redirectToAuth with signup when Connect Account is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPanel show onHide={vi.fn()} />);
    await user.click(screen.getByText("Connect Account"));
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

  it("shows sync benefits (backup and cross-device icons) when not authenticated", () => {
    renderWithProviders(<SettingsPanel show onHide={vi.fn()} />);
    expect(screen.getByText("Automatic backup")).toBeInTheDocument();
    expect(screen.getByText("Cross-device access")).toBeInTheDocument();
  });

  it("shows Enable Cloud Sync entry in quick actions when not authenticated", () => {
    renderWithProviders(<SettingsPanel show onHide={vi.fn()} />);
    expect(screen.getByText("Enable Cloud Sync")).toBeInTheDocument();
    expect(
      screen.getByText("Connect an account to back up and sync your data across devices"),
    ).toBeInTheDocument();
  });

  it("clicking Enable Cloud Sync calls redirectToAuth with signup", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPanel show onHide={vi.fn()} />);
    await user.click(screen.getByText("Enable Cloud Sync"));
    expect(mockRedirectToAuth).toHaveBeenCalledWith({ show: "signup" });
  });

  it("does not show Enable Cloud Sync in quick actions when authenticated", async () => {
    const sessionMod = await import("supertokens-auth-react/recipe/session");
    const useSessionContextSpy = vi
      .spyOn(sessionMod, "useSessionContext")
      .mockReturnValue({
        loading: false,
        doesSessionExist: true,
        userId: "u2",
        accessTokenPayload: { displayName: "Bob" },
        invalidClaims: [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

    renderWithProviders(<SettingsPanel show onHide={vi.fn()} />);
    expect(screen.queryByText("Enable Cloud Sync")).not.toBeInTheDocument();

    useSessionContextSpy.mockRestore();
  });
});
