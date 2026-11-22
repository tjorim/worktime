import type { AuditEntryListResponse, IcalFeedStatus } from "@/api-types";
import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { expectNoAccessibilityViolations } from "./axe";

const SHOTS = "test-results/review-screenshots/1684";

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

      test("account, connections, activity and exports", async ({ page }, testInfo) => {
        await mkdir(SHOTS, { recursive: true });
        await seed(page, theme);
        const capture = async (section: string) => {
          const path = testInfo.outputPath(`${section}-${label}.png`);
          await page.screenshot({ path, fullPage: true });
          await testInfo.attach(`${section}-${label}`, { path, contentType: "image/png" });
        };
        const openSection = async (section: string, name: string) => {
          if (width < 1024) {
            await page
              .getByRole("combobox", { name: "Sections", exact: true })
              .selectOption(section);
          } else {
            await page
              .getByRole("navigation", { name: "Sections" })
              .getByRole("button", { name, exact: true })
              .click();
          }
          await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
        };
        // Stub GETs in the page so they take precedence over the MSW service worker.
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
            const path = new URL(url, location.origin).pathname;
            if (method === "GET" && path === "/api/audit") {
              return Promise.resolve(
                Response.json({
                  items: [
                    {
                      id: 1,
                      actor_user_id: 1,
                      actor_label: "user:1",
                      subject: null,
                      auth_source: "oidc",
                      action: "create_time_off_entry",
                      resource_type: "time_off_entry",
                      resource_id: "legacy-opaque-id",
                      request_id: null,
                      details: { entry_type: "vacation", date: "2026-11-02" },
                      created_at: "2026-10-15T12:00:00Z",
                    },
                  ],
                  total: 1,
                } satisfies AuditEntryListResponse),
              );
            }
            return method === "GET" && path === "/api/ical"
              ? Promise.resolve(
                  Response.json({
                    configured: true,
                    token_preview: "f3a9",
                    created_at: null,
                    last_used_at: null,
                  } satisfies IcalFeedStatus),
                )
              : realFetch(input, init);
          };
        });
        await page.goto("/settings?section=account");
        await expect(page.locator("#account-display-name")).toBeEnabled({ timeout: 20000 });
        await expect(page.getByRole("heading", { name: "Danger zone" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "API tokens" })).toHaveCount(0);
        await expectNoAccessibilityViolations(page, `account page (${label})`);
        await capture("account");

        await openSection("connections", "Connections");
        await expect(page.getByRole("heading", { name: "Calendar subscription" })).toBeVisible();
        await expect(page.getByRole("heading", { name: /Legacy team files/ })).toBeVisible();
        await capture("connections");

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

        await expectNoAccessibilityViolations(page, `connections page (${label})`);

        await openSection("activity", "Recent activity");
        await expect(page.getByText("Created · Holiday (2 Nov 2026)")).toBeVisible();
        await expect(page.getByText("legacy-opaque-id")).toHaveCount(0);
        await capture("activity");

        await openSection("data", "Data");
        const exports = page.getByRole("region", { name: "Exports" });
        await expect(exports.getByText("Account data (JSON)")).toBeVisible();
        await expect(exports.getByText("Export Local Backup")).toBeVisible();
        await expect(exports.getByText("Time off (.hday)")).toBeVisible();
        await capture("data");
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
