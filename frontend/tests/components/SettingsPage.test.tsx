import { act, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as oidcContext from "react-oidc-context";
import { SettingsContent } from "@/pages/SettingsPage";
import { SettingsAccountSection } from "@/components/settings/account/SettingsAccountSection";
import { SettingsApiTokensSection } from "@/components/settings/account/SettingsApiTokensSection";
import { SettingsAdminUsersSection } from "@/components/settings/admin/SettingsAdminUsersSection";
import { AuthProvider } from "@/contexts/AuthContext";
import { DeveloperOptionsProvider } from "@/contexts/DeveloperOptionsContext";
import { EventStoreProvider } from "@/contexts/EventStoreContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { PwaInstallProvider } from "@/contexts/PwaInstallContext";
import { server } from "@/mocks/server";
import { labelsCollection } from "@/db/collections";
import { USER_STATE_STORAGE_KEY, PWA_INSTALL_STATE_STORAGE_KEY } from "@/constants/storageKeys";
import { useSettingsAccount } from "@/pages/settings/hooks/useSettingsAccount";
import { useSettingsApiTokens } from "@/pages/settings/hooks/useSettingsApiTokens";
import { useSettingsAdminUsers } from "@/pages/settings/hooks/useSettingsAdminUsers";
import * as m from "@/paraglide/messages.js";

// Stub <Link> so tests don't need a RouterProvider context.
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, className, children }: { to: string; className?: string; children: React.ReactNode }) => (
      <a href={to} className={className}>{children}</a>
    ),
  };
});

// Global react-oidc-context mocks come from tests/setup.ts (no-session default).
// Override for authenticated state tests by calling mockAuthenticatedUser().

const mockSigninRedirect = vi.fn().mockResolvedValue(undefined);
const mockRemoveUser = vi.fn().mockResolvedValue(undefined);
const mockSignoutRedirect = vi.fn().mockResolvedValue(undefined);
let useOidcAuthSpy: { mockRestore: () => void } | undefined;
let useOngoingSyncContextSpy: { mockRestore: () => void } | undefined;

const createMockSyncContext = (overrides = {}) => ({
  isSyncing: false,
  lastSyncedAt: "2026-04-20T00:00:00Z",
  outboxCount: 0,
  hasSyncError: false,
  conflictCount: 0,
  conflictedPayload: null,
  retryAfter: null,
  enqueueChange: vi.fn(),
  triggerPull: vi.fn(),
  resolveOngoingConflicts: vi.fn(),
  ...overrides,
});

// Shared test cleanup for every section suite in this file.
afterEach(() => {
  useOidcAuthSpy?.mockRestore();
  useOidcAuthSpy = undefined;
  useOngoingSyncContextSpy?.mockRestore();
  useOngoingSyncContextSpy = undefined;
  vi.clearAllMocks();
  vi.unstubAllGlobals();

  localStorage.removeItem(USER_STATE_STORAGE_KEY);
  localStorage.removeItem(PWA_INSTALL_STATE_STORAGE_KEY);

  const labelsSnapshot = [...labelsCollection.toArray];
  labelsSnapshot.forEach((label) => {
    labelsCollection.delete(label.id);
  });
});

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <SettingsProvider>
      <EventStoreProvider>
        <DeveloperOptionsProvider>
          <ToastProvider>
            <PwaInstallProvider>
              <AuthProvider>{ui}</AuthProvider>
            </PwaInstallProvider>
          </ToastProvider>
        </DeveloperOptionsProvider>
      </EventStoreProvider>
    </SettingsProvider>,
  );
}

