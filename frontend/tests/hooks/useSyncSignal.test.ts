import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFetchSseTransport, useSyncSignal, type SyncSignalTransport } from "@/hooks/useSyncSignal";
import { storeSyncCursor } from "@/utils/syncClient";
import { getSyncCursorKey } from "@/constants/storageKeys";

const fetchEventSourceMock = vi.fn();

vi.mock("@microsoft/fetch-event-source", () => ({
  fetchEventSource: (...args: unknown[]) => fetchEventSourceMock(...args),
  EventStreamContentType: "text/event-stream",
}));

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
// @microsoft/fetch-event-source is mocked: its own frame-parsing is already
// covered upstream, so these tests exercise our glue code by capturing the
// options object passed to it and invoking the callbacks (onopen, onmessage,
// onerror) directly, the same way the library would.
// ---------------------------------------------------------------------------

interface CapturedFetchEventSourceOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  onopen: (response: Response) => Promise<void>;
  onmessage: (event: { id: string; event: string; data: string; retry?: number }) => void;
  onerror: (err: unknown) => number | undefined;
}

function captureOptions(): CapturedFetchEventSourceOptions {
  expect(fetchEventSourceMock).toHaveBeenCalledTimes(1);
  return fetchEventSourceMock.mock.calls[0]![1] as CapturedFetchEventSourceOptions;
}

function okResponse(): Response {
  return new Response(null, { status: 200, headers: { "content-type": "text/event-stream" } });
}

