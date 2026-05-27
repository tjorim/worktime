/**
 * Central handler registry — re-exports all MSW request handlers.
 *
 * Import `handlers` in both `browser.ts` (setupWorker) and
 * `server.ts` (setupServer) to share the same set of interceptors between
 * the browser dev mode worker and the Vitest Node.js server.
 */

import { holidayHandlers } from "./holidays";
import { readModelHandlers } from "./readModels";
import { scenarioControlHandlers } from "./scenarioControl";
import { syncHandlers } from "./sync";
import { timeOffRequestHandlers } from "./timeOffRequests";
import { timeTrackingHandlers } from "./timeTracking";
import { workLocationHandlers } from "./workLocations";

export const handlers = [
  ...scenarioControlHandlers,
  ...syncHandlers,
  ...holidayHandlers,
  ...readModelHandlers,
  ...timeTrackingHandlers,
  ...timeOffRequestHandlers,
  ...workLocationHandlers,
];
