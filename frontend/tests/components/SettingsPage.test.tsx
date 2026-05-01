import { render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as oidcContext from "react-oidc-context";
import { SettingsContent } from "@/pages/SettingsPage";
import { AuthProvider } from "@/contexts/AuthContext";
import { DeveloperOptionsProvider } from "@/contexts/DeveloperOptionsContext";
import { EventStoreProvider } from "@/contexts/EventStoreContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { server } from "@/mocks/server";
import { labelsCollection } from "@/db/collections";
import { USER_STATE_STORAGE_KEY } from "@/constants/storageKeys";
import * as m from "@/paraglide/messages.js";

// Global react-oidc-context mocks come from tests/setup.ts (no-session default).
// Override for authenticated state tests by calling mockAuthenticatedUser().

const mockSigninRedirect = vi.fn().mockResolvedValue(undefined);
const mockRemoveUser = vi.fn().mockResolvedValue(undefined);
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

  localStorage.removeItem(USER_STATE_STORAGE_KEY);

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
            <AuthProvider>{ui}</AuthProvider>
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

describe("SettingsPage Account Section", () => {
  it("renders connect account and sign in buttons when not authenticated", () => {
    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="account" />);
    expect(screen.getByText("Connect Account")).toBeInTheDocument();
    expect(screen.getByText("Sign In")).toBeInTheDocument();
  });

  it("shows sync benefits description when not authenticated", () => {
    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="account" />);
    expect(screen.getByText(/Your data stays local by default/i)).toBeInTheDocument();
  });

  it("calls signinRedirect when Sign In is clicked", async () => {
    vi.spyOn(oidcContext, "useAuth").mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      signinRedirect: mockSigninRedirect,
      removeUser: mockRemoveUser,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const user = userEvent.setup();
    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="account" />);
    await user.click(screen.getByText("Sign In"));
    expect(mockSigninRedirect).toHaveBeenCalled();
  });

  it("calls signinRedirect when Connect Account is clicked", async () => {
    vi.spyOn(oidcContext, "useAuth").mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      signinRedirect: mockSigninRedirect,
      removeUser: mockRemoveUser,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const user = userEvent.setup();
    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="account" />);
    await user.click(screen.getByText("Connect Account"));
    expect(mockSigninRedirect).toHaveBeenCalled();
  });

  it("calls removeUser when Sign Out is clicked (authenticated state)", async () => {
    mockAuthenticatedUser("Alice");

    const user = userEvent.setup();
    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="account" />);
    expect(screen.getByText("Signed in as Alice")).toBeInTheDocument();
    await user.click(screen.getByText("Sign Out"));
    expect(mockRemoveUser).toHaveBeenCalled();
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
});

describe("SettingsPage Sync Section", () => {
  it("shows signed-out messaging when unauthenticated", () => {
    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="sync" />);
    expect(screen.getByText(m.sync_signed_out_description())).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: m.sync_manual_pull_btn() })).not.toBeInTheDocument();
  });

  it("renders signed-in status and calls pull action when button is enabled", async () => {
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
    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="sync" />);

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

    renderWithProviders(<SettingsContent onHide={vi.fn()} activeSection="sync" />);
    expect(screen.getByRole("button", { name: m.sync_manual_pull_busy() })).toBeDisabled();
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
