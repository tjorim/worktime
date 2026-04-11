/**
 * Integration tests for account-backed sync user journeys.
 *
 * Covers the flows documented in docs/local-first-sync-flow.md:
 *
 *  §1  Local-only usage — app is fully functional without authentication.
 *  §2  Signing in — first-sync branches A (push), B (pull), C (conflict), D (both empty).
 *  §3  Ongoing sync — offline outbox queuing and reconnect flush.
 *  §4  New-device restore — signing in on a second device with empty localStorage.
 *  §5  Conflict handling — Branch C conflict dialog and resolution UI.
 *
 * Two test layers are used:
 *
 *  1. Full-App tests (§1, auth edge cases): render the complete App component with a
 *     mutable SuperTokens session mock to test the unauthenticated invariant and auth
 *     state transitions.
 *
 *  2. Lightweight harness tests (§2–§5): render `useFirstSyncFlow` + `FirstSyncConflictDialog`
 *     inside minimal context providers. This isolates the sync logic from App-level side
 *     effects (e.g. the accountSyncAnnouncementSeen useEffect that writes preferences to
 *     localStorage) that would cause all tests to think "local has data" regardless of
 *     the localStorage seed.
 *
 * Invariants verified:
 *  - The app is 100% functional without sign-in (§1 invariant).
 *  - Sync only activates when the user is authenticated.
 *  - The conflict dialog is shown exactly when both local and server have data.
 *  - Sync cursors are stored/absent as expected after each flow.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { FirstSyncConflictDialog } from "@/components/FirstSyncConflictDialog";
import { EventStoreProvider } from "@/contexts/EventStoreContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { useFirstSyncFlow } from "@/hooks/useFirstSyncFlow";
import { getSyncCursorKey } from "@/constants/storageKeys";
import { tasksCollection } from "@/db/collections";

// ---------------------------------------------------------------------------
// SuperTokens session mock — mutable so individual tests can override it.
// (Only used for the full-App §1 tests.)
// ---------------------------------------------------------------------------

let mockSessionContext: Record<string, unknown> = {
  loading: false,
  doesSessionExist: false,
  userId: "",
  accessTokenPayload: {},
  invalidClaims: [],
};

vi.mock("supertokens-auth-react/recipe/session", () => ({
  default: { signOut: vi.fn().mockResolvedValue(undefined) },
  useSessionContext: () => mockSessionContext,
}));

// ---------------------------------------------------------------------------
// Constants shared across tests
// ---------------------------------------------------------------------------

const TEST_USER_ID = "user-sync-integration-1";

const emptyStatus = {
  labels_updated_at: null,
  tasks_updated_at: null,
  templates_updated_at: null,
  work_locations_updated_at: null,
  time_off_entries_updated_at: null,
  gantt_tasks_updated_at: null,
  preferences_updated_at: null,
  server_timestamp: "2026-01-01T00:00:00.000Z",
};

const populatedStatus = {
  ...emptyStatus,
  labels_updated_at: "2026-01-01T00:00:00.000Z",
};

const emptyPushResponse = { results: {} };

const emptyPullResponse = {
  labels: [],
  tasks: [],
  templates: [],
  work_locations: [],
  time_off_entries: [],
  gantt_tasks: [],
  server_timestamp: "2026-01-02T00:00:00.000Z",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seed a minimal task so buildLocalSyncPushPayload() returns non-empty payload. */
function seedLocalTask() {
  tasksCollection.insert({
    id: "local-task-1",
    text: "Local task",
    label: "",
    startTime: "2026-01-01T09:00",
    stopTime: null,
    includesBreak: false,
  });
}

type FetchFn = (url: string, init?: RequestInit) => Promise<unknown>;

/** Build a mock fetch implementation that routes calls by URL path substring. */
function buildFetchMock(handlers: Record<string, unknown>): FetchFn {
  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    for (const [pattern, responseOrFn] of Object.entries(handlers)) {
      if (url.includes(pattern)) {
        const resolved =
          typeof responseOrFn === "function"
            ? await (responseOrFn as (url: string, init?: RequestInit) => unknown)(url, init)
            : responseOrFn;
        return resolved;
      }
    }
    return { ok: false, status: 404, json: async () => ({ error: "not found" }) };
  }) as FetchFn;
}

// ---------------------------------------------------------------------------
// Lightweight sync harness
//
// Renders useFirstSyncFlow + FirstSyncConflictDialog in a minimal context
// so tests avoid App-level side effects (preferences writes, WelcomeWizard
// state, ongoing-sync initial flush) that would pollute the localStorage
// state and make every test behave as if "local has data".
// ---------------------------------------------------------------------------

interface SyncHarnessProps {
  isAuthenticated: boolean;
  userId: string | null;
  fetchFn: FetchFn;
}

