import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncStatusIndicator } from "@/components/sync/SyncStatusIndicator";

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: true },
  sync: {
    isSyncing: false,
    lastSyncedAt: null as string | null,
    outboxCount: 0,
    hasSyncError: false,
    conflictCount: 0,
    retryAfter: null as number | null,
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mocks.auth,
}));

vi.mock("@/contexts/OngoingSyncContext", () => ({
  useOngoingSyncContext: () => mocks.sync,
}));

describe("SyncStatusIndicator offline state", () => {
  beforeEach(() => {
    mocks.auth.isAuthenticated = true;
    Object.assign(mocks.sync, {
      isSyncing: false,
      lastSyncedAt: null,
      outboxCount: 0,
      hasSyncError: false,
      conflictCount: 0,
      retryAfter: null,
    });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows queued offline work ahead of a generic sync error", () => {
    mocks.sync.outboxCount = 3;
    mocks.sync.hasSyncError = true;

    render(<SyncStatusIndicator />);

    expect(screen.getByLabelText("Sync status: Offline · 3 queued")).toHaveClass(
      "sync-indicator--warning",
    );
    expect(screen.queryByLabelText(/Sync failed/)).not.toBeInTheDocument();
  });

  it("stays hidden for local-only users", () => {
    mocks.auth.isAuthenticated = false;

    render(<SyncStatusIndicator />);

    expect(screen.queryByLabelText(/Sync status/)).not.toBeInTheDocument();
  });

  it("updates when the browser reports that the connection returned", () => {
    const { rerender } = render(<SyncStatusIndicator />);
    expect(screen.getByLabelText("Sync status: Offline")).toBeInTheDocument();

    act(() => window.dispatchEvent(new Event("online")));
    rerender(<SyncStatusIndicator />);

    expect(screen.queryByLabelText("Sync status: Offline")).not.toBeInTheDocument();
  });

  it("clears the offline hint after a successful sync", () => {
    const { rerender } = render(<SyncStatusIndicator />);
    expect(screen.getByLabelText("Sync status: Offline")).toBeInTheDocument();

    mocks.sync.lastSyncedAt = "2026-08-22T12:00:00Z";
    rerender(<SyncStatusIndicator />);

    expect(screen.getByLabelText("Sync status: Synced")).toBeInTheDocument();
  });
});

describe("SyncStatusIndicator spin state", () => {
  beforeEach(() => {
    mocks.auth.isAuthenticated = true;
    Object.assign(mocks.sync, {
      isSyncing: false,
      lastSyncedAt: null,
      outboxCount: 0,
      hasSyncError: false,
      conflictCount: 0,
      retryAfter: null,
    });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps spinning while syncing even with items still queued in the outbox", () => {
    // A flush is typically triggered *by* having queued outbox items, so this
    // is the common case, not an edge case.
    mocks.sync.isSyncing = true;
    mocks.sync.outboxCount = 2;

    render(<SyncStatusIndicator />);

    const indicator = screen.getByLabelText("Sync status: Syncing…");
    expect(indicator.querySelector("i")).toHaveClass("sync-spin");
  });

  it("does not spin the static pending icon once syncing has stopped", () => {
    mocks.sync.isSyncing = false;
    mocks.sync.outboxCount = 2;

    render(<SyncStatusIndicator />);

    const indicator = screen.getByLabelText("Sync status: 2 pending");
    expect(indicator.querySelector("i")).not.toHaveClass("sync-spin");
  });
});
