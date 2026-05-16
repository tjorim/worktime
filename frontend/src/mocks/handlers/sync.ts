/**
 * MSW handlers for sync and preferences endpoints.
 *
 * Covers:
 *  GET  /api/sync/status
 *  POST /api/sync/push
 *  POST /api/sync/pull
 *  GET  /api/preferences
 *  PUT  /api/preferences
 *  GET  /api/me
 *  GET  /api/users/
 *  PUT  /api/users/:id
 *  DELETE /api/users/:id
 */

import { http, HttpResponse } from "msw";
import { syncStore } from "@/mocks/data/syncStore";

export const syncHandlers = [
  // GET /api/sync/status
  http.get("*/api/sync/status", () => {
    if (syncStore.statusError !== null) {
      return new HttpResponse(null, { status: syncStore.statusError });
    }
    return HttpResponse.json(syncStore.status);
  }),

  // POST /api/sync/push
  http.post("*/api/sync/push", () => {
    if (syncStore.pushError !== null) {
      return new HttpResponse(null, { status: syncStore.pushError });
    }
    return HttpResponse.json(syncStore.pushResponse);
  }),

  // POST /api/sync/pull
  http.post("*/api/sync/pull", () => {
    if (syncStore.pullError !== null) {
      return new HttpResponse(null, { status: syncStore.pullError });
    }
    return HttpResponse.json(syncStore.pullData);
  }),

  // GET /api/preferences
  http.get("*/api/preferences", () => {
    return HttpResponse.json(syncStore.preferences);
  }),

  // PUT /api/preferences
  http.put("*/api/preferences", async ({ request }) => {
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
    return HttpResponse.json({
      id: 1,
      username: "dev-user",
      display_name: "Dev User",
      is_admin: false,
      capabilities: { backup_enabled: true },
    });
  }),

  // GET /api/users/
  http.get("*/api/users/", () => {
    return HttpResponse.json({
      items: [],
      total: 0,
    });
  }),

  // PUT /api/users/:id
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

  // DELETE /api/users/:id
  http.delete("*/api/users/:id", () => {
    return new HttpResponse(null, { status: 204 });
  }),
];
