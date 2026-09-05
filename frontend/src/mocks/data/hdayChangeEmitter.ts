/**
 * Controllable SSE emitter for hday-helper change-notification tests.
 *
 * Mirrors `sseEmitter.ts` (used for the account's own `/api/sync/events`),
 * but keyed by username: the real hday-helper's `GET /hday/:username/events`
 * stream only ever notifies subscribers of that one user's file, so this
 * only delivers `emit(username, etag)` to controllers registered for that
 * username.
 *
 * Call `hdayChangeEmitter.reset()` in afterEach to close all open streams
 * and prevent state from leaking between tests.
 */

const encoder = new TextEncoder();
const controllersByUsername = new Map<string, Set<ReadableStreamDefaultController<Uint8Array>>>();

export const hdayChangeEmitter = {
  /** Push an `hday_changed` event to every stream open for `username`. */
  emit(username: string, etag: string | null): void {
    const controllers = controllersByUsername.get(username);
    if (!controllers) return;
    const frame = `event: hday_changed\ndata: ${JSON.stringify({
      type: "hday_changed",
      username,
      etag,
    })}\n\n`;
    const encoded = encoder.encode(frame);
    for (const ctrl of controllers) {
      try {
        ctrl.enqueue(encoded);
      } catch {
        controllers.delete(ctrl);
      }
    }
  },

  /** Close all open streams and clear the registry. Call in afterEach. */
  reset(): void {
    for (const controllers of controllersByUsername.values()) {
      for (const ctrl of controllers) {
        try {
          ctrl.close();
        } catch {
          // Already closed.
        }
      }
    }
    controllersByUsername.clear();
  },

  /** @internal Called by the MSW handler when a stream opens. */
  _add(username: string, ctrl: ReadableStreamDefaultController<Uint8Array>): void {
    let controllers = controllersByUsername.get(username);
    if (!controllers) {
      controllers = new Set();
      controllersByUsername.set(username, controllers);
    }
    controllers.add(ctrl);
  },

  /** @internal Called by the MSW handler when a stream is cancelled. */
  _remove(username: string, ctrl: ReadableStreamDefaultController<Uint8Array>): void {
    controllersByUsername.get(username)?.delete(ctrl);
  },
};
