/**
 * Central handler registry — re-exports all MSW request handlers.
 *
 * Import `handlers` in both `browser.ts` (setupWorker) and
 * `server.ts` (setupServer) to share the same set of interceptors between
 * the browser dev mode worker and the Vitest Node.js server.
 */

import { holidayHandlers } from "./holidays";
import { syncHandlers } from "./sync";

export const handlers = [...syncHandlers, ...holidayHandlers];
