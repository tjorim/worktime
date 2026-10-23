/**
 * MSW Node server — used by Vitest integration tests.
 *
 * Import this in `tests/setup.ts` and wire up the lifecycle hooks:
 *
 *   beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
 *   afterEach(() => server.resetHandlers());
 *   afterAll(() => server.close());
 */

import { http, HttpResponse } from "msw/http";
import { setupServer } from "msw/node";
import { handlers } from "./handlers";

/**
 * MSW 3 surfaces the CORS preflight (`OPTIONS`) that happy-dom's `fetch()` sends for
 * cross-origin requests (e.g. the local .hday helper) as an unhandled request instead of
 * answering it. Approve every preflight so the real request reaches its own handler.
 * Browser dev mode doesn't need this: the browser handles preflights natively.
 */
const corsPreflightHandler = http.options("*", ({ request }) => {
  const requestedHeaders = request.headers.get("access-control-request-headers");
  return new HttpResponse(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": request.headers.get("origin") ?? "*",
      "access-control-allow-methods": request.headers.get("access-control-request-method") ?? "*",
      ...(requestedHeaders ? { "access-control-allow-headers": requestedHeaders } : {}),
    },
  });
});

export const server = setupServer(corsPreflightHandler, ...handlers);