function mockAuthenticatedUser(displayName = "Alice") {
  useOidcAuthSpy = vi.spyOn(oidcContext, "useAuth").mockReturnValue({
    isAuthenticated: true,
    isLoading: false,
    user: {
      access_token: "tok-test",
      profile: { sub: "sub-u1", name: displayName } as Record<string, unknown>,
    },
    signinRedirect: mockSigninRedirect,
    removeUser: mockRemoveUser,
    signoutRedirect: mockSignoutRedirect,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function renderSettingsAccountHarness({
  fetchFn,
  showSuccessToast = vi.fn(),
  onAccountDeleted = vi.fn(),
}: {
  fetchFn: (input: string, init?: RequestInit) => Promise<Response>;
  showSuccessToast?: (message: string, icon?: string) => void;
  onAccountDeleted?: () => void;
}) {
  function Harness() {
    const {
      accountProfile,
      profileDraft,
      setProfileDraft,
      isProfileLoading,
      isProfileSaving,
      profileError,
      hasProfileChanges,
      resolvedDisplayName,
      handleSaveProfile,
      isDeletingAccount,
      deleteAccountError,
      handleDeleteAccount,
    } = useSettingsAccount({
      isAuthenticated: true,
      displayName: "Admin User",
      fetchFn,
      showSuccessToast,
      onAccountDeleted,
    });

    return (
      <SettingsAccountSection
        isValidating={false}
        isAuthenticated={true}
        resolvedDisplayName={resolvedDisplayName}
        username={accountProfile?.username ?? null}
        accountId={accountProfile?.id ?? null}
        userId={null}
        isAdmin={accountProfile?.is_admin ?? false}
        profileError={profileError}
        isProfileLoading={isProfileLoading}
        profileDraft={profileDraft}
        isProfileSaving={isProfileSaving}
        hasProfileChanges={hasProfileChanges}
        isDeletingAccount={isDeletingAccount}
        deleteAccountError={deleteAccountError}
        onProfileDraftChange={setProfileDraft}
        onSaveProfile={() => void handleSaveProfile()}
        onDeleteAccount={() => void handleDeleteAccount()}
        onLogout={vi.fn()}
        onLogin={vi.fn()}
      />
    );
  }

  render(<Harness />);
  return { showSuccessToast };
}

function renderSettingsAdminUsersHarness({
  fetchFn,
  showSuccessToast = vi.fn(),
  currentAccountId = null,
}: {
  fetchFn: (input: string, init?: RequestInit) => Promise<Response>;
  showSuccessToast?: (message: string, icon?: string) => void;
  currentAccountId?: number | null;
}) {
  function Harness() {
    const {
      adminUsers,
      isAdminUsersLoading,
      adminUsersError,
      adminUsersDeleteError,
      deletingAdminUserId,
      handleDeleteAdminUser,
    } = useSettingsAdminUsers({
      isAuthenticated: true,
      isAdmin: true,
      currentAccountId,
      fetchFn,
      showSuccessToast,
    });

    return (
      <SettingsAdminUsersSection
        currentAccountId={currentAccountId}
        adminUsers={adminUsers}
        isAdminUsersLoading={isAdminUsersLoading}
        adminUsersError={adminUsersError}
        adminUsersDeleteError={adminUsersDeleteError}
        deletingAdminUserId={deletingAdminUserId}
        onDeleteAdminUser={(userId) => void handleDeleteAdminUser(userId)}
      />
    );
  }

  render(<Harness />);
  return { showSuccessToast };
}

describe("SettingsPage Account Section", () => {
  it("renders only the sign in button when not authenticated", () => {
    // Worktime has no self-service registration (tjorim/apps#168): the realm
    // rejects it, so a separate "Connect Account" action promised a path that
    // does not exist. Sign In is the only entry point.
    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="account" />);
    expect(screen.getByText("Sign In")).toBeInTheDocument();
    expect(screen.queryByText("Connect Account")).not.toBeInTheDocument();
  });

  it("shows sync benefits description when not authenticated", () => {
    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="account" />);
    expect(screen.getByText(/Your data stays local by default/i)).toBeInTheDocument();
  });

  it("calls signinRedirect when Sign In is clicked", async () => {
    useOidcAuthSpy = vi.spyOn(oidcContext, "useAuth").mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      signinRedirect: mockSigninRedirect,
      removeUser: mockRemoveUser,
      signoutRedirect: mockSignoutRedirect,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const user = userEvent.setup();
    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="account" />);
    await user.click(screen.getByText("Sign In"));
    expect(mockSigninRedirect).toHaveBeenCalled();
  });

  it("calls signoutRedirect when Sign Out is clicked (authenticated state)", async () => {
    mockAuthenticatedUser("Alice");

    const user = userEvent.setup();
    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="account" />);
    expect(screen.getByText("Signed in as Alice")).toBeInTheDocument();
    await user.click(screen.getByText("Sign Out"));
    expect(mockSignoutRedirect).toHaveBeenCalled();
  });

  it("loads profile details and sync stats for authenticated users", async () => {
    mockAuthenticatedUser("Alice");

    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="account" />);

    expect(await screen.findByDisplayValue("Dev User")).toBeInTheDocument();
    expect(
      screen.getByText(
        (_content, element) => element?.textContent === "Username: dev-user",
      ),
    ).toBeInTheDocument();
  });

  it("shows the authenticated privacy notice with a link to the privacy policy", async () => {
    mockAuthenticatedUser("Alice");

    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="account" />);

    expect(await screen.findByText(/trusted-server model/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Learn more" })).toHaveAttribute("href", "/privacy");
  });

  it("renders a self-service account deletion danger zone", async () => {
    const fetchFn = vi.fn(async (input: string) => {
      if (input === "/api/me") {
        return jsonResponse({
          id: 1,
          username: "member-user",
          display_name: "Member User",
          is_admin: false,
          capabilities: { backup_enabled: true },
        });
      }
      throw new Error(`Unexpected request: GET ${input}`);
    });

    renderSettingsAccountHarness({ fetchFn });

    expect(await screen.findByText("Danger zone")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete my account" })).toBeInTheDocument();
  });

  it("does not delete the account when the confirmation dialog is cancelled", async () => {
    const fetchFn = vi.fn(async (input: string) => {
      if (input === "/api/me") {
        return jsonResponse({
          id: 1,
          username: "member-user",
          display_name: "Member User",
          is_admin: false,
          capabilities: { backup_enabled: true },
        });
      }
      throw new Error(`Unexpected request: GET ${input}`);
    });

    const user = userEvent.setup();
    renderSettingsAccountHarness({ fetchFn });

    await user.click(await screen.findByRole("button", { name: "Delete my account" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Delete your account?")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchFn).not.toHaveBeenCalledWith("/api/me", expect.objectContaining({ method: "DELETE" }));
  });

  it("deletes the account and signs out after confirmation", async () => {
    const fetchFn = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === "/api/me" && init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      if (input === "/api/me") {
        return jsonResponse({
          id: 1,
          username: "member-user",
          display_name: "Member User",
          is_admin: false,
          capabilities: { backup_enabled: true },
        });
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${input}`);
    });
    const showSuccessToast = vi.fn();
    const onAccountDeleted = vi.fn();

    const user = userEvent.setup();
    renderSettingsAccountHarness({ fetchFn, showSuccessToast, onAccountDeleted });

    await user.click(await screen.findByRole("button", { name: "Delete my account" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(onAccountDeleted).toHaveBeenCalledTimes(1);
    });
    expect(fetchFn).toHaveBeenCalledWith("/api/me", { method: "DELETE" });
    expect(showSuccessToast).toHaveBeenCalledWith("Account deleted.", "bi-trash");
  });

  it("shows an inline error when self-service account deletion fails", async () => {
    const fetchFn = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === "/api/me" && init?.method === "DELETE") {
        return jsonResponse({ detail: "Could not delete your account right now." }, { status: 500 });
      }
      if (input === "/api/me") {
        return jsonResponse({
          id: 1,
          username: "member-user",
          display_name: "Member User",
          is_admin: false,
          capabilities: { backup_enabled: true },
        });
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${input}`);
    });
    const onAccountDeleted = vi.fn();

    const user = userEvent.setup();
    renderSettingsAccountHarness({ fetchFn, onAccountDeleted });

    await user.click(await screen.findByRole("button", { name: "Delete my account" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Could not delete your account right now.")).toBeInTheDocument();
    expect(onAccountDeleted).not.toHaveBeenCalled();
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

    mockAuthenticatedUser("Alice");

    const user = userEvent.setup();
    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="account" />);

    const displayNameInput = await screen.findByDisplayValue("Dev User");
    await user.clear(displayNameInput);
    await user.type(displayNameInput, "Alice Updated");
    await user.click(screen.getByText("Save profile"));

    expect(await screen.findByDisplayValue("Alice Updated")).toBeInTheDocument();
  });

  it("renders account section title regardless of auth state", () => {
    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="account" />);
    expect(screen.getByText("Account")).toBeInTheDocument();
  });

  it("shows sync benefits (backup and cross-device icons) when not authenticated", () => {
    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="account" />);
    expect(screen.getByText("Automatic cloud backup")).toBeInTheDocument();
    expect(screen.getByText("Cross-device access")).toBeInTheDocument();
  });

  it("shows signed-out sync messaging when unauthenticated", () => {
    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="account" />);
    expect(screen.getByText(m.sync_signed_out_description())).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: m.sync_manual_pull_btn() })).not.toBeInTheDocument();
  });

  it("renders sync status alongside the account profile and calls pull action when enabled", async () => {
    const triggerPullMock = vi.fn();
    mockAuthenticatedUser("Alice");
    useOngoingSyncContextSpy = vi
      .spyOn(await import("@/contexts/OngoingSyncContext"), "useOngoingSyncContext")
      .mockReturnValue(
        createMockSyncContext({
          outboxCount: 2,
          conflictCount: 1,
          triggerPull: triggerPullMock,
        }),
      );

    const user = userEvent.setup();
    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="account" />);

    expect(await screen.findByDisplayValue("Dev User")).toBeInTheDocument();
    expect(screen.getByText(/Last synced:/i)).toBeInTheDocument();
    const pullButton = screen.getByRole("button", { name: m.sync_manual_pull_btn() });
    expect(pullButton).toBeEnabled();
    await user.click(pullButton);
    expect(triggerPullMock).toHaveBeenCalledTimes(1);
  });

  it("disables pull action button while sync is in progress", async () => {
    mockAuthenticatedUser("Alice");
    useOngoingSyncContextSpy = vi
      .spyOn(await import("@/contexts/OngoingSyncContext"), "useOngoingSyncContext")
      .mockReturnValue(createMockSyncContext({ isSyncing: true }));

    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="account" />);
    expect(screen.getByRole("button", { name: m.sync_manual_pull_busy() })).toBeDisabled();
  });
});

