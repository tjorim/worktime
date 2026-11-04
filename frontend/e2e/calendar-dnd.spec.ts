import { expect, test } from "@playwright/test";
import type { WorktimeTestHooks } from "./testHooks";
import { USER_STATE_STORAGE_KEY } from "@/constants/storageKeys";

test("Unified Calendar persists a task dragged to another day and time", async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 4, 12));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.addInitScript(
    ({ key }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          hasCompletedOnboarding: true,
          scheduleType: "9-5",
          settings: { enableTimeTracking: true, enableUnifiedCalendar: true, timeFormat: "24h" },
          lastUsed: { activeTab: "unified-calendar" },
        }),
      );
    },
    { key: USER_STATE_STORAGE_KEY },
  );
  await page.goto("/");
  const calendar = page.locator('[data-slot="unified-calendar"]');
  await expect(calendar).toBeVisible({ timeout: 15_000 });
  await page.evaluate(async () => {
    const { tasksCollection } = (window as unknown as { __worktimeTest: WorktimeTestHooks })
      .__worktimeTest;
    tasksCollection.insert({
      id: "calendar-dnd-793",
      text: "Drag regression",
      label: "work",
      startTime: "2026-11-04T09:00",
      stopTime: "2026-11-04T10:00",
      includesBreak: false,
    });
  });
  await calendar.locator(".sx__view-selection-selected-item").click();
  await calendar.getByText("Week", { exact: true }).click();
  const event = calendar.locator(".sx__time-grid-event").filter({ hasText: "Drag regression" });
  await expect(event).toBeVisible();
  await event.scrollIntoViewIfNeeded();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const box = await event.boundingBox();
  if (!box) throw new Error("Event has no bounding box");
  const day = await calendar.locator(".sx__time-grid-day").first().boundingBox();
  if (!day) throw new Error("Day has no bounding box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // Schedule-X starts dragging after a 150 ms long press. Wait for its copy.
  await expect(calendar.locator(".is-event-copy")).toBeVisible();
  await page.mouse.move(box.x + box.width / 2 + day.width, box.y + box.height / 2 + box.height, {
    steps: 15,
  });
  await page.mouse.up();
  expect(errors).toEqual([]);
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const { tasksCollection } = (window as unknown as { __worktimeTest: WorktimeTestHooks })
          .__worktimeTest;
        const task = tasksCollection.toArray.find(
          (item: { id: string }) => item.id === "calendar-dnd-793",
        );
        return [task?.startTime, task?.stopTime];
      }),
    )
    .toEqual(["2026-11-05T10:00", "2026-11-05T11:00"]);
  await expect(event).toContainText("10:00–11:00");
});