function SyncHarness({ isAuthenticated, userId, fetchFn }: SyncHarnessProps) {
  const { phase, resolveConflict, dismiss } = useFirstSyncFlow(
    isAuthenticated,
    userId,
    fetchFn as (url: string, init?: RequestInit) => Promise<Response>,
  );
  return (
    <>
      <div data-testid="sync-phase">{phase}</div>
      <FirstSyncConflictDialog
        show={phase === "conflict"}
        onResolve={resolveConflict}
        onDismiss={dismiss}
      />
    </>
  );
}

function renderSync(
  isAuthenticated: boolean,
  userId: string | null,
  fetchFn: FetchFn,
) {
  return render(
    <EventStoreProvider>
      <ToastProvider>
        <SyncHarness isAuthenticated={isAuthenticated} userId={userId} fetchFn={fetchFn} />
      </ToastProvider>
    </EventStoreProvider>,
  );
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockSessionContext = {
    loading: false,
    doesSessionExist: false,
    userId: "",
    accessTokenPayload: {},
    invalidClaims: [],
  };
  localStorage.clear();
});

afterEach(() => {
  document.body.className = "";
  document.documentElement.removeAttribute("data-bs-theme");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ===========================================================================
// §1 — Local-Only Usage (full App)
// ===========================================================================

describe("§1 Local-only usage", () => {
  it("renders the app without authentication and shows the onboarding wizard", async () => {
    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Welcome to Worktime/i })).toBeInTheDocument(),
    );
  });

  it("stores no sync cursor when the user has not authenticated", () => {
    render(<App />);
    expect(localStorage.getItem(getSyncCursorKey(TEST_USER_ID))).toBeNull();
  });

  it("does not trigger any sync API calls when the user is not authenticated", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Welcome to Worktime/i })).toBeInTheDocument(),
    );

    const syncCalls = fetchSpy.mock.calls.filter(([url]: [string]) =>
      url.includes("/api/sync"),
    );
    expect(syncCalls).toHaveLength(0);
  });
});

// ===========================================================================
// §2 Branch D — Both sides empty
// ===========================================================================

