/**
 * MSW handlers for sync and preferences endpoints.
 *
 * Covers:
 *  GET  /api/sync/events  (SSE — controllable via sseEmitter)
 *  GET  /api/sync/status
 *  POST /api/sync/push
 *  GET  /api/sync/pull
 *  GET  /api/preferences
 *  PUT  /api/preferences
 *  GET  /api/me
 *  GET  /api/users/
 *  PUT  /api/users/:id
 *  DELETE /api/users/:id
 */

import { http, HttpResponse } from "msw";
import { sseEmitter } from "@/mocks/data/sseEmitter";
import { syncStore } from "@/mocks/data/syncStore";
import { buildAuthFailureResponse } from "./auth";
import { getMockScenario } from "@/mocks/scenarios/state";

export const syncHandlers = [
  // GET /api/sync/events — SSE stream; push events via sseEmitter.emit(timestamp)
  http.get("*/api/sync/events", () => {
    const authFailure = buildAuthFailureResponse();
    if (authFailure) return authFailure;

    let ctrl: ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        ctrl = c;
        sseEmitter._add(c);
      },
      cancel() {
        if (ctrl) sseEmitter._remove(ctrl);
      },
    });

    return new HttpResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  }),

  // GET /api/sync/status
  http.get("*/api/sync/status", () => {
    const authFailure = buildAuthFailureResponse();
    if (authFailure) return authFailure;
    if (syncStore.statusError !== null) {
      return new HttpResponse(null, { status: syncStore.statusError });
    }
    return HttpResponse.json(syncStore.status);
  }),

  // POST /api/sync/push
  http.post("*/api/sync/push", () => {
    const authFailure = buildAuthFailureResponse();
    if (authFailure) return authFailure;
    if (syncStore.pushError !== null) {
      return new HttpResponse(null, { status: syncStore.pushError });
    }
    return HttpResponse.json(syncStore.pushResponse);
  }),

  // GET /api/sync/pull — matches the real backend (backend/app/routers/db_sync.py's
  // @router.get("/pull")) and the frontend client's pullSyncData(), which sends no
  // method (defaulting to GET). This handler previously mocked it as POST, so any
  // test exercising the real fetch path (not the injected-fetch harness) would 404
  // here silently — see AccountSyncFlow.integration.test.tsx's full-App sync tests.
  http.get("*/api/sync/pull", () => {
    const authFailure = buildAuthFailureResponse();
    if (authFailure) return authFailure;
    if (syncStore.pullError !== null) {
      return new HttpResponse(null, { status: syncStore.pullError });
    }
    return HttpResponse.json(syncStore.pullData);
  }),

  // GET /api/preferences
  http.get("*/api/preferences", () => {
    const authFailure = buildAuthFailureResponse();
    if (authFailure) return authFailure;
    return HttpResponse.json(syncStore.preferences);
  }),

  // PUT /api/preferences
  http.put("*/api/preferences", async ({ request }) => {
    const authFailure = buildAuthFailureResponse();
    if (authFailure) return authFailure;
    const body = await request.json();
    const now = new Date().toISOString();
    syncStore.preferences = {
      user_id: 1,
      data: (body as { data: Record<string, unknown> }).data ?? {},
      client_updated_at:
        (body as { client_updated_at: string }).client_updated_at ?? now,
      created_at: syncStore.preferences?.created_at ?? now,
      updated_at: now,
    };
    return HttpResponse.json(syncStore.preferences);
  }),

  // GET /api/me
  http.get("*/api/me", () => {
    const authFailure = buildAuthFailureResponse();
    if (authFailure) return authFailure;
    return HttpResponse.json(getMockScenario().auth.profile);
  }),

  // GET /api/users/
  http.get("*/api/users/", () => {
    const authFailure = buildAuthFailureResponse();
    if (authFailure) return authFailure;
    return HttpResponse.json({
      items: [],
      total: 0,
    });
  }),

  // PUT /api/users/:id
  http.put("*/api/users/:id", async ({ params, request }) => {
    const authFailure = buildAuthFailureResponse();
    if (authFailure) return authFailure;
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

  // DELETE /api/users/:id
  http.delete("*/api/users/:id", () => {
    const authFailure = buildAuthFailureResponse();
    if (authFailure) return authFailure;
    return new HttpResponse(null, { status: 204 });
  }),
];
