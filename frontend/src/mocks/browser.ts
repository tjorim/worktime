/**
 * MSW browser worker — used in VITE_MSW=true dev mode.
 *
 * Start with `worker.start()` before mounting the React tree so all
 * API calls are intercepted from the first render.
 */

import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);