function renderSettingsApiTokensHarness({
  fetchFn,
}: {
  fetchFn: (input: string, init?: RequestInit) => Promise<Response>;
}) {
  function Harness() {
    const {
      apiTokens,
      isApiTokensLoading,
      apiTokensError,
      isCreatingApiToken,
      createApiTokenError,
      createdApiToken,
      dismissCreatedApiToken,
      handleCreateApiToken,
      revokingApiTokenId,
      revokeApiTokenError,
      handleRevokeApiToken,
    } = useSettingsApiTokens({ isAuthenticated: true, fetchFn });

    return (
      <SettingsApiTokensSection
        apiTokens={apiTokens}
        isApiTokensLoading={isApiTokensLoading}
        apiTokensError={apiTokensError}
        isCreatingApiToken={isCreatingApiToken}
        createApiTokenError={createApiTokenError}
        createdApiToken={createdApiToken}
        onDismissCreatedApiToken={dismissCreatedApiToken}
        onCreateApiToken={handleCreateApiToken}
        revokingApiTokenId={revokingApiTokenId}
        revokeApiTokenError={revokeApiTokenError}
        onRevokeApiToken={handleRevokeApiToken}
      />
    );
  }

  render(
    <ToastProvider>
      <Harness />
    </ToastProvider>,
  );
}

