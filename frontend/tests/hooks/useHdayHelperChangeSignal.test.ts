import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createHdayHelperChangeTransport,
  useHdayHelperChangeSignal,
  type HdayChangeTransport,
} from "@/hooks/useHdayHelperChangeSignal";

/**
 * Create a mock transport that captures the onChanged callback so tests can
 * simulate server-push events without a real connection.
 */
function createMockTransport() {
  let capturedOnChanged: ((etag: string | null) => void) | null = null;
  const unsubscribeMock = vi.fn(() => {
    capturedOnChanged = null;
  });

  const transport: HdayChangeTransport = {
    subscribe(onChanged) {
      capturedOnChanged = onChanged;
      return unsubscribeMock;
    },
  };

  const emit = (etag: string | null) => {
    if (!capturedOnChanged) throw new Error("transport not yet subscribed");
    capturedOnChanged(etag);
  };

  const isSubscribed = () => capturedOnChanged !== null;

  return { transport, emit, unsubscribeMock, isSubscribed };
}

describe("useHdayHelperChangeSignal", () => {
  it("subscribes to the transport when one is provided", () => {
    const { transport, isSubscribed } = createMockTransport();
    renderHook(() => useHdayHelperChangeSignal(transport, vi.fn()));
    expect(isSubscribed()).toBe(true);
  });

  it("does not subscribe when transport is null", () => {
    expect(() => {
      renderHook(() => useHdayHelperChangeSignal(null, vi.fn()));
    }).not.toThrow();
  });

  it("invokes onChanged with the signaled etag", () => {
    const { transport, emit } = createMockTransport();
    const onChanged = vi.fn();
    renderHook(() => useHdayHelperChangeSignal(transport, onChanged));

    emit("sha256:abc");
    expect(onChanged).toHaveBeenCalledWith("sha256:abc");
  });

  it("invokes onChanged with null when the file no longer exists", () => {
    const { transport, emit } = createMockTransport();
    const onChanged = vi.fn();
    renderHook(() => useHdayHelperChangeSignal(transport, onChanged));

    emit(null);
    expect(onChanged).toHaveBeenCalledWith(null);
  });

  it("unsubscribes on unmount", () => {
    const { transport, unsubscribeMock } = createMockTransport();
    const { unmount } = renderHook(() => useHdayHelperChangeSignal(transport, vi.fn()));
    unmount();
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it("resubscribes when the transport identity changes", () => {
    const first = createMockTransport();
    const second = createMockTransport();
    const { rerender } = renderHook(({ transport }) => useHdayHelperChangeSignal(transport, vi.fn()), {
      initialProps: { transport: first.transport },
    });
    expect(first.isSubscribed()).toBe(true);

    rerender({ transport: second.transport });
    expect(first.unsubscribeMock).toHaveBeenCalledTimes(1);
    expect(second.isSubscribed()).toBe(true);
  });

  it("calls the latest onChanged without resubscribing when only the callback changes", () => {
    const { transport, emit, unsubscribeMock } = createMockTransport();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ onChanged }) => useHdayHelperChangeSignal(transport, onChanged), {
      initialProps: { onChanged: first },
    });

    rerender({ onChanged: second });
    emit("sha256:xyz");

    expect(unsubscribeMock).not.toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("sha256:xyz");
  });
});

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** A live SSE response body the test can push frames into (or close) on demand. */
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

describe("createHdayHelperChangeTransport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("opens fetch with the given URL and Accept header, no auth", async () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {})); // never resolves
    vi.stubGlobal("fetch", fetchMock);

    createHdayHelperChangeTransport("http://localhost:8080/hday/jsmith/events").subscribe(vi.fn());

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/hday/jsmith/events",
      expect.objectContaining({
        headers: { Accept: "text/event-stream" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("calls onChanged with the etag when an hday_changed event arrives", async () => {
    const controller = sseController();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(controller.stream)));

    const onChanged = vi.fn();
    createHdayHelperChangeTransport("http://localhost:8080/hday/jsmith/events").subscribe(onChanged);

    controller.send("hday_changed", { type: "hday_changed", username: "jsmith", etag: "sha256:new" });
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalledWith("sha256:new"));
  });

  it("ignores events whose event name is not hday_changed", async () => {
    const controller = sseController();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(controller.stream)));

    const onChanged = vi.fn();
    createHdayHelperChangeTransport("http://localhost:8080/hday/jsmith/events").subscribe(onChanged);

    controller.send("keepalive", { irrelevant: true });
    controller.send("hday_changed", { type: "hday_changed", username: "jsmith", etag: "sha256:new" });

    await vi.waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(onChanged).toHaveBeenCalledWith("sha256:new");
  });

  it("does not throw and does not call onChanged on malformed JSON", async () => {
    const controller = sseController();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(controller.stream)));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const onChanged = vi.fn();
    createHdayHelperChangeTransport("http://localhost:8080/hday/jsmith/events").subscribe(onChanged);

    controller.sendRaw("event: hday_changed\ndata: not-json{{{\n\n");
    controller.send("hday_changed", { type: "hday_changed", username: "jsmith", etag: "sha256:ok" });

    await vi.waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(onChanged).toHaveBeenCalledWith("sha256:ok");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("failed to parse SSE event data"),
      "not-json{{{",
    );
  });

  it("reconnects with backoff when the connection fails, and stops retrying after unsubscribe", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "debug").mockImplementation(() => {});

    const unsubscribe = createHdayHelperChangeTransport(
      "http://localhost:8080/hday/jsmith/events",
    ).subscribe(vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);

    const callsBeforeUnsubscribe = fetchMock.mock.calls.length;
    unsubscribe();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(callsBeforeUnsubscribe);
  });
});
