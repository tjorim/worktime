/**
 * Controllable SSE emitter for MSW tests.
 *
 * The MSW handler for GET /api/sync/events registers each open stream
 * controller here. Tests call `sseEmitter.emit(timestamp)` to push a
 * `sync_changed` frame to every connected stream, simulating a live
 * server-sent event without touching the real backend.
 *
 * Call `sseEmitter.reset()` in afterEach to close all open streams and
 * prevent state from leaking between tests.
 */

const encoder = new TextEncoder();
const controllers = new Set<ReadableStreamDefaultController<Uint8Array>>();

export const sseEmitter = {
  /** Push a `sync_changed` event to all open SSE streams. */
  emit(serverTimestamp: string): void {
    const frame = `event: sync_changed\ndata: ${JSON.stringify({
      type: "sync_changed",
      server_timestamp: serverTimestamp,
    })}\n\n`;
    const encoded = encoder.encode(frame);
    for (const ctrl of controllers) {
      try {
        ctrl.enqueue(encoded);
      } catch {
        // Stream already closed — clean up stale entry.
        controllers.delete(ctrl);
      }
    }
  },

  /** Close all open streams and clear the registry. Call in afterEach. */
  reset(): void {
    for (const ctrl of controllers) {
      try {
        ctrl.close();
      } catch {
        // Already closed.
      }
    }
    controllers.clear();
  },

  /** @internal Called by the MSW handler when a stream opens. */
  _add(ctrl: ReadableStreamDefaultController<Uint8Array>): void {
    controllers.add(ctrl);
  },

  /** @internal Called by the MSW handler when a stream is cancelled. */
  _remove(ctrl: ReadableStreamDefaultController<Uint8Array>): void {
    controllers.delete(ctrl);
  },
};
