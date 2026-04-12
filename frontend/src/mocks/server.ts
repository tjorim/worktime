/**
 * MSW Node server — used by Vitest integration tests.
 *
 * Import this in `tests/setup.ts` and wire up the lifecycle hooks:
 *
 *   beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
 *   afterEach(() => server.resetHandlers());
 *   afterAll(() => server.close());
 */

import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);