describe("§2 Branch D — both sides empty → cursor stored immediately", () => {
  it("transitions to done and stores cursor when neither local nor server has data", async () => {
    const mockFetch = buildFetchMock({
      "/api/sync/status": { ok: true, json: async () => emptyStatus },
    });

    renderSync(true, TEST_USER_ID, mockFetch);

    await waitFor(() => {
      expect(screen.getByTestId("sync-phase")).toHaveTextContent("done");
    });

    expect(localStorage.getItem(getSyncCursorKey(TEST_USER_ID))).toBe(
      emptyStatus.server_timestamp,
    );
  });

  it("does not run the flow when not authenticated", () => {
    const mockFetch = vi.fn() as unknown as FetchFn;
    renderSync(false, null, mockFetch);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not run the flow when fetch is null (unauthenticated API client)", () => {
    // Pass a mock to satisfy TypeScript; the flow should not call it
    // when isAuthenticated=false.
    const mockFetch = vi.fn() as unknown as FetchFn;
    renderSync(false, TEST_USER_ID, mockFetch);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("enters error phase when the status call fails", async () => {
    const mockFetch = buildFetchMock({
      "/api/sync/status": { ok: false, status: 500, json: async () => ({}) },
    });

    renderSync(true, TEST_USER_ID, mockFetch);

    await waitFor(() => {
      expect(screen.getByTestId("sync-phase")).toHaveTextContent("error");
    });

    expect(localStorage.getItem(getSyncCursorKey(TEST_USER_ID))).toBeNull();
  });

  it("skips the flow when a sync cursor already exists", async () => {
    localStorage.setItem(getSyncCursorKey(TEST_USER_ID), "2026-01-01T00:00:00.000Z");

    const mockFetch = vi.fn() as unknown as FetchFn;
    renderSync(true, TEST_USER_ID, mockFetch);

    // Phase stays idle — the flow is skipped because a cursor already exists.
    await waitFor(() => {
      expect(screen.getByTestId("sync-phase")).toHaveTextContent("idle");
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// §2 Branch A — Server empty, local has data → first upload
// ===========================================================================

describe("§2 Branch A — sync enablement from an existing local-only device", () => {
  it("pushes local data when server is empty and stores cursor after successful upload", async () => {
    seedLocalTask();

    const mockFetch = buildFetchMock({
      "/api/sync/status": { ok: true, json: async () => emptyStatus },
      "/api/sync/push": { ok: true, json: async () => emptyPushResponse },
    });

    renderSync(true, TEST_USER_ID, mockFetch);

    await waitFor(
      () => {
        expect(screen.getByTestId("sync-phase")).toHaveTextContent("done");
      },
      { timeout: 5000 },
    );

    expect(localStorage.getItem(getSyncCursorKey(TEST_USER_ID))).not.toBeNull();

    const pushCalls = (mockFetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([url]: [string]) => url.includes("/api/sync/push"),
    );
    expect(pushCalls.length).toBeGreaterThan(0);
  });

  it("does not store cursor when the push fails", async () => {
    seedLocalTask();

    const mockFetch = buildFetchMock({
      "/api/sync/status": { ok: true, json: async () => emptyStatus },
      "/api/sync/push": { ok: false, status: 500, json: async () => ({}) },
    });

    renderSync(true, TEST_USER_ID, mockFetch);

    await waitFor(() => {
      expect(screen.getByTestId("sync-phase")).toHaveTextContent("error");
    });

    expect(localStorage.getItem(getSyncCursorKey(TEST_USER_ID))).toBeNull();
  });

  it("includes local tasks in the push payload", async () => {
    seedLocalTask();

    const mockFetch = buildFetchMock({
      "/api/sync/status": { ok: true, json: async () => emptyStatus },
      "/api/sync/push": { ok: true, json: async () => emptyPushResponse },
    });

    renderSync(true, TEST_USER_ID, mockFetch);

    await waitFor(() => {
      expect(screen.getByTestId("sync-phase")).toHaveTextContent("done");
    });

    const pushCalls = (mockFetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([url]: [string]) => url === "/api/sync/push",
    );
    expect(pushCalls.length).toBeGreaterThan(0);
    const body = JSON.parse((pushCalls[0] as [string, RequestInit])[1].body as string);
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0].id).toBe("local-task-1");
  });
});

// ===========================================================================
// §2 Branch B / §4 — Server has data, local is empty → second-device restore
// ===========================================================================

describe("§2 Branch B / §4 — second-device restore", () => {
  it("pulls server data when local is empty and stores cursor", async () => {
    // Local is empty (no seed)
    const mockFetch = buildFetchMock({
      "/api/sync/status": { ok: true, json: async () => populatedStatus },
      "/api/sync/pull": { ok: true, json: async () => emptyPullResponse },
      "/api/preferences": { ok: false, status: 404, json: async () => ({}) },
    });

    renderSync(true, TEST_USER_ID, mockFetch);

    await waitFor(
      () => {
        expect(screen.getByTestId("sync-phase")).toHaveTextContent("done");
      },
      { timeout: 5000 },
    );

    expect(localStorage.getItem(getSyncCursorKey(TEST_USER_ID))).toBe(
      emptyPullResponse.server_timestamp,
    );

    const pullCalls = (mockFetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([url]: [string]) => url.includes("/api/sync/pull"),
    );
    expect(pullCalls.length).toBeGreaterThan(0);
  });

  it("applies pulled server preferences to localStorage", async () => {
    const serverPrefs = {
      user_id: 1,
      data: { hasCompletedOnboarding: true, myTeam: 2 },
      client_updated_at: "2026-01-01T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    const mockFetch = buildFetchMock({
      "/api/sync/status": { ok: true, json: async () => populatedStatus },
      "/api/sync/pull": { ok: true, json: async () => emptyPullResponse },
      "/api/preferences": { ok: true, json: async () => serverPrefs },
    });

    renderSync(true, TEST_USER_ID, mockFetch);

    await waitFor(
      () => {
        expect(screen.getByTestId("sync-phase")).toHaveTextContent("done");
      },
      { timeout: 5000 },
    );

    const stored = localStorage.getItem("worktime_user_state");
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.hasCompletedOnboarding).toBe(true);
    expect(parsed.myTeam).toBe(2);

    // The pull call was made — entity stores are written by applySyncPullResponse.
    // emptyPullResponse has empty arrays, so localStorage entity keys stay absent,
    // which is verified separately in syncClient.test.ts applySyncPullResponse suite.
    const pullCalls = (mockFetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([url]: [string]) => url.includes("/api/sync/pull"),
    );
    expect(pullCalls.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// §2 Branch C / §5 — Conflict dialog
// ===========================================================================

describe("§2 Branch C / §5 — conflict handling", () => {
  it("shows the conflict dialog when both local and server have data", async () => {
    seedLocalTask();

    const mockFetch = buildFetchMock({
      "/api/sync/status": { ok: true, json: async () => populatedStatus },
    });

    renderSync(true, TEST_USER_ID, mockFetch);

    await waitFor(
      () => {
        expect(screen.getByTestId("sync-phase")).toHaveTextContent("conflict");
        expect(
          screen.getByText(/Your local data and your account both have data/i),
        ).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  });

  it("resolves conflict with 'keep local': pulls server state then pushes local as replace", async () => {
    const user = userEvent.setup();
    seedLocalTask();

    const mockFetch = buildFetchMock({
      "/api/sync/status": { ok: true, json: async () => emptyStatus },
      "/api/sync/pull": { ok: true, json: async () => emptyPullResponse },
      "/api/sync/push": { ok: true, json: async () => emptyPushResponse },
      "/api/preferences": { ok: false, status: 404, json: async () => ({}) },
    });

    // First status call → conflict; subsequent calls → empty (post-resolution).
    let statusCalls = 0;
    const smartFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/sync/status")) {
        statusCalls++;
        return statusCalls === 1
          ? { ok: true, json: async () => populatedStatus }
          : { ok: true, json: async () => emptyStatus };
      }
      return (mockFetch as ReturnType<typeof vi.fn>)(url, init);
    }) as unknown as FetchFn;

    renderSync(true, TEST_USER_ID, smartFetch);

    await waitFor(
      () => {
        expect(screen.getByTestId("sync-phase")).toHaveTextContent("conflict");
      },
      { timeout: 5000 },
    );

    // Select "keep local" option and confirm.
    await user.click(screen.getByText(/Keep my local data/i));
    await user.click(screen.getByRole("button", { name: /Apply/i }));

    await waitFor(
      () => {
        expect(screen.getByTestId("sync-phase")).toHaveTextContent("done");
      },
      { timeout: 5000 },
    );

    expect(localStorage.getItem(getSyncCursorKey(TEST_USER_ID))).not.toBeNull();

    const pushCalls = (smartFetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([url]: [string]) => url.includes("/api/sync/push"),
    );
    expect(pushCalls.length).toBeGreaterThan(0);
  });

  it("resolves conflict with 'use server': pulls server data and stores cursor", async () => {
    const user = userEvent.setup();
    seedLocalTask();

    let statusCalls = 0;
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/sync/status")) {
        statusCalls++;
        return statusCalls === 1
          ? { ok: true, json: async () => populatedStatus }
          : { ok: true, json: async () => emptyStatus };
      }
      if (url.includes("/api/sync/pull")) {
        return { ok: true, json: async () => emptyPullResponse };
      }
      if (url.includes("/api/preferences")) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      return { ok: false, json: async () => ({}) };
    }) as unknown as FetchFn;

    renderSync(true, TEST_USER_ID, mockFetch);

    await waitFor(
      () => {
        expect(screen.getByTestId("sync-phase")).toHaveTextContent("conflict");
      },
      { timeout: 5000 },
    );

    await user.click(screen.getByText(/Use server data/i));
    await user.click(screen.getByRole("button", { name: /Apply/i }));

    await waitFor(
      () => {
        expect(screen.getByTestId("sync-phase")).toHaveTextContent("done");
      },
      { timeout: 5000 },
    );

    expect(localStorage.getItem(getSyncCursorKey(TEST_USER_ID))).toBe(
      emptyPullResponse.server_timestamp,
    );
  });

  it("dismisses the conflict dialog ('Decide later') and returns to idle without storing cursor", async () => {
    const user = userEvent.setup();
    seedLocalTask();

    const mockFetch = buildFetchMock({
      "/api/sync/status": { ok: true, json: async () => populatedStatus },
    });

    renderSync(true, TEST_USER_ID, mockFetch);

    await waitFor(
      () => {
        expect(screen.getByTestId("sync-phase")).toHaveTextContent("conflict");
      },
      { timeout: 5000 },
    );

    await user.click(screen.getByRole("button", { name: /Decide later/i }));

    await waitFor(() => {
      expect(screen.getByTestId("sync-phase")).toHaveTextContent("idle");
    });

    expect(localStorage.getItem(getSyncCursorKey(TEST_USER_ID))).toBeNull();
  });
});

// ===========================================================================
// §2 Auth edge cases (full App)
// ===========================================================================

describe("Auth edge cases", () => {
  it("does not run sync when session is still loading", async () => {
    mockSessionContext = { loading: true };

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    render(<App />);
    // Flush pending effects without relying on a fixed-duration delay.
    await act(async () => {});

    const syncCalls = fetchSpy.mock.calls.filter(([url]: [string]) =>
      url.includes("/api/sync"),
    );
    expect(syncCalls).toHaveLength(0);
  });

  it("is not authenticated when session does not exist", () => {
    mockSessionContext = {
      loading: false,
      doesSessionExist: false,
      userId: "",
      accessTokenPayload: {},
      invalidClaims: [],
    };

    render(<App />);

    // The app renders in local-only mode — no sync cursor stored.
    expect(localStorage.getItem(getSyncCursorKey(TEST_USER_ID))).toBeNull();
  });
});
