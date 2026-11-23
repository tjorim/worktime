import { expect, test } from "@playwright/test";
import type {
  AccountProfile,
  AuditEntryListResponse,
  UserListResponse,
  UserRead,
} from "@/api-types";
import { routeJson, uncheckedBody } from "@/mocks/response";
import { mockAccount } from "./mockAccount";

test.use({ serviceWorkers: "block" });

for (const theme of ["light", "dark"]) {
  for (const width of [1366, 390]) {
    test(`username management (${theme}, ${width}px)`, async ({ page, context }, testInfo) => {
      const timestamp = "2026-11-23T09:00:00Z";
      let member: UserRead = {
        id: 2,
        username: "member",
        display_name: "Mia Member",
        settings: {},
        created_at: timestamp,
        updated_at: timestamp,
      };
      const admin: UserRead = {
        ...member,
        id: 1,
        username: "admin-user",
        display_name: "Alex Admin",
      };
      let isAdmin = false;
      await mockAccount(context);
      await page.route("**/api/me", async (route) => {
        const { id, username, display_name } = isAdmin ? admin : member;
        await route.fulfill(
          routeJson<AccountProfile>({
            id,
            username,
            display_name,
            is_admin: isAdmin,
            capabilities: { backup_enabled: false },
          }),
        );
      });
      await page.route("**/api/users?*", (route) =>
        route.fulfill(routeJson<UserListResponse>({ items: [admin, member], total: 2 })),
      );
      await page.route("**/api/users/2", async (route) => {
        expect(route.request().method()).toBe("PATCH");
        const body = route.request().postDataJSON();
        if (body.username === "admin-user") {
          const failure = {
            status: 409,
            json: uncheckedBody("error", { code: "username_taken", detail: "Private diagnostic" }),
          };
          await route.fulfill(failure);
          return;
        }
        expect(body).toEqual({ username: "renamed-member" });
        member = { ...member, username: body.username };
        await route.fulfill(routeJson<UserRead>(member));
      });
      await page.route("**/api/audit?*", (route) =>
        route.fulfill(
          routeJson<AuditEntryListResponse>({
            items:
              member.username === "member"
                ? []
                : [
                    {
                      id: 1,
                      actor_user_id: admin.id,
                      actor_label: `user:${admin.id}`,
                      subject: "admin-subject",
                      auth_source: "oidc",
                      request_id: null,
                      action: "rename_user",
                      resource_type: "user",
                      resource_id: String(member.id),
                      details: { old_username: "member", new_username: member.username },
                      created_at: timestamp,
                    },
                  ],
            total: member.username === "member" ? 0 : 1,
          }),
        ),
      );

      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((theme) => {
        const subject = "username-management-e2e";
        localStorage.setItem(
          "oidc.user:http://localhost:9000/application/o/worktime:worktime",
          JSON.stringify({
            access_token: "mock-access-token",
            token_type: "Bearer",
            expires_at: Math.floor(Date.now() / 1000) + 86400,
            profile: { sub: subject, name: "Test User" },
          }),
        );
        localStorage.setItem("worktime_user_state_owner", subject);
        localStorage.setItem(
          "worktime_user_state",
          JSON.stringify({
            hasCompletedOnboarding: true,
            ganttAnnouncementSeen: false,
            crossBorderAnnouncementSeen: false,
            accountSyncAnnouncementSeen: true,
          }),
        );
        localStorage.setItem("worktime_device_preferences", JSON.stringify({ theme }));
      }, theme);

      async function capture(state: string) {
        const path = testInfo.outputPath(`${state}-${theme}-${width}.png`);
        await page.screenshot({ path, animations: "disabled" });
        await testInfo.attach(`${state}-${theme}-${width}`, { path, contentType: "image/png" });
      }

      await page.goto("/settings?section=account");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const displayName = page.locator("#account-display-name");
      await expect(displayName).toHaveValue("Mia Member");
      await expect(page.getByRole("textbox", { name: "Username" })).toHaveCount(0);
      await expect(page.getByText(/^Username: member$/)).toBeVisible();
      await displayName.scrollIntoViewIfNeeded();
      await capture("member-account");

      isAdmin = true;
      await page.goto("/settings?section=admin");
      const rename = page.getByRole("button", { name: "Rename member", exact: true });
      await expect(rename).toBeEnabled();
      await rename.scrollIntoViewIfNeeded();
      await capture("admin-users");
      await rename.click();

      const dialog = page.getByRole("dialog");
      const username = dialog.getByRole("textbox", { name: "Username" });
      await expect(username).toHaveValue("member");
      await capture("admin-rename");
      await username.fill("admin-user");
      await dialog.getByRole("button", { name: "Save" }).click();
      await expect(dialog.getByRole("alert")).toHaveText("This username is already in use.");
      await expect(dialog.getByText("Private diagnostic")).toHaveCount(0);
      await capture("admin-rename-error");

      await username.fill("renamed-member");
      await dialog.getByRole("button", { name: "Save" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Rename renamed-member", exact: true }),
      ).toBeVisible();
      const activity = page.getByText("Username changed · member → renamed-member");
      await expect(activity).toBeVisible();
      await activity.scrollIntoViewIfNeeded();
      await capture("admin-rename-activity");
    });
  }
}
