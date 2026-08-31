import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFetchSseTransport, useSyncSignal, type SyncSignalTransport } from "@/hooks/useSyncSignal";
import { storeSyncCursor } from "@/utils/syncClient";
import { getSyncCursorKey } from "@/constants/storageKeys";

/**
 * Create a mock transport that captures the onSignal callback so tests can
 * simulate server-push events.  Returns both the transport and a helper to
 * emit a signal.
 */
function createMockTransport() {
  let capturedOnSignal: ((serverTimestamp: string) => void) | null = null;
  const unsubscribeMock = vi.fn(() => {
    capturedOnSignal = null;
  });

  const transport: SyncSignalTransport = {
    subscribe(onSignal) {
      capturedOnSignal = onSignal;
      return unsubscribeMock;
    },
  };

  const emit = (serverTimestamp: string) => {
    if (!capturedOnSignal) throw new Error("transport not yet subscribed");
    capturedOnSignal(serverTimestamp);
  };

  const isSubscribed = () => capturedOnSignal !== null;

  return { transport, emit, unsubscribeMock, isSubscribed };
}

describe("useSyncSignal", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("subscription lifecycle", () => {
    it("subscribes to the transport when isActive and userId are provided", () => {
      const triggerPull = vi.fn();
      const { transport, isSubscribed } = createMockTransport();

      renderHook(() => useSyncSignal(true, "user-1", triggerPull, transport));

      expect(isSubscribed()).toBe(true);
    });

    it("does not subscribe when isActive is false", () => {
      const triggerPull = vi.fn();
      const { transport, isSubscribed } = createMockTransport();

      renderHook(() => useSyncSignal(false, "user-1", triggerPull, transport));

      expect(isSubscribed()).toBe(false);
    });

    it("does not subscribe when userId is null", () => {
      const triggerPull = vi.fn();
      const { transport, isSubscribed } = createMockTransport();

      renderHook(() => useSyncSignal(true, null, triggerPull, transport));

      expect(isSubscribed()).toBe(false);
    });

    it("does not subscribe when transport is null", () => {
      const triggerPull = vi.fn();

      // Should not throw even with null transport.
      expect(() => {
        renderHook(() => useSyncSignal(true, "user-1", triggerPull, null));
      }).not.toThrow();
    });

    it("calls the transport cleanup function on unmount", () => {
      const triggerPull = vi.fn();
      const { transport, unsubscribeMock } = createMockTransport();

      const { unmount } = renderHook(() => useSyncSignal(true, "user-1", triggerPull, transport));

      unmount();

      expect(unsubscribeMock).toHaveBeenCalledTimes(1);
    });

    it("calls the transport cleanup function when isActive changes to false", async () => {
      const triggerPull = vi.fn();
      const { transport, unsubscribeMock } = createMockTransport();

      const { rerender } = renderHook(
        ({ isActive }: { isActive: boolean }) =>
          useSyncSignal(isActive, "user-1", triggerPull, transport),
        { initialProps: { isActive: true } },
      );

      expect(unsubscribeMock).not.toHaveBeenCalled();

      rerender({ isActive: false });

      expect(unsubscribeMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("signal handling — triggerPull invocation", () => {
    it("calls triggerPull when a signal arrives and no cursor exists", () => {
      const triggerPull = vi.fn();
      const { transport, emit } = createMockTransport();

      renderHook(() => useSyncSignal(true, "user-1", triggerPull, transport));

      act(() => {
        emit("2026-02-01T00:00:00.000Z");
      });

      expect(triggerPull).toHaveBeenCalledTimes(1);
    });

    it("calls triggerPull when the signal timestamp is newer than the cursor", () => {
      const triggerPull = vi.fn();
      const { transport, emit } = createMockTransport();

      // Cursor is behind the signal.
      storeSyncCursor("user-1", "2026-01-01T00:00:00.000Z");

      renderHook(() => useSyncSignal(true, "user-1", triggerPull, transport));

      act(() => {
        emit("2026-02-01T00:00:00.000Z"); // newer than cursor
      });

      expect(triggerPull).toHaveBeenCalledTimes(1);
    });
  });

  describe("deduplication via server_timestamp", () => {
    it("does NOT call triggerPull when the signal timestamp equals the cursor", () => {
      const triggerPull = vi.fn();
      const { transport, emit } = createMockTransport();

      storeSyncCursor("user-1", "2026-02-01T00:00:00.000Z");

      renderHook(() => useSyncSignal(true, "user-1", triggerPull, transport));

      act(() => {
        emit("2026-02-01T00:00:00.000Z"); // same as cursor
      });

      expect(triggerPull).not.toHaveBeenCalled();
    });

    it("does NOT call triggerPull when the signal timestamp is older than the cursor", () => {
      const triggerPull = vi.fn();
      const { transport, emit } = createMockTransport();

      storeSyncCursor("user-1", "2026-03-01T00:00:00.000Z");

      renderHook(() => useSyncSignal(true, "user-1", triggerPull, transport));

      act(() => {
        emit("2026-02-01T00:00:00.000Z"); // older than cursor
      });

      expect(triggerPull).not.toHaveBeenCalled();
    });

    it("deduplicates a burst of identical signals — only the first triggers a pull", () => {
      const triggerPull = vi.fn();
      const { transport, emit } = createMockTransport();

      renderHook(() => useSyncSignal(true, "user-1", triggerPull, transport));

      const ts = "2026-02-01T00:00:00.000Z";

      // Simulate the cursor being updated after the first pull (as would happen
      // in production when triggerPull completes).
      triggerPull.mockImplementation(() => {
        storeSyncCursor("user-1", ts);
      });

      act(() => {
        emit(ts);
        emit(ts); // duplicate
        emit(ts); // duplicate
      });

      expect(triggerPull).toHaveBeenCalledTimes(1);
    });

    it("calls triggerPull again after the cursor advances past the previous signal", () => {
      const triggerPull = vi.fn();
      const { transport, emit } = createMockTransport();

      storeSyncCursor("user-1", "2026-01-01T00:00:00.000Z");

      renderHook(() => useSyncSignal(true, "user-1", triggerPull, transport));

      act(() => {
        emit("2026-02-01T00:00:00.000Z"); // triggers pull
      });
      expect(triggerPull).toHaveBeenCalledTimes(1);

      // Advance the cursor to simulate the pull completing.
      storeSyncCursor("user-1", "2026-02-01T00:00:00.000Z");

      act(() => {
        emit("2026-03-01T00:00:00.000Z"); // newer — triggers pull again
      });
      expect(triggerPull).toHaveBeenCalledTimes(2);
    });
  });

  describe("reconnect behavior", () => {
    it("re-subscribes to the new transport when the transport instance changes", () => {
      const triggerPull = vi.fn();
      const mock1 = createMockTransport();
      const mock2 = createMockTransport();

      const { rerender } = renderHook(
        ({ transport }: { transport: SyncSignalTransport }) =>
          useSyncSignal(true, "user-1", triggerPull, transport),
        { initialProps: { transport: mock1.transport } },
      );

      expect(mock1.isSubscribed()).toBe(true);
      expect(mock2.isSubscribed()).toBe(false);

      rerender({ transport: mock2.transport });

      // Old transport cleaned up, new transport subscribed.
      expect(mock1.unsubscribeMock).toHaveBeenCalledTimes(1);
      expect(mock2.isSubscribed()).toBe(true);
    });

    it("signals from the old transport after reconnect are ignored (cleanup called)", () => {
      const triggerPull = vi.fn();
      const mock1 = createMockTransport();
      const mock2 = createMockTransport();

      // Simulate: subscription callback from mock1 still holds a reference to
      // onSignal; after cleanup that callback should no longer call triggerPull.
      // In the real implementation, the transport's subscribe() calls are
      // controlled by the cleanup path — new transport replaces old one.
      const { rerender } = renderHook(
        ({ transport }: { transport: SyncSignalTransport }) =>
          useSyncSignal(true, "user-1", triggerPull, transport),
        { initialProps: { transport: mock1.transport } },
      );

      // Switch to mock2 — mock1.unsubscribe is called.
      rerender({ transport: mock2.transport });
      expect(mock1.unsubscribeMock).toHaveBeenCalledTimes(1);

      // Emit from mock2 — should trigger pull.
      act(() => {
        mock2.emit("2026-04-01T00:00:00.000Z");
      });
      expect(triggerPull).toHaveBeenCalledTimes(1);
    });
  });

  describe("triggerPull ref stability", () => {
    it("uses the latest triggerPull callback even if identity changes between renders", () => {
      const triggerPull1 = vi.fn();
      const triggerPull2 = vi.fn();
      const { transport, emit } = createMockTransport();

      const { rerender } = renderHook(
        ({ fn }: { fn: () => void }) => useSyncSignal(true, "user-1", fn, transport),
        { initialProps: { fn: triggerPull1 } },
      );

      // Update the pull function reference.
      rerender({ fn: triggerPull2 });

      // Signal arrives after the update — latest callback must be used.
      act(() => {
        emit("2026-05-01T00:00:00.000Z");
      });

      expect(triggerPull2).toHaveBeenCalledTimes(1);
      expect(triggerPull1).not.toHaveBeenCalled();
    });
  });

  describe("offline recovery", () => {
    it("triggers pull after coming back online if a new signal arrives", () => {
      const triggerPull = vi.fn();
      const { transport, emit } = createMockTransport();

      // Cursor set to some time before the signal.
      storeSyncCursor("user-1", "2026-01-01T00:00:00.000Z");

      renderHook(() => useSyncSignal(true, "user-1", triggerPull, transport));

      // Simulate offline period (no signals) followed by reconnect.
      // The SSE transport reconnects automatically; after reconnect the server
      // sends a new signal with an up-to-date timestamp.
      act(() => {
        emit("2026-06-01T00:00:00.000Z"); // received after reconnect
      });

      expect(triggerPull).toHaveBeenCalledTimes(1);
    });

    it("does not trigger pull if the cursor is already current at the time of recovery", () => {
      const triggerPull = vi.fn();
      const { transport, emit } = createMockTransport();

      // Cursor is already at the signal's timestamp (client was in sync).
      storeSyncCursor("user-1", "2026-06-01T00:00:00.000Z");

      renderHook(() => useSyncSignal(true, "user-1", triggerPull, transport));

      act(() => {
        emit("2026-06-01T00:00:00.000Z"); // same as cursor — no pull needed
      });

      expect(triggerPull).not.toHaveBeenCalled();
    });

    it("stores the cursor key per userId — different users are isolated", () => {
      const triggerPull = vi.fn();
      const { transport: transport1, emit: emit1 } = createMockTransport();
      const { transport: transport2, emit: emit2 } = createMockTransport();

      // user-1 cursor is up to date; user-2 cursor is behind.
      storeSyncCursor("user-1", "2026-06-01T00:00:00.000Z");
      storeSyncCursor("user-2", "2026-01-01T00:00:00.000Z");

      renderHook(() => useSyncSignal(true, "user-1", triggerPull, transport1));
      renderHook(() => useSyncSignal(true, "user-2", triggerPull, transport2));

      act(() => {
        emit1("2026-06-01T00:00:00.000Z"); // user-1 is current — no pull
        emit2("2026-06-01T00:00:00.000Z"); // user-2 is behind — triggers pull
      });

      expect(triggerPull).toHaveBeenCalledTimes(1);
    });
  });

  describe("cursor key integrity", () => {
    it("reads the correct per-user cursor key from localStorage", () => {
      const triggerPull = vi.fn();
      const { transport, emit } = createMockTransport();

      // Store cursor for user-1 (current) and leave user-2 empty.
      localStorage.setItem(getSyncCursorKey("user-1"), "2026-06-01T00:00:00.000Z");

      renderHook(() => useSyncSignal(true, "user-1", triggerPull, transport));

      act(() => {
        emit("2026-06-01T00:00:00.000Z"); // same as cursor — no pull
      });

      expect(triggerPull).not.toHaveBeenCalled();
    });
  });

  describe("invalid timestamp handling — hook layer", () => {
    it("does NOT call triggerPull when server_timestamp is not a parseable date", () => {
      const triggerPull = vi.fn();
      const { transport, emit } = createMockTransport();

      renderHook(() => useSyncSignal(true, "user-1", triggerPull, transport));

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      act(() => {
        emit("not-a-date");
      });

      expect(triggerPull).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("invalid server_timestamp from sync signal"),
        "not-a-date",
      );
    });

    it("calls triggerPull and removes the cursor when the stored cursor is not a parseable date", () => {
      const triggerPull = vi.fn();
      const { transport, emit } = createMockTransport();

      // Corrupt the stored cursor.
      localStorage.setItem(getSyncCursorKey("user-1"), "garbage");

      renderHook(() => useSyncSignal(true, "user-1", triggerPull, transport));

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      act(() => {
        emit("2026-06-01T00:00:00.000Z");
      });

      expect(triggerPull).toHaveBeenCalledOnce();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("stored sync cursor is corrupted"),
        "garbage",
      );
      expect(localStorage.getItem(getSyncCursorKey("user-1"))).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// createFetchSseTransport — fetch-based SSE adapter unit tests
//
// eventsource-parser's own frame-parsing is well-tested upstream, so these
// tests exercise it for real (through a genuine ReadableStream) rather than
// mocking it away — what's actually ours to verify is the fetch/auth/retry
// orchestration around it. Fake timers drive the exponential-backoff retry
// loop deterministically instead of waiting on real wall-clock time.
// ---------------------------------------------------------------------------

/** Build one raw SSE wire-format frame. */
function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** A live SSE response body the test can push frames into (or close/error) on demand. */
function sseController() {
  let controllerRef: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
    },
  });
  const encoder = new TextEncoder();
  return {
    stream,
    send(event: string, data: unknown) {
      controllerRef.enqueue(encoder.encode(sseFrame(event, data)));
    },
    /** Push a raw, hand-written frame (e.g. deliberately malformed JSON). */
    sendRaw(rawFrame: string) {
      controllerRef.enqueue(encoder.encode(rawFrame));
    },
    close() {
      controllerRef.close();
    },
  };
}

function sseResponse(stream: ReadableStream<Uint8Array>, status = 200): Response {
  return new Response(stream, { status, headers: { "content-type": "text/event-stream" } });
}

describe("createFetchSseTransport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("opens fetch with the given URL, Authorization, and Accept headers", async () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {})); // never resolves
    vi.stubGlobal("fetch", fetchMock);

    createFetchSseTransport("https://api.example.com/sync/events", "token-abc").subscribe(vi.fn());

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/sync/events",
      expect.objectContaining({
        headers: { Authorization: "Bearer token-abc", Accept: "text/event-stream" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("calls onSignal with server_timestamp when a sync_changed event arrives", async () => {
    const controller = sseController();
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(controller.stream));
    vi.stubGlobal("fetch", fetchMock);

    const onSignal = vi.fn();
    createFetchSseTransport("/api/sync/events", "token").subscribe(onSignal);

    controller.send("sync_changed", { type: "sync_changed", server_timestamp: "2026-03-01T12:00:00.000Z" });
    await vi.waitFor(() => expect(onSignal).toHaveBeenCalledWith("2026-03-01T12:00:00.000Z"));
  });

  it("ignores events whose event name is not sync_changed", async () => {
    const controller = sseController();
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(controller.stream));
    vi.stubGlobal("fetch", fetchMock);

    const onSignal = vi.fn();
    createFetchSseTransport("/api/sync/events", "token").subscribe(onSignal);

    controller.send("keepalive", { irrelevant: true });
    controller.send("sync_changed", { type: "sync_changed", server_timestamp: "2026-03-01T12:00:00.000Z" });
    await vi.waitFor(() => expect(onSignal).toHaveBeenCalledTimes(1));
    expect(onSignal).toHaveBeenCalledWith("2026-03-01T12:00:00.000Z");
  });

  it("does not call onSignal when event data is missing server_timestamp", async () => {
    const controller = sseController();
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(controller.stream));
    vi.stubGlobal("fetch", fetchMock);

    const onSignal = vi.fn();
    createFetchSseTransport("/api/sync/events", "token").subscribe(onSignal);

    controller.send("sync_changed", { type: "sync_changed" });
    // Follow up with a well-formed event so there's something to waitFor —
    // proves the first (bad) event was processed and skipped, not just
    // "not processed yet".
    controller.send("sync_changed", { type: "sync_changed", server_timestamp: "2026-03-01T12:00:00.000Z" });

    await vi.waitFor(() => expect(onSignal).toHaveBeenCalledTimes(1));
    expect(onSignal).toHaveBeenCalledWith("2026-03-01T12:00:00.000Z");
  });

  it("does not throw and does not call onSignal when event data is malformed JSON", async () => {
    const controller = sseController();
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(controller.stream));
    vi.stubGlobal("fetch", fetchMock);

    const onSignal = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    createFetchSseTransport("/api/sync/events", "token").subscribe(onSignal);

    controller.sendRaw("event: sync_changed\ndata: not-json{{{\n\n");
    // Follow up with a well-formed event so there's something to waitFor —
    // proves the malformed one was processed (and skipped), not just "not
    // processed yet".
    controller.send("sync_changed", { type: "sync_changed", server_timestamp: "2026-05-01T00:00:00.000Z" });

    await vi.waitFor(() => expect(onSignal).toHaveBeenCalledTimes(1));
    expect(onSignal).toHaveBeenCalledWith("2026-05-01T00:00:00.000Z");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("failed to parse SSE event data"),
      "not-json{{{",
    );
  });

  it("resolves onopen without scheduling a retry for a 200 text/event-stream response", async () => {
    vi.useFakeTimers();
    const controller = sseController();
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(controller.stream));
    vi.stubGlobal("fetch", fetchMock);

    createFetchSseTransport("/api/sync/events", "token").subscribe(vi.fn());
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1); // still just the one open connection
  });

  it("gives up (no retry) on a 401, and does not hammer the endpoint", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    createFetchSseTransport("/api/sync/events", "token").subscribe(vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no retry scheduled
  });

  it("honours Retry-After when the server's SSE connection cap returns 429", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 429, headers: { "Retry-After": "30" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "debug").mockImplementation(() => {});

    createFetchSseTransport("/api/sync/events", "token").subscribe(vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(29_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("supports an HTTP-date Retry-After value and adds jitter between tabs", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T12:00:00.000Z"));
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 429,
        headers: { "Retry-After": "Mon, 31 Aug 2026 12:00:30 GMT" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "debug").mockImplementation(() => {});

    createFetchSseTransport("/api/sync/events", "token").subscribe(vi.fn());
    await vi.advanceTimersByTimeAsync(0);

    // 30s minimum + 10% jitter (half of the 20% jitter window).
    await vi.advanceTimersByTimeAsync(32_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("forces a catch-up pull when the first successful connection follows a 429", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const stream = sseController();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { "Retry-After": "30" } }),
      )
      .mockResolvedValueOnce(sseResponse(stream.stream));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "debug").mockImplementation(() => {});

    const onSignal = vi.fn();
    createFetchSseTransport("/api/sync/events", "token").subscribe(onSignal);
    await vi.advanceTimersByTimeAsync(0);
    expect(onSignal).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onSignal).toHaveBeenCalledTimes(1);
    expect(Number.isNaN(Date.parse(onSignal.mock.calls[0]![0] as string))).toBe(false);
  });

  it("retries a non-auth failure with an increasing back-off interval", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "debug").mockImplementation(() => {});

    createFetchSseTransport("/api/sync/events", "token").subscribe(vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(2); // 1s -> 2nd attempt

    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetchMock).toHaveBeenCalledTimes(3); // 2s -> 3rd attempt

    await vi.advanceTimersByTimeAsync(4_000);
    expect(fetchMock).toHaveBeenCalledTimes(4); // 4s -> 4th attempt
  });

  it("resets the back-off interval after a successful reconnect", async () => {
    vi.useFakeTimers();
    const controller = sseController();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 })) // 1st: fails
      .mockResolvedValueOnce(sseResponse(controller.stream)) // 2nd: succeeds, stays open
      .mockResolvedValue(new Response(null, { status: 503 })); // 3rd+: fails again
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "debug").mockImplementation(() => {});

    const onSignal = vi.fn();
    createFetchSseTransport("/api/sync/events", "token").subscribe(onSignal);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000); // 2nd attempt (succeeds)
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Close the now-open stream to trigger a reconnect — if back-off hadn't
    // reset, the next attempt would be scheduled 2s out instead of 1s.
    controller.close();
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(2); // not yet — under 1s
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(3); // exactly 1s after the drop
  });

  it("forces a catch-up pull (via onSignal) on a *re*connect, but not on the first connection", async () => {
    vi.useFakeTimers();
    const first = sseController();
    const second = sseController();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sseResponse(first.stream))
      .mockResolvedValueOnce(sseResponse(second.stream));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "debug").mockImplementation(() => {});

    const onSignal = vi.fn();
    createFetchSseTransport("/api/sync/events", "token").subscribe(onSignal);
    await vi.advanceTimersByTimeAsync(0);
    expect(onSignal).not.toHaveBeenCalled();

    first.close(); // drop -> reconnect
    await vi.advanceTimersByTimeAsync(1_000);

    expect(onSignal).toHaveBeenCalledTimes(1);
    expect(Number.isNaN(Date.parse(onSignal.mock.calls[0]![0] as string))).toBe(false);
  });

  it("aborts the in-flight fetch when the cleanup function is called", async () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);

    const cleanup = createFetchSseTransport("/api/sync/events", "token").subscribe(vi.fn());

    const signal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    cleanup();
    expect(signal.aborted).toBe(true);
  });

  it("does not schedule a retry after cleanup, even if the in-flight request then fails", async () => {
    vi.useFakeTimers();
    let rejectFetch: (err: unknown) => void;
    const fetchMock = vi.fn().mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectFetch = reject;
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const cleanup = createFetchSseTransport("/api/sync/events", "token").subscribe(vi.fn());
    cleanup();
    rejectFetch!(new DOMException("aborted", "AbortError"));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(fetchMock).toHaveBeenCalledTimes(1); // no reconnect attempt after cleanup
  });
});