describe("createFetchSseTransport", () => {
  afterEach(() => {
    fetchEventSourceMock.mockReset();
    vi.restoreAllMocks();
  });

  it("opens the stream with the given URL and Authorization header", () => {
    fetchEventSourceMock.mockReturnValue(new Promise(() => {}));

    createFetchSseTransport("https://api.example.com/sync/events", "token-abc").subscribe(vi.fn());

    expect(fetchEventSourceMock).toHaveBeenCalledWith(
      "https://api.example.com/sync/events",
      expect.objectContaining({ headers: { Authorization: "Bearer token-abc" } }),
    );
  });

  it("calls onSignal with server_timestamp when a sync_changed event arrives", async () => {
    fetchEventSourceMock.mockReturnValue(new Promise(() => {}));

    const onSignal = vi.fn();
    createFetchSseTransport("/api/sync/events", "token").subscribe(onSignal);
    const options = captureOptions();

    options.onmessage({
      id: "",
      event: "sync_changed",
      data: JSON.stringify({ type: "sync_changed", server_timestamp: "2026-03-01T12:00:00.000Z" }),
    });

    expect(onSignal).toHaveBeenCalledWith("2026-03-01T12:00:00.000Z");
  });

  it("ignores events whose event name is not sync_changed", () => {
    fetchEventSourceMock.mockReturnValue(new Promise(() => {}));

    const onSignal = vi.fn();
    createFetchSseTransport("/api/sync/events", "token").subscribe(onSignal);
    const options = captureOptions();

    options.onmessage({ id: "", event: "keepalive", data: "{}" });

    expect(onSignal).not.toHaveBeenCalled();
  });

  it("does not call onSignal when event data is missing server_timestamp", () => {
    fetchEventSourceMock.mockReturnValue(new Promise(() => {}));

    const onSignal = vi.fn();
    createFetchSseTransport("/api/sync/events", "token").subscribe(onSignal);
    const options = captureOptions();

    options.onmessage({ id: "", event: "sync_changed", data: JSON.stringify({ type: "sync_changed" }) });

    expect(onSignal).not.toHaveBeenCalled();
  });

  it("does not throw and does not call onSignal when event data is malformed JSON", () => {
    fetchEventSourceMock.mockReturnValue(new Promise(() => {}));

    const onSignal = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    createFetchSseTransport("/api/sync/events", "token").subscribe(onSignal);
    const options = captureOptions();

    options.onmessage({ id: "", event: "sync_changed", data: "not-json{{{" });

    expect(onSignal).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("failed to parse SSE event data"),
      "not-json{{{",
    );
  });

  it("resolves onopen without throwing for a 200 text/event-stream response", async () => {
    fetchEventSourceMock.mockReturnValue(new Promise(() => {}));

    createFetchSseTransport("/api/sync/events", "token").subscribe(vi.fn());
    const options = captureOptions();

    await expect(options.onopen(okResponse())).resolves.toBeUndefined();
  });

  it("throws a fatal error from onopen on 401, and onerror rethrows it (stops retrying)", async () => {
    fetchEventSourceMock.mockReturnValue(new Promise(() => {}));

    createFetchSseTransport("/api/sync/events", "token").subscribe(vi.fn());
    const options = captureOptions();
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const unauthorized = new Response(null, { status: 401 });
    await expect(options.onopen(unauthorized)).rejects.toThrow("SSE authentication failed: 401");

    let caught: unknown;
    try {
      await options.onopen(unauthorized);
    } catch (err) {
      caught = err;
    }
    expect(() => options.onerror(caught)).toThrow();
  });

  it("throws a non-fatal error from onopen on other non-ok statuses", async () => {
    fetchEventSourceMock.mockReturnValue(new Promise(() => {}));

    createFetchSseTransport("/api/sync/events", "token").subscribe(vi.fn());
    const options = captureOptions();

    await expect(options.onopen(new Response(null, { status: 503 }))).rejects.toThrow(
      "SSE connection failed: 503",
    );
  });

  it("onerror returns an increasing back-off interval for non-fatal errors, capped at the max", () => {
    fetchEventSourceMock.mockReturnValue(new Promise(() => {}));
    vi.spyOn(console, "debug").mockImplementation(() => {});

    createFetchSseTransport("/api/sync/events", "token").subscribe(vi.fn());
    const options = captureOptions();

    const first = options.onerror(new Error("network blip"));
    const second = options.onerror(new Error("network blip"));
    const third = options.onerror(new Error("network blip"));

    expect(first).toBe(1_000);
    expect(second).toBe(2_000);
    expect(third).toBe(4_000);
  });

  it("resets the back-off interval after a successful reconnect", async () => {
    fetchEventSourceMock.mockReturnValue(new Promise(() => {}));
    vi.spyOn(console, "debug").mockImplementation(() => {});

    createFetchSseTransport("/api/sync/events", "token").subscribe(vi.fn());
    const options = captureOptions();

    options.onerror(new Error("blip"));
    expect(options.onerror(new Error("blip"))).toBe(2_000);

    await options.onopen(okResponse());

    expect(options.onerror(new Error("blip"))).toBe(1_000);
  });

  it("forces a catch-up pull (via onSignal) on a *re*connect, but not on the first connection", async () => {
    fetchEventSourceMock.mockReturnValue(new Promise(() => {}));

    const onSignal = vi.fn();
    createFetchSseTransport("/api/sync/events", "token").subscribe(onSignal);
    const options = captureOptions();

    await options.onopen(okResponse());
    expect(onSignal).not.toHaveBeenCalled();

    await options.onopen(okResponse());
    expect(onSignal).toHaveBeenCalledTimes(1);
    expect(onSignal).toHaveBeenCalledWith(expect.any(String));
    expect(Number.isNaN(Date.parse(onSignal.mock.calls[0]![0] as string))).toBe(false);
  });

  it("aborts the underlying request when the cleanup function is called", () => {
    let capturedSignal: AbortSignal | undefined;
    fetchEventSourceMock.mockImplementation((_url: string, options: CapturedFetchEventSourceOptions) => {
      capturedSignal = options.signal;
      return new Promise(() => {});
    });

    const cleanup = createFetchSseTransport("/api/sync/events", "token").subscribe(vi.fn());

    expect(capturedSignal?.aborted).toBe(false);
    cleanup();
    expect(capturedSignal?.aborted).toBe(true);
  });
});