describe("SettingsPage API Tokens Section", () => {
  beforeEach(() => {
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
  });

  it("shows an empty state when there are no tokens", async () => {
    const fetchFn = vi.fn(async (input: string) => {
      if (input === "/api/access-tokens") {
        return jsonResponse({ items: [], total: 0 });
      }
      throw new Error(`Unexpected request: ${input}`);
    });

    renderSettingsApiTokensHarness({ fetchFn });

    expect(await screen.findByText("No API tokens yet.")).toBeInTheDocument();
  });

  it("generates a token, reveals it once, and copies it to the clipboard", async () => {
    let tokenCreated = false;
    const fetchFn = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === "/api/access-tokens" && init?.method === "POST") {
        tokenCreated = true;
        return jsonResponse(
          {
            id: "tok-1",
            name: "Pebble watch",
            token: "wtpat_secret-value",
            scopes: ["pebble:read", "pebble:write"],
            created_at: "2026-07-24T00:00:00Z",
          },
          { status: 201 },
        );
      }
      if (input === "/api/access-tokens") {
        return jsonResponse({
          items: tokenCreated
            ? [
                {
                  id: "tok-1",
                  name: "Pebble watch",
                  token_preview: "alue",
                  scopes: ["pebble:read", "pebble:write"],
                  created_at: "2026-07-24T00:00:00Z",
                  last_used_at: null,
                },
              ]
            : [],
          total: tokenCreated ? 1 : 0,
        });
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${input}`);
    });

    const user = userEvent.setup();
    renderSettingsApiTokensHarness({ fetchFn });

    await screen.findByText("No API tokens yet.");
    await user.type(screen.getByLabelText("Token name"), "Pebble watch");
    await user.click(screen.getByRole("button", { name: "Generate token" }));

    expect(await screen.findByText("Token created")).toBeInTheDocument();
    expect(screen.getByText("wtpat_secret-value")).toBeInTheDocument();
    expect(screen.getByText("Scopes: pebble:read, pebble:write")).toBeInTheDocument();
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/access-tokens",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Pebble watch",
          scopes: ["pebble:read", "pebble:write"],
        }),
      }),
    );

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(vi.mocked(navigator.clipboard.writeText)).toHaveBeenCalledWith("wtpat_secret-value");

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByText("Token created")).not.toBeInTheDocument();
    expect(await screen.findByText("Pebble watch")).toBeInTheDocument();
  });

  it("revokes a token after confirmation", async () => {
    let tokenRevoked = false;
    const fetchFn = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === "/api/access-tokens/tok-1" && init?.method === "DELETE") {
        tokenRevoked = true;
        return new Response(null, { status: 204 });
      }
      if (input === "/api/access-tokens") {
        return jsonResponse({
          items: tokenRevoked
            ? []
            : [
                {
                  id: "tok-1",
                  name: "Pebble watch",
                  token_preview: "alue",
                  scopes: ["pebble:read", "pebble:write"],
                  created_at: "2026-07-24T00:00:00Z",
                  last_used_at: null,
                },
              ],
          total: tokenRevoked ? 0 : 1,
        });
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${input}`);
    });

    const user = userEvent.setup();
    renderSettingsApiTokensHarness({ fetchFn });

    await user.click(await screen.findByRole("button", { name: "Revoke" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Revoke" }));

    await waitFor(() => {
      expect(fetchFn).toHaveBeenCalledWith("/api/access-tokens/tok-1", { method: "DELETE" });
    });
    expect(await screen.findByText("No API tokens yet.")).toBeInTheDocument();
  });

  it("shows an error message when loading tokens fails", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 500 }));

    renderSettingsApiTokensHarness({ fetchFn });

    expect(await screen.findByText("Could not load your API tokens right now.")).toBeInTheDocument();
  });
});

