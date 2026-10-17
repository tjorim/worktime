import { expect, test, type Route } from "@playwright/test";

/**
 * Code-split routes against the production build and its real service worker (#1513).
 * Settings, Privacy and Pebble pairing are separate chunks; Workbox must precache them
 * so they keep working offline, and a chunk that can't be fetched must be recoverable.
 */
const ROUTE_CHUNKS = ["SettingsPage", "PrivacyPage", "PebblePairPage"];

test.describe("lazy routes and the service worker", () => {
  test("route chunks are precached and open offline without ever being fetched online", async ({
    page,
    context,
  }) => {
    // Home never requests the Privacy chunk, so offline /privacy can only come from the precache.
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect
      .poll(
        () =>
          page.evaluate(async (chunks) => {
            const urls: string[] = [];
            for (const name of await caches.keys()) {
              const cache = await caches.open(name);
              urls.push(...(await cache.keys()).map((request) => new URL(request.url).pathname));
            }
            return chunks.every((chunk) => urls.some((url) => url.includes(`/${chunk}-`)));
          }, ROUTE_CHUNKS),
        { timeout: 60_000 },
      )
      .toBe(true);

    // Reload once so the page is controlled by the worker, then drop the network.
    await page.reload();
    await context.setOffline(true);
    await page.goto("/privacy");

    // The first-run wizard modal makes the page behind it inert, so match without roles.
    await expect(page.locator("main h1")).toHaveText("Privacy policy");
    await expect(page.getByText("Could not load this page")).toHaveCount(0);
  });

  for (const [name, fail] of [
    ["the network fails", (route: Route) => route.abort()],
    ["the chunk is gone after a deploy", (route: Route) => route.fulfill({ status: 404 })],
  ] as const) {
    test(`a route chunk fails to load because ${name}: reloading recovers`, async ({ browser }) => {
      // Browsers remember a failed module fetch for the life of the document, so recovery is a
      // reload (which also fetches the current index.html), not another import().
      const context = await browser.newContext({ serviceWorkers: "block" });
      const page = await context.newPage();
      const chunk = "**/assets/js/PrivacyPage-*.js";
      await page.route(chunk, fail);

      await page.goto("/privacy");
      await page.getByRole("button", { name: "Maybe Later" }).click();
      await expect(
        page.getByRole("alert").filter({ hasText: "Could not load this page" }),
      ).toBeVisible();

      await page.unroute(chunk);
      await Promise.all([
        page.waitForEvent("load"),
        page.getByRole("button", { name: "Reload Page" }).click(),
      ]);

      await expect(page.locator("main h1")).toHaveText("Privacy policy");
      await context.close();
    });
  }

  test("the worker only caches GET navigations and assets and has no write replay", async ({
    request,
  }) => {
    const sw = await (await request.get("/sw.js")).text();
    // No Workbox Background Sync / retry queue: an update or reconnect never replays a write.
    expect(sw).not.toMatch(/backgroundSync|background-sync|BackgroundSyncPlugin|Queue\(/i);
  });
});
