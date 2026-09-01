import { describe, expect, it, vi } from "vitest";
import {
  createSyncAttemptDiagnostics,
  reportSyncDiagnostic,
  trackSyncRequests,
} from "@/utils/syncDiagnostics";
import type { FetchFn } from "@/utils/syncClient";

function responseWithRequestId(requestId: string | null): Response {
  const headers = new Headers();
  if (requestId !== null) headers.set("X-Request-ID", requestId);
  return new Response(null, { status: 200, headers });
}

function uuidFor(n: number): string {
  const suffix = n.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${suffix}`;
}

describe("trackSyncRequests", () => {
  it("only tracks well-formed UUID request ids", async () => {
    const diagnostics = createSyncAttemptDiagnostics();
    // A reverse proxy or gateway can set X-Request-ID to anything before the
    // backend echoes it back; the diagnostics schema requires UUIDs and would
    // reject the whole report if a non-UUID value slipped through.
    const fetch = trackSyncRequests(
      vi.fn().mockResolvedValue(responseWithRequestId("not-a-uuid")) as FetchFn,
      diagnostics,
    );

    await fetch("/api/sync/status");

    expect(diagnostics.requestIds.size).toBe(0);
  });

  it("tracks a valid UUID request id", async () => {
    const diagnostics = createSyncAttemptDiagnostics();
    const uuid = "907a3698-2331-4d4d-8a8d-56193558168d";
    const fetch = trackSyncRequests(
      vi.fn().mockResolvedValue(responseWithRequestId(uuid)) as FetchFn,
      diagnostics,
    );

    await fetch("/api/sync/status");

    expect(diagnostics.requestIds).toEqual(new Set([uuid]));
  });

  it("caps tracked request ids at the backend's 20-id limit, keeping the most recent", async () => {
    const diagnostics = createSyncAttemptDiagnostics();

    for (let i = 0; i < 25; i++) {
      const tracked = trackSyncRequests(
        vi.fn().mockResolvedValue(responseWithRequestId(uuidFor(i))) as FetchFn,
        diagnostics,
      );
      await tracked("/api/sync/status");
    }

    expect(diagnostics.requestIds.size).toBe(20);
    expect(diagnostics.requestIds.has(uuidFor(0))).toBe(false);
    expect(diagnostics.requestIds.has(uuidFor(24))).toBe(true);
  });
});

describe("reportSyncDiagnostic", () => {
  it("never includes a non-UUID request id in the reported payload", async () => {
    const diagnostics = createSyncAttemptDiagnostics();
    const trackedFetch = trackSyncRequests(
      vi.fn().mockResolvedValue(responseWithRequestId("not-a-uuid")) as FetchFn,
      diagnostics,
    );
    await trackedFetch("/api/sync/status");

    const reportFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    reportSyncDiagnostic(reportFetch, diagnostics, {
      event: "sync_failure",
      phase: "status",
      code: "network_error",
    });

    await vi.waitFor(() => expect(reportFetch).toHaveBeenCalled());

    const body = JSON.parse(reportFetch.mock.calls[0][1].body);
    expect(body.request_ids).toEqual([]);
  });
});
