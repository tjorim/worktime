import { expect, test } from "@playwright/test";

// Verify the real cascade and keyboard behavior without an account or helper process.
test.use({ serviceWorkers: "block" });
const events = [
  { type: "range", start: "2026/09/14", end: "2026/09/15", flags: [], title: "Annual leave" },
  { type: "range", start: "2026/09/16", end: "2026/09/16", flags: ["half_pm"], title: "Dentist" },
  { type: "range", start: "2026/09/17", end: "2026/09/17", flags: [], title: "Holiday" },
  {
    type: "range",
    start: "2026/09/17",
    end: "2026/09/17",
    flags: ["business"],
    title: "Client visit",
  },
];
const member = {
  username: "alice",
  display_name: "Alice Van den Berg",
  raw: "",
  events,
  etag: "demo",
};

for (const theme of ["light", "dark"] as const) {
  for (const width of [1280, 390]) {
    test(`Team grid layout and hover/focus details (${theme}, ${width}px)`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.clock.install({ time: new Date("2026-09-15T12:00:00Z") });
      await page.addInitScript((theme) => {
        localStorage.setItem(
          "worktime_user_state",
          JSON.stringify({
            hasCompletedOnboarding: true,
            settings: { enableTimeOff: true, theme },
            lastUsed: { activeTab: "timeoff", timeOffView: "team" },
            accountSyncAnnouncementSeen: false,
            ganttAnnouncementSeen: false,
            crossBorderAnnouncementSeen: false,
          }),
        );
        localStorage.setItem(
          "worktime_device_preferences",
          JSON.stringify({
            hdayHelper: { url: "http://helper.test" },
            lastHdayTeamId: "demo",
          }),
        );
      }, theme);
      await page.route("http://helper.test/**", (route) =>
        route.fulfill({
          contentType: "application/json",
          headers: { "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify(
            route.request().url().includes("/team/")
              ? {
                  team_id: "demo",
                  name: "Demo team",
                  sections: [
                    {
                      title: "Engineering",
                      members: [
                        member,
                        {
                          ...member,
                          username: "ben",
                          display_name: "Benjamin De Smet",
                          events: [],
                        },
                      ],
                    },
                    {
                      title: "Operations",
                      members: [
                        {
                          ...member,
                          username: "charlotte",
                          display_name: "Charlotte Janssens",
                          events: [],
                        },
                      ],
                    },
                  ],
                  members: [
                    member,
                    { ...member, username: "ben", display_name: "Benjamin De Smet", events: [] },
                    {
                      ...member,
                      username: "charlotte",
                      display_name: "Charlotte Janssens",
                      events: [],
                    },
                  ],
                }
              : { status: "ok" },
          ),
        }),
      );
      await page.goto("/");
      const grid = page.locator("[data-team-grid]");
      await expect(grid).toBeVisible();
      const name = grid.locator("[data-team-name]").first();
      await expect(name).toHaveCSS("width", width === 390 ? "120px" : "180px");
      await expect(name).toHaveCSS("position", "sticky");
      const row = grid.locator("[data-team-member]").first();
      const today = row.locator('[data-date="2026-09-15"]');
      await expect(today).toHaveCSS(
        "background-color",
        theme === "light" ? "rgb(236, 0, 0)" : "rgb(198, 40, 40)",
      );
      const half = row.locator('[data-date="2026-09-16"]');
      await expect(half).toHaveCSS("font-size", "10px");
      await expect(half).toHaveCSS("text-align", "right");
      await expect(half).toHaveCSS("background-image", /linear-gradient\(to left/);
      await expect(grid.locator('[data-date="2026-09-17"] [data-team-event-segment]')).toHaveCount(
        2,
      );
      const stickyLeft = await name.evaluate((cell) => cell.getBoundingClientRect().left);
      const scrollLeft = await grid.locator("..").evaluate((element) => element.scrollLeft);
      await grid.locator("..").evaluate((element) => {
        element.scrollLeft += 100;
      });
      expect(await name.evaluate((cell) => cell.getBoundingClientRect().left)).toBeCloseTo(
        stickyLeft,
        0,
      );
      await grid.locator("..").evaluate((element, scrollLeft) => {
        element.scrollLeft = scrollLeft;
      }, scrollLeft);
      await grid.scrollIntoViewIfNeeded();
      const gridScreenshot = testInfo.outputPath("grid.png");
      await page.screenshot({ path: gridScreenshot });
      await testInfo.attach("grid", { path: gridScreenshot, contentType: "image/png" });
      await today.hover();
      await expect(page.getByRole("tooltip")).toContainText("Annual leave");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("tooltip")).toHaveCount(0);
      await page.mouse.move(0, 0);
      await today.focus();
      await expect(page.getByRole("tooltip")).toContainText("Annual leave");
      await expect(today).toBeFocused();
      const detailsScreenshot = testInfo.outputPath("details.png");
      await page.screenshot({ path: detailsScreenshot });
      await testInfo.attach("details", { path: detailsScreenshot, contentType: "image/png" });
      await page.keyboard.press("Tab");
      await expect(half).toBeFocused();
      await expect(page.getByRole("tooltip")).toContainText("Dentist");
      await page.keyboard.press("Escape");
      await half.click();
      await expect(page.getByRole("tooltip")).toContainText("Dentist");
    });
  }
}
