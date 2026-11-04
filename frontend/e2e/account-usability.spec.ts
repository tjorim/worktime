import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { expectNoAccessibilityViolations } from "./axe";

const SHOTS = "../docs/screenshots/1684";

async function seed(page: Page, theme: string, lastUsed: Record<string, unknown> = {}) {
  await page.addInitScript(
    ({ theme, lastUsed }) => {
      localStorage.setItem(
        "oidc.user:http://localhost:9000/application/o/worktime:worktime",
        JSON.stringify({
          access_token: "mock-access-token",
          token_type: "Bearer",
          scope: "openid profile",
          expires_at: Math.floor(Date.now() / 1000) + 86400,
          profile: {
            sub: "sync-status-e2e",
            name: "Sync Tester",
            preferred_username: "sync-tester",
          },
        }),
      );
      localStorage.setItem("worktime_user_state_owner", "sync-status-e2e");
      localStorage.setItem("worktime_sync_cursor_sync-status-e2e", "2026-01-01T00:00:00Z");
      localStorage.setItem(
        "worktime_user_state",
        JSON.stringify({
          hasCompletedOnboarding: true,
          scheduleType: "9-5",
          settings: { theme, enableTimeTracking: true, enableTimeOff: true },
          lastUsed,
        }),
      );
    },
    { theme, lastUsed },
  );
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [1280, 390]) {
    const label = `${theme}-${width}`;
    test.describe(`account and form usability (${label})`, () => {
      test.use({ colorScheme: theme, viewport: { width, height: 900 } });
      test.setTimeout(90_000);

      test("account page order, field help and confirmations", async ({ page }) => {
        await mkdir(SHOTS, { recursive: true });
        await seed(page, theme);
        // MSW's service worker answers before page.route can, so stub the one GET in the page.
        await page.addInitScript(() => {
          const realFetch = window.fetch.bind(window);
          window.fetch = (input, init) => {
            const url =
              typeof input === "string"
                ? input
                : input instanceof Request
                  ? input.url
                  : String(input);
            const method = (
              init?.method ?? (input instanceof Request ? input.method : "GET")
            ).toUpperCase();
            return method === "GET" && new URL(url, location.origin).pathname === "/api/ical"
              ? Promise.resolve(
                  Response.json({ configured: true, token_preview: "f3a9", last_used_at: null }),
                )
              : realFetch(input, init);
          };
        });
        await page.goto("/settings?section=account");
        await expect(page.locator("#account-display-name")).toBeEnabled({ timeout: 20000 });
        await expect(page.getByRole("heading", { name: "Calendar subscription" })).toBeVisible();

        // Actionable sections come first; the activity feed and danger zone close the page.
        const headings = await page
          .locator("main section > div > h2, section h2")
          .allTextContents();
        const order = [
          "Account",
          "API tokens",
          "Calendar subscription",
          "Integration clients",
          "Export account data",
          "Recent activity",
          "Danger zone",
        ];
        const positions = order.map((name) => headings.findIndex((h) => h.trim() === name));
        expect(
          positions.every((p) => p >= 0),
          headings.join(" | "),
        ).toBe(true);
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
        await page.screenshot({ path: `${SHOTS}/account-order-${label}.png`, fullPage: true });

        // Disabled "Generate token" explains itself.
        const tokenName = page.getByLabel("Token name");
        const generate = page.getByRole("button", { name: "Generate token" });
        await expect(generate).toBeDisabled();
        await expect(generate).toHaveAccessibleDescription(
          "Enter a name of up to 100 characters to generate a token.",
        );
        await expect(tokenName).toHaveAttribute("maxlength", "100");
        await tokenName.scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${SHOTS}/token-form-${label}.png` });

        // Integration client scopes are described.
        const clientName = page.getByLabel("Client name");
        await clientName.scrollIntoViewIfNeeded();
        await expect(
          page.getByRole("checkbox", { name: "worktime:mcp" }),
        ).toHaveAccessibleDescription(/MCP assistants and scripts/);
        await page.screenshot({ path: `${SHOTS}/integration-form-${label}.png` });

        // Revoking the calendar link asks first.
        const revoke = page.getByRole("button", { name: "Revoke", exact: true });
        await expect(revoke).toBeVisible({ timeout: 30_000 });
        await revoke.click();
        const dialog = page.getByRole("alertdialog");
        await expect(dialog).toContainText("Revoke the calendar link?");
        await page.screenshot({ path: `${SHOTS}/calendar-revoke-confirm-${label}.png` });
        await expectNoAccessibilityViolations(page, `revoke confirmation (${label})`);
        await dialog.getByRole("button", { name: "Cancel" }).click();

        await expectNoAccessibilityViolations(page, `account page (${label})`);
      });

      test("time tracking Add Task prints why it is disabled", async ({ page }) => {
        await mkdir(SHOTS, { recursive: true });
        await seed(page, theme, { activeTab: "timetracking", timeTrackingView: "daily" });
        await page.goto("/");
        const add = page.getByRole("button", { name: "Add Task", exact: true });
        await expect(add).toBeDisabled({ timeout: 30_000 });
        await expect(page.getByText("Add Task: Enter a task name first.")).toBeVisible();
        await page.screenshot({ path: `${SHOTS}/add-task-reason-${label}.png` });
        await expectNoAccessibilityViolations(page, `add task reason (${label})`);
      });

      test("wizard keeps the same step total after picking a team schedule", async ({ page }) => {
        await mkdir(SHOTS, { recursive: true });
        await page.addInitScript((theme) => {
          localStorage.setItem("worktime_user_state", JSON.stringify({ settings: { theme } }));
        }, theme);
        await page.goto("/");
        await expect(page.getByText("Step 1 of 8")).toBeVisible();
        await page.getByRole("button", { name: /Let's Get Started/ }).click();
        await page.getByRole("button", { name: /Choose a Schedule/ }).click();
        await expect(page.getByText("Step 3 of 8")).toBeVisible();
        await page.getByRole("button", { name: /5-shift/ }).click();
        await expect(page.getByText("Step 3 of 8")).toBeVisible();
        await page.screenshot({ path: `${SHOTS}/wizard-schedule-${label}.png` });
        await page.getByRole("button", { name: /Continue/ }).click();
        await expect(page.getByText("Step 3 of 8")).toBeVisible();
        await page.screenshot({ path: `${SHOTS}/wizard-team-${label}.png` });
      });
    });
  }
}