describe("SettingsPage Admin Section", () => {
  it("does not fetch admin users or render user management for non-admin accounts", async () => {
    let adminUsersRequestCount = 0;
    server.use(
      http.get("*/api/users/", () => {
        adminUsersRequestCount += 1;
        return HttpResponse.json({ items: [], total: 0 });
      }),
    );

    mockAuthenticatedUser("Alice");
    // useSettingsAdminUsers mounts regardless of activeSection, so rendering the
    // account section (whose profile-loaded state we can await) is enough to
    // prove a non-admin viewing Settings never triggers the admin users fetch.
    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="account" />);

    expect(await screen.findByDisplayValue("Dev User")).toBeInTheDocument();
    expect(screen.queryByText("User management")).not.toBeInTheDocument();
    expect(adminUsersRequestCount).toBe(0);
  });

  it("renders the user management list for admin accounts", async () => {
    let usersCalled = false;
    server.use(
      http.get("*/api/me", () =>
        HttpResponse.json({
          id: 1,
          username: "admin-user",
          display_name: "Admin User",
          is_admin: true,
          capabilities: { backup_enabled: true },
        }),
      ),
      http.get(/.*\/api\/users\/?$/, () => {
        usersCalled = true;
        return HttpResponse.json({ items: [], total: 0 });
      }),
    );

    mockAuthenticatedUser("Alice");
    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="admin" />);

    expect(await screen.findByText("User management")).toBeInTheDocument();
    expect(await screen.findByText("No users found.")).toBeInTheDocument();
    await waitFor(() => {
      expect(usersCalled).toBe(true);
    });
  });

  it("deletes another user from the admin user management table after confirmation", async () => {
    const fetchFn = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === "/api/users/?limit=100") {
        return jsonResponse({
          items: [
            {
              id: 1,
              username: "admin-user",
              display_name: "Admin User",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-02T00:00:00Z",
            },
            {
              id: 2,
              username: "member-user",
              display_name: "Member User",
              created_at: "2026-01-03T00:00:00Z",
              updated_at: "2026-01-04T00:00:00Z",
            },
          ],
          total: 2,
        });
      }
      if (input === "/api/users/2" && init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${input}`);
    });
    const showSuccessToast = vi.fn();

    const user = userEvent.setup();
    renderSettingsAdminUsersHarness({ fetchFn, showSuccessToast, currentAccountId: 1 });

    const memberRow = (await screen.findByText("member-user")).closest("tr");
    expect(memberRow).not.toBeNull();

    await user.click(within(memberRow!).getByRole("button", { name: "Delete" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Delete account?")).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "This permanently deletes the account for Member User (@member-user). This action cannot be undone.",
      ),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.queryByText("member-user")).not.toBeInTheDocument();
    });
    expect(showSuccessToast).toHaveBeenCalledWith("Account deleted.", "bi-trash");
    expect(fetchFn).toHaveBeenCalledWith("/api/users/2", { method: "DELETE" });
  });

  it("shows an inline error when deleting a managed user fails", async () => {
    const fetchFn = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === "/api/users/?limit=100") {
        return jsonResponse({
          items: [
            {
              id: 1,
              username: "admin-user",
              display_name: "Admin User",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-02T00:00:00Z",
            },
            {
              id: 2,
              username: "member-user",
              display_name: "Member User",
              created_at: "2026-01-03T00:00:00Z",
              updated_at: "2026-01-04T00:00:00Z",
            },
          ],
          total: 2,
        });
      }
      if (input === "/api/users/2" && init?.method === "DELETE") {
        return jsonResponse({ detail: "Could not delete user." }, { status: 500 });
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${input}`);
    });

    const user = userEvent.setup();
    renderSettingsAdminUsersHarness({ fetchFn, currentAccountId: 1 });

    const memberRow = (await screen.findByText("member-user")).closest("tr");
    expect(memberRow).not.toBeNull();

    await user.click(within(memberRow!).getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Could not delete user.")).toBeInTheDocument();
    expect(screen.getByText("member-user")).toBeInTheDocument();
  });

  it("disables self-delete for the current admin in the user management table", async () => {
    const fetchFn = vi.fn(async (input: string) => {
      if (input === "/api/users/?limit=100") {
        return jsonResponse({
          items: [
            {
              id: 1,
              username: "admin-user",
              display_name: "Admin User",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-02T00:00:00Z",
            },
            {
              id: 2,
              username: "member-user",
              display_name: "Member User",
              created_at: "2026-01-03T00:00:00Z",
              updated_at: "2026-01-04T00:00:00Z",
            },
          ],
          total: 2,
        });
      }
      throw new Error(`Unexpected request: GET ${input}`);
    });

    renderSettingsAdminUsersHarness({ fetchFn, currentAccountId: 1 });

    const adminRow = (await screen.findAllByRole("row")).find((row) =>
      within(row).queryByText("admin-user"),
    );
    expect(adminRow).not.toBeNull();
    expect(within(adminRow!).getByRole("button", { name: "Delete" })).toBeDisabled();
  });
});

