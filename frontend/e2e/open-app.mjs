/**
 * Manual debugging helper: opens a real, visible Chromium window already
 * authenticated and past onboarding (9-5 schedule, Time Tracking enabled),
 * using the storageState produced by auth.setup.ts. Not part of the test
 * suite — run it directly when you want to poke at the app locally without
 * clicking through the first-run wizard every time.
 *
 * Usage:
 *   VITE_MSW=true pnpm exec vite --no-open       # in one terminal
 *   pnpm exec playwright test --project=setup    # once, to (re)generate the storageState
 *   node e2e/open-app.mjs                        # in another terminal
 */
import { chromium } from "@playwright/test";

const authFile = "e2e/.auth/user.json";
const baseURL = process.env.BASE_URL ?? "http://localhost:8000";

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ storageState: authFile });
const page = await context.newPage();
await page.goto(baseURL);
process.stdout.write(`Worktime open at ${baseURL} — close the window to exit.\n`);
await new Promise((resolve) => {
  browser.on("disconnected", () => resolve());
});
