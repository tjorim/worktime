import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "@/components/SettingsPanel";
import { AuthProvider } from "@/contexts/AuthContext";
import { DeveloperOptionsProvider } from "@/contexts/DeveloperOptionsContext";
import { EventStoreProvider } from "@/contexts/EventStoreContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { server } from "@/mocks/server";

// Global SuperTokens mocks come from tests/setup.ts (no-session default).
// Override for authenticated state tests using vi.mocked().

const mockRedirectToAuth = vi.mocked((await import("supertokens-auth-react")).redirectToAuth);
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
    expect(screen.getByText(/Your data stays local by default/i)).toBeInTheDocument();
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
    const useSessionContextSpy = vi.spyOn(sessionMod, "useSessionContext").mockReturnValue({
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

  it("loads profile details and sync stats for authenticated users", async () => {
    const sessionMod = await import("supertokens-auth-react/recipe/session");
    const useSessionContextSpy = vi.spyOn(sessionMod, "useSessionContext").mockReturnValue({
      loading: false,
      doesSessionExist: true,
      userId: "u1",
      accessTokenPayload: { displayName: "Alice" },
      invalidClaims: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    renderWithProviders(<SettingsPanel show onHide={vi.fn()} />);

    expect(await screen.findByDisplayValue("Dev User")).toBeInTheDocument();
    expect(
      screen.getByText(
        (_content, element) => element?.textContent === "Username: dev-user",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Sync")).toBeInTheDocument();
    expect(
      screen.getByText(
        (_content, element) => element?.textContent === "Pending changes: 0",
      ),
    ).toBeInTheDocument();

    useSessionContextSpy.mockRestore();
  });

  it("saves profile changes for authenticated users", async () => {
    server.use(
      http.put("*/api/users/:id", async ({ params, request }) => {
        const body = (await request.json()) as { display_name?: string };
        return HttpResponse.json({
          id: Number(params.id),
          username: "dev-user",
          display_name: body.display_name ?? "Dev User",
          settings: {},
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        });
      }),
    );

    const sessionMod = await import("supertokens-auth-react/recipe/session");
    const useSessionContextSpy = vi.spyOn(sessionMod, "useSessionContext").mockReturnValue({
      loading: false,
      doesSessionExist: true,
      userId: "u1",
      accessTokenPayload: { displayName: "Alice" },
      invalidClaims: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const user = userEvent.setup();
    renderWithProviders(<SettingsPanel show onHide={vi.fn()} />);

    const displayNameInput = await screen.findByDisplayValue("Dev User");
    await user.clear(displayNameInput);
    await user.type(displayNameInput, "Alice Updated");
    await user.click(screen.getByText("Save profile"));

    expect(await screen.findByDisplayValue("Alice Updated")).toBeInTheDocument();

    useSessionContextSpy.mockRestore();
  });

  it("renders account section title regardless of auth state", () => {
    renderWithProviders(<SettingsPanel show onHide={vi.fn()} />);
    expect(screen.getByText("Account")).toBeInTheDocument();
  });

  it("shows sync benefits (backup and cross-device icons) when not authenticated", () => {
    renderWithProviders(<SettingsPanel show onHide={vi.fn()} />);
    expect(screen.getByText("Automatic cloud backup")).toBeInTheDocument();
    expect(screen.getByText("Cross-device access")).toBeInTheDocument();
  });
});