describe("SettingsPage Data Section", () => {
  it("opens reset confirmation, toggles clear options, and confirms side effects", async () => {
    labelsCollection.insert({ id: "label-1", name: "Urgent", color: "#ff0000" });

    const onHide = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<SettingsContent onHide={onHide} activeSection="data" />);

    await user.click(screen.getByRole("button", { name: new RegExp(`^${m.reset_settings_label()}`) }));
    const resetDialog = screen.getByRole("dialog");

    const clearTimeTracking = within(resetDialog).getByRole("checkbox", {
      name: m.reset_also_clear_time_tracking(),
    });
    const clearTimeOff = within(resetDialog).getByRole("checkbox", {
      name: m.reset_also_clear_time_off(),
    });

    expect(clearTimeTracking).not.toBeChecked();
    expect(clearTimeOff).not.toBeChecked();

    await user.click(clearTimeTracking);
    await user.click(clearTimeOff);

    expect(clearTimeTracking).toBeChecked();
    expect(clearTimeOff).toBeChecked();
    expect(screen.getByText(m.reset_warning())).toBeInTheDocument();

    await user.click(within(resetDialog).getByRole("button", { name: m.reset_now() }));

    await waitFor(() => {
      expect(onHide).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(labelsCollection.toArray).toHaveLength(0);
    });

    const stored = localStorage.getItem(USER_STATE_STORAGE_KEY);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored ?? "{}").scheduleType).toBeNull();
  });

  it("enables the Install App action once the browser offers a prompt, and installs on click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="data" />);

    const installButton = screen.getByRole("button", {
      name: new RegExp(`^${m.pwa_install_app_label()}`),
    });
    // ListGroup.Item's `disabled` sets aria-disabled + blocks its onClick handler
    // internally rather than the native `disabled` attribute, so toBeDisabled() (which
    // checks the native attribute) doesn't apply here.
    expect(installButton).toHaveAttribute("aria-disabled", "true");

    const promptSpy = vi.fn().mockResolvedValue(undefined);
    act(() => {
      const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
      };
      event.prompt = promptSpy;
      event.userChoice = Promise.resolve({ outcome: "accepted" as const, platform: "web" });
      window.dispatchEvent(event);
    });

    await waitFor(() => expect(installButton).not.toHaveAttribute("aria-disabled"));

    await user.click(installButton);

    expect(promptSpy).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole("button", {
        name: new RegExp(`^${m.pwa_install_installed_label()}`),
      }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(await screen.findByText(m.pwa_install_success())).toBeInTheDocument();
  });

  it("does not show a success toast when the install prompt is dismissed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="data" />);

    const installButton = screen.getByRole("button", {
      name: new RegExp(`^${m.pwa_install_app_label()}`),
    });

    act(() => {
      const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
      };
      event.prompt = vi.fn().mockResolvedValue(undefined);
      event.userChoice = Promise.resolve({ outcome: "dismissed" as const, platform: "web" });
      window.dispatchEvent(event);
    });

    await waitFor(() => expect(installButton).not.toHaveAttribute("aria-disabled"));
    await user.click(installButton);

    await waitFor(() => expect(installButton).toHaveAttribute("aria-disabled", "true"));
    expect(screen.queryByText(m.pwa_install_success())).not.toBeInTheDocument();
  });
});

