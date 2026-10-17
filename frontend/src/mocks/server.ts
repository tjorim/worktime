/**
 * MSW Node server — used by Vitest integration tests.
 *
 * Import this in `tests/setup.ts` and wire up the lifecycle hooks:
 *
 *   beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
 *   afterEach(() => server.resetHandlers());
 *   afterAll(() => server.close());
 */

import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { handlers } from "./handlers";

// Happy DOM sends CORS preflights through Node's HTTP client. MSW 3 intercepts
// these as well as fetch, so answer them before the actual request is handled.
export const server = setupServer(
  http.options(
    "*",
    ({ request }) =>
      new HttpResponse(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": request.headers.get("Origin") ?? "*",
          "Access-Control-Allow-Methods":
            request.headers.get("Access-Control-Request-Method") ?? "*",
          "Access-Control-Allow-Headers":
            request.headers.get("Access-Control-Request-Headers") ?? "*",
        },
      }),
  ),
  ...handlers,
);
