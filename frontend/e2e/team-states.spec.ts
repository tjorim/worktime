import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

// The Team view's feedback states, driven by a stubbed .hday helper.
for (const theme of ["light", "dark"]) {
  for (const width of [1280, 390]) {
    test(`Team feedback states (${theme}, ${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((theme) => {
        localStorage.setItem(
          "worktime_user_state",
          JSON.stringify({
            hasCompletedOnboarding: true,
            settings: { enableTimeOff: true, theme },
            lastUsed: { activeTab: "timeoff", timeOffView: "team" },
          }),
        );
        localStorage.setItem(
          "worktime_device_preferences",
          JSON.stringify({
            hdayHelper: { url: "http://helper.test" },
            lastHdayTeamId: "demo",
            recentHdayTeamIds: ["demo", "engineering"],
          }),
        );
      }, theme);
      let state = "empty";
      const requestedTeamIds: string[] = [];
      await page.route("http://helper.test/**", async (route) => {
        if (!route.request().url().includes("/team/")) {
          await route.fulfill({ json: { status: "ok" } });
        } else if (state === "network") {
          await route.abort("connectionrefused");
        } else if (state === "404" || state === "500") {
          requestedTeamIds.push(route.request().url().split("/team/")[1]?.split("/")[0] ?? "");
          await route.fulfill({ status: Number(state), json: { detail: "private share path" } });
        } else {
          const teamId = route.request().url().split("/team/")[1]?.split("/")[0] ?? "demo";
          requestedTeamIds.push(teamId);
          const members =
            state === "success"
              ? [
                  {
                    username: "alice",
                    display_name: "Alice Van den Berg",
                    raw: "",
                    events: [],
                    etag: null,
                  },
                ]
              : [];
          await route.fulfill({
            json: {
              team_id: teamId,
              name: `Team ${teamId}`,
              sections: [{ title: null, members }],
              members,
            },
          });
        }
      });
      for (const next of ["empty", "404", "500", "network", "success"]) {
        state = next;
        await page.goto("/");
        const view = page.locator('[data-slot="team-schedule-view"]');
        await expect(view).toBeVisible();
        if (state === "empty") {
          await expect(view.getByText("This team has no members")).toBeVisible();
          await expect(view.locator("[data-team-grid]")).toHaveCount(0);
        } else if (state === "404") {
          await expect(view.getByText(/Team "demo" was not found/)).toBeVisible();
        } else if (state === "500") {
          await expect(
            view.getByText(/The \.hday helper could not read the team data/),
          ).toBeVisible();
        } else if (state === "network") {
          await expect(view.getByRole("link", { name: "Open helper settings" })).toHaveAttribute(
            "href",
            "/settings?section=scheduleTeam",
          );
        } else {
          await expect(view.locator("[data-team-grid]")).toBeVisible();
          await expect(view.getByText("Recent teams")).toBeVisible();
          // A recent-team shortcut must request and show that exact team.
          requestedTeamIds.length = 0;
          await view.getByRole("button", { name: "engineering", exact: true }).click();
          await expect.poll(() => requestedTeamIds).toContain("engineering");
          await expect(view.getByRole("textbox", { name: "Team ID" })).toHaveValue("engineering");
          await expect(view.getByText("Team engineering")).toBeVisible();
        }
        // The helper's own error text must never reach the interface.
        await expect(view).not.toContainText("private share path");
      }
    });
  }
}