describe("SettingsPage General Section", () => {
  it("handles schedule selection clicks and shows team selection for multi-team schedules", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="general" />);

    expect(screen.queryByText(m.select_team_label())).not.toBeInTheDocument();

    await user.click(screen.getByText("2-shift"));

    expect(screen.getByText(m.select_team_label())).toBeInTheDocument();
    const teamOneButton = screen.getByRole("button", {
      name: m.wizard_team_btn_aria({ team: "1" }),
    });
    await user.click(teamOneButton);
    expect(teamOneButton).toHaveAttribute("aria-pressed", "true");
  });

  it("enables notifications after requesting and receiving browser permission", async () => {
    const user = userEvent.setup();
    const requestPermission = vi.fn().mockResolvedValue("granted");
    vi.stubGlobal("Notification", { permission: "default", requestPermission });

    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="general" />);

    const toggle = screen.getByRole("checkbox", { name: m.notifications_label() });
    expect(toggle).not.toBeChecked();

    await user.click(toggle);

    expect(requestPermission).toHaveBeenCalled();
    await waitFor(() => expect(toggle).toBeChecked());

    const stored = localStorage.getItem(USER_STATE_STORAGE_KEY);
    expect(JSON.parse(stored ?? "{}").settings.notifications).toBe("on");
  });

  it("shows a warning and stays off when notification permission is denied", async () => {
    const user = userEvent.setup();
    const requestPermission = vi.fn().mockResolvedValue("denied");
    vi.stubGlobal("Notification", { permission: "default", requestPermission });

    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="general" />);

    const toggle = screen.getByRole("checkbox", { name: m.notifications_label() });
    await user.click(toggle);

    expect(await screen.findByText(m.notifications_permission_denied())).toBeInTheDocument();
    expect(toggle).not.toBeChecked();
  });

  it("does not re-request permission when already granted, and turns off without checking permission", async () => {
    const user = userEvent.setup();
    const requestPermission = vi.fn();
    vi.stubGlobal("Notification", { permission: "granted", requestPermission });

    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="general" />);
    const toggle = screen.getByRole("checkbox", { name: m.notifications_label() });

    await user.click(toggle);
    expect(requestPermission).not.toHaveBeenCalled();
    await waitFor(() => expect(toggle).toBeChecked());

    await user.click(toggle);
    expect(requestPermission).not.toHaveBeenCalled();
    await waitFor(() => expect(toggle).not.toBeChecked());
  });

  it("shows lead-time and quiet-hours controls only once notifications are on", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("Notification", { permission: "granted", requestPermission: vi.fn() });

    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="general" />);

    expect(screen.queryByText(m.notification_lead_time_label())).not.toBeInTheDocument();
    expect(screen.queryByText(m.notification_quiet_hours_label())).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: m.notifications_label() }));

    expect(await screen.findByText(m.notification_lead_time_label())).toBeInTheDocument();
    expect(screen.getByText(m.notification_quiet_hours_label())).toBeInTheDocument();
  });

  it("changes the reminder lead time and persists it", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("Notification", { permission: "granted", requestPermission: vi.fn() });

    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="general" />);
    await user.click(screen.getByRole("checkbox", { name: m.notifications_label() }));
    await screen.findByText(m.notification_lead_time_label());

    const oneHourButton = screen.getByRole("button", { name: m.notification_lead_time_1h() });
    await user.click(oneHourButton);

    expect(oneHourButton).toHaveAttribute("aria-pressed", "true");
    const stored = localStorage.getItem(USER_STATE_STORAGE_KEY);
    expect(JSON.parse(stored ?? "{}").settings.notificationLeadTimeMinutes).toBe(60);
  });

  it("enables quiet hours with default bounds and lets them be adjusted", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("Notification", { permission: "granted", requestPermission: vi.fn() });

    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="general" />);
    await user.click(screen.getByRole("checkbox", { name: m.notifications_label() }));
    await screen.findByText(m.notification_quiet_hours_label());

    const quietHoursToggle = screen.getByRole("checkbox", { name: m.notification_quiet_hours_label() });
    expect(quietHoursToggle).not.toBeChecked();

    await user.click(quietHoursToggle);

    const startSelect = await screen.findByLabelText<HTMLSelectElement>(
      m.notification_quiet_hours_start_aria(),
    );
    const endSelect = screen.getByLabelText<HTMLSelectElement>(m.notification_quiet_hours_end_aria());
    expect(startSelect.value).toBe("22");
    expect(endSelect.value).toBe("6");

    await user.selectOptions(startSelect, "23");

    const stored = localStorage.getItem(USER_STATE_STORAGE_KEY);
    const settings = JSON.parse(stored ?? "{}").settings;
    expect(settings.notificationQuietHoursStart).toBe(23);
    expect(settings.notificationQuietHoursEnd).toBe(6);

    await user.click(quietHoursToggle);
    expect(screen.queryByLabelText(m.notification_quiet_hours_start_aria())).not.toBeInTheDocument();
    const clearedSettings = JSON.parse(localStorage.getItem(USER_STATE_STORAGE_KEY) ?? "{}").settings;
    expect(clearedSettings.notificationQuietHoursStart).toBe(null);
    expect(clearedSettings.notificationQuietHoursEnd).toBe(null);
  });
});

