import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("pending, offline, retry, recovery and grouped account load failures", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "oidc.user:http://localhost:9000/application/o/worktime:worktime",
      JSON.stringify({
        access_token: "mock-access-token",
        token_type: "Bearer",
        scope: "openid profile",
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        profile: { sub: "sync-status-e2e", name: "Sync Tester", preferred_username: "sync-tester" },
      }),
    );
    localStorage.setItem("worktime_user_state_owner", "sync-status-e2e");
    localStorage.setItem("worktime_sync_cursor_sync-status-e2e", "2026-01-01T00:00:00Z");
    localStorage.setItem(
      "worktime_user_state",
      JSON.stringify({
        hasCompletedOnboarding: true,
        scheduleType: "9-5",
        settings: { theme: "light", enableTimeTracking: true },
        lastUsed: { activeTab: "timetracking", timeTrackingView: "weekly" },
      }),
    );
  });
  await page.goto("/settings?section=account");
  const indicator = page.getByRole("status", { name: /^Sync status:/ });
  await expect(indicator).toContainText("Synced");
  await mkdir("../docs/screenshots/1681", { recursive: true });
  const capture = async (state: string) => {
    for (const close of await page.getByRole("button", { name: "Close notification" }).all())
      await close.click();
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => {
        const raw = JSON.parse(localStorage.getItem("worktime_user_state")!);
        raw.settings.theme = theme;
        const next = JSON.stringify(raw);
        localStorage.setItem("worktime_user_state", next);
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: "worktime_user_state",
            newValue: next,
            storageArea: localStorage,
          }),
        );
      }, theme);
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => window.scrollTo(0, 0));
        if (state === "pending") await expect(indicator).toContainText(/pending/);
        if (state === "synced" || state === "recovered")
          await expect(indicator).toContainText("Synced");
        await page.screenshot({
          path: `../docs/screenshots/1681/${state}-${theme}-${width}.png`,
          fullPage: true,
        });
      }
    }
  };
  await capture("synced");
  await page.evaluate(async () => {
    const original = window.fetch;
    let released = false;
    window.addEventListener("release-test-push", () => {
      released = true;
    });
    window.fetch = async (input, init) => {
      if (!String(input).includes("/api/sync/push")) return original(input, init);
      if (!released)
        await new Promise<void>((resolve) =>
          window.addEventListener("release-test-push", () => resolve(), { once: true }),
        );
      return new Response(null, { status: 503 });
    };
    // Import the exact URL the app loaded (Vite may append ?t=…), otherwise this
    // would create a second copy of the module that the app never sees.
    const modulePath =
      performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .find((name) => /\/src\/db\/collections\.ts(\?|$)/.test(name)) ?? "/src/db/collections.ts";
    const { tasksCollection } = await import(/* @vite-ignore */ modulePath);
    tasksCollection.insert({
      id: "offline-task-1681",
      text: "Offline task",
      label: "d15b0000-0000-4000-8000-000000000001",
      startTime: "2026-11-04T09:00",
      stopTime: "2026-11-04T10:00",
      includesBreak: false,
    });
  });
  await expect(indicator).toContainText(/pending/);
  await capture("pending");
  await page.evaluate(() => window.dispatchEvent(new Event("release-test-push")));
  await expect(indicator).toContainText(/Sync failed/);
  await expect(indicator).toContainText(/Retrying in/);
  await capture("failed-retrying");
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(indicator).toContainText(/Offline/);
  await capture("offline");
  await page.evaluate(() => {
    const failingFetch = window.fetch;
    let accountUnavailable = true;
    window.addEventListener("restore-test-account", () => {
      accountUnavailable = false;
    });
    window.fetch = (input, init) => {
      if (String(input).includes("/api/sync/push"))
        return Promise.resolve(new Response(JSON.stringify({ results: {} }), { status: 200 }));
      if (
        accountUnavailable &&
        ["/api/me", "/api/access-tokens", "/api/ical", "/api/integration-clients"].some((path) =>
          String(input).endsWith(path),
        )
      )
        return Promise.resolve(new Response(null, { status: 503 }));
      return failingFetch(input, init);
    };
    window.dispatchEvent(new Event("online"));
  });
  await expect(indicator).toContainText("Synced");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Back to app" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Some account sections could not be loaded" }),
  ).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Retry", exact: true }).first()).toBeVisible();
  await capture("account-errors");
  await page.evaluate(() => window.dispatchEvent(new Event("restore-test-account")));
  const retries = page.getByRole("button", { name: "Retry", exact: true });
  for (let remaining = 4; remaining > 0; remaining--) {
    await expect(retries).toHaveCount(remaining);
    await retries.first().click();
    await expect(retries).toHaveCount(remaining - 1);
  }
  await expect(
    page.getByText("Some account sections could not be loaded", { exact: false }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("worktime_sync_outbox_sync-status-e2e") ?? "[]").length,
    ),
  ).toBe(0);
  expect(
    await page.evaluate(async () => {
      // Same URL the app loaded (Vite may append ?t=…), so this is the app's instance.
      const modulePath =
        performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .find((name) => /\/src\/db\/collections\.ts(\?|$)/.test(name)) ??
        "/src/db/collections.ts";
      const { tasksCollection } = await import(/* @vite-ignore */ modulePath);
      return tasksCollection.toArray.filter(
        (task: { id: string }) => task.id === "offline-task-1681",
      ).length;
    }),
  ).toBe(1);
  await capture("recovered");
});
