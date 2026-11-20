import { routeJson } from "@/mocks/response";
import type { PublicHoliday, SchoolHoliday, LongWeekend } from "@/api-types";
import type { BrowserContext } from "@playwright/test";
import {
  seedPublicHolidays,
  seedLongWeekends,
  seedSchoolHolidays,
  seedPaydates,
} from "@/mocks/data/holidayStore";

// Specs using the production PWA worker or blocking service workers cannot use MSW.
// Intercept only holiday reads in Playwright; navigation and asset requests still
// exercise the production service worker and the real offline/cache behaviour.
export async function mockHolidays(context: BrowserContext) {
  const responses: {
    public: PublicHoliday[];
    longweekend: LongWeekend[];
    school: SchoolHoliday[];
    paydates: string[];
  } = {
    public: seedPublicHolidays,
    longweekend: seedLongWeekends,
    school: seedSchoolHolidays,
    paydates: seedPaydates,
  };
  await context.route("**/api/holidays/**", async (route) => {
    const endpoint = new URL(route.request().url()).pathname.split("/").pop()!;
    if (route.request().method() !== "GET" || !(endpoint in responses)) {
      await route.fallback();
      return;
    }
    await route.fulfill(
      routeJson<(typeof responses)[keyof typeof responses]>(
        responses[endpoint as keyof typeof responses],
      ),
    );
  });
}