describe("SettingsPage Time Tracking Section", () => {
  it("renders the labels and templates panels", () => {
    labelsCollection.insert({ id: "label-1", name: "Urgent", color: "#ff0000" });

    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="timeTracking" />);

    expect(screen.getByText(m.tt_labels_heading())).toBeInTheDocument();
    expect(screen.getByText(m.tt_templates_heading())).toBeInTheDocument();
    expect(screen.getByText("Urgent")).toBeInTheDocument();
  });
});

describe("SettingsPage Features Section", () => {
  it("toggles features and shows cross-border setup when enabled", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="features" />);

    const timeOffToggle = screen.getByRole("checkbox", { name: "Toggle time off" });
    const timeTrackingToggle = screen.getByRole("checkbox", { name: "Toggle time tracking" });
    const ganttToggle = screen.getByRole("checkbox", { name: "Toggle personal gantt" });
    const crossBorderToggle = screen.getByRole("checkbox", { name: "Toggle cross-border tracking" });

    expect(timeOffToggle).not.toBeChecked();
    expect(timeTrackingToggle).not.toBeChecked();
    expect(ganttToggle).not.toBeChecked();
    expect(crossBorderToggle).not.toBeChecked();
    expect(screen.queryByText(m.cross_border_setup_label())).not.toBeInTheDocument();

    await user.click(timeOffToggle);
    await user.click(timeTrackingToggle);
    await user.click(ganttToggle);
    await user.click(crossBorderToggle);

    expect(timeOffToggle).toBeChecked();
    expect(timeTrackingToggle).toBeChecked();
    expect(ganttToggle).toBeChecked();
    expect(crossBorderToggle).toBeChecked();
    expect(screen.getByText(m.cross_border_setup_label())).toBeInTheDocument();
    expect(screen.getByLabelText(m.home_country_label())).toBeInTheDocument();
    expect(screen.getByLabelText(m.office_country_label())).toBeInTheDocument();
  });
});
