import {
  emptyPullResponse,
  emptyPushResponse,
  emptyStatus,
  populatedStatus,
} from "@/mocks/data/syncStore";
import {
  seedLongWeekends,
  seedPaydates,
  seedPublicHolidays,
  seedSchoolHolidays,
} from "@/mocks/data/holidayStore";
import type { MockScenarioFixture, MockScenarioId, TeamShiftStatusReadModel } from "./types";

const AS_OF = "2026-05-18T06:00:00.000Z";
const CREATED_AT = "2026-01-01T00:00:00.000Z";

function createShift(
  team_number: number,
  shift_code: string,
  name: string,
  start_hour: number | null,
  end_hour: number | null,
  is_currently_working: boolean,
): TeamShiftStatusReadModel {
  return {
    team_number,
    date: "2026-05-18",
    shift_day: "2026-05-18",
    shift_code,
    shift: {
      code: shift_code,
      display_code: shift_code,
      name,
      start_hour,
      end_hour,
      is_working: start_hour !== null,
    },
    is_currently_working,
  };
}

function createBaseFixture(id: MockScenarioId): MockScenarioFixture {
  return {
    id,
    auth: {
      state: "valid_session",
      profile: {
        id: 1,
        username: "dev-user",
        display_name: "Dev User",
        is_admin: false,
        capabilities: { backup_enabled: true },
      },
    },
    sync: {
      state: "clean",
      status: structuredClone(emptyStatus),
      pullData: structuredClone(emptyPullResponse),
      pushResponse: structuredClone(emptyPushResponse),
      statusError: null,
      pullError: null,
      pushError: null,
    },
    readModels: {
      currentStatus: {
        as_of: AS_OF,
        current_shift: createShift(1, "D", "Day Shift", 6, 14, true),
        currently_working_team: createShift(1, "D", "Day Shift", 6, 14, true),
        off_day_progress: null,
      },
      teamStatus: {
        as_of: AS_OF,
        items: [
          createShift(1, "D", "Day Shift", 6, 14, true),
          createShift(2, "N", "Night Shift", 22, 6, false),
          createShift(3, "O", "Off", null, null, false),
          createShift(4, "H", "Handover", 14, 22, false),
        ],
      },
      timeOffSummary: {
        as_of: AS_OF,
        active_items: [],
        upcoming_items: [],
        total_upcoming: 0,
      },
      statusCode: 200,
    },
    timeTracking: {
      state: "active",
      active_entry_id: "task-001",
      seconds_elapsed: 5400,
      validation_errors: [],
    },
    timeOffRequests: {
      statusCode: 200,
      requests: [
        {
          id: "req-pending",
          status: "pending",
          starts_on: "2026-06-10",
          ends_on: "2026-06-12",
          note: "Summer trip",
          overlap_with: [],
          quota_days_remaining: 8,
        },
      ],
    },
    holidays: {
      public: structuredClone(seedPublicHolidays),
      longweekend: structuredClone(seedLongWeekends),
      school: structuredClone(seedSchoolHolidays),
      paydates: structuredClone(seedPaydates),
    },
    workLocations: {
      statusCode: 200,
      items: [
        {
          id: 1001,
          user_id: 1,
          date: "2026-05-18",
          country_code: "NL",
          label: "Home",
          created_at: CREATED_AT,
        },
      ],
    },
  };
}

function withFixture(
  id: MockScenarioId,
  patch: (fixture: MockScenarioFixture) => MockScenarioFixture,
): MockScenarioFixture {
  return patch(createBaseFixture(id));
}

export const DEFAULT_MOCK_SCENARIO_ID: MockScenarioId = "demo-default";

export const mockScenarioFixtures: Record<MockScenarioId, MockScenarioFixture> = {
  "demo-default": createBaseFixture("demo-default"),
  "current-shift-day": createBaseFixture("current-shift-day"),
  "current-shift-night": withFixture("current-shift-night", (fixture) => ({
    ...fixture,
    readModels: {
      ...fixture.readModels,
      currentStatus: {
        ...fixture.readModels.currentStatus,
        current_shift: createShift(2, "N", "Night Shift", 22, 6, true),
        currently_working_team: createShift(2, "N", "Night Shift", 22, 6, true),
      },
    },
  })),
  "current-shift-off": withFixture("current-shift-off", (fixture) => ({
    ...fixture,
    readModels: {
      ...fixture.readModels,
      currentStatus: {
        ...fixture.readModels.currentStatus,
        current_shift: createShift(3, "O", "Off", null, null, false),
        currently_working_team: null,
        off_day_progress: { current: 2, total: 3 },
      },
    },
  })),
  "current-shift-handover": withFixture("current-shift-handover", (fixture) => ({
    ...fixture,
    readModels: {
      ...fixture.readModels,
      currentStatus: {
        ...fixture.readModels.currentStatus,
        current_shift: createShift(4, "H", "Handover", 14, 22, true),
        currently_working_team: createShift(4, "H", "Handover", 14, 22, true),
      },
    },
  })),
  "time-tracking-active": createBaseFixture("time-tracking-active"),
  "time-tracking-paused": withFixture("time-tracking-paused", (fixture) => ({
    ...fixture,
    timeTracking: { ...fixture.timeTracking, state: "paused", active_entry_id: null },
  })),
  "time-tracking-completed": withFixture("time-tracking-completed", (fixture) => ({
    ...fixture,
    timeTracking: { ...fixture.timeTracking, state: "completed", active_entry_id: null },
  })),
  "time-tracking-correction-needed": withFixture("time-tracking-correction-needed", (fixture) => ({
    ...fixture,
    timeTracking: {
      ...fixture.timeTracking,
      state: "correction_needed",
      validation_errors: ["Tracked time is shorter than required shift target."],
    },
  })),
  "time-tracking-validation-failure": withFixture("time-tracking-validation-failure", (fixture) => ({
    ...fixture,
    timeTracking: {
      ...fixture.timeTracking,
      state: "validation_failure",
      validation_errors: ["start_time must be before end_time"],
    },
  })),
  "time-off-pending": createBaseFixture("time-off-pending"),
  "time-off-approved": withFixture("time-off-approved", (fixture) => ({
    ...fixture,
    timeOffRequests: {
      ...fixture.timeOffRequests,
      requests: fixture.timeOffRequests.requests.map((request) => ({ ...request, status: "approved" })),
    },
  })),
  "time-off-rejected": withFixture("time-off-rejected", (fixture) => ({
    ...fixture,
    timeOffRequests: {
      ...fixture.timeOffRequests,
      requests: fixture.timeOffRequests.requests.map((request) => ({ ...request, status: "rejected" })),
    },
  })),
  "time-off-overlap": withFixture("time-off-overlap", (fixture) => ({
    ...fixture,
    timeOffRequests: {
      ...fixture.timeOffRequests,
      requests: [
        ...fixture.timeOffRequests.requests,
        {
          id: "req-overlap",
          status: "pending",
          starts_on: "2026-06-11",
          ends_on: "2026-06-14",
          note: "Overlapping request",
          overlap_with: ["req-pending"],
          quota_days_remaining: 3,
        },
      ],
    },
  })),
  "time-off-quota-edge": withFixture("time-off-quota-edge", (fixture) => ({
    ...fixture,
    timeOffRequests: {
      ...fixture.timeOffRequests,
      requests: fixture.timeOffRequests.requests.map((request) => ({
        ...request,
        quota_days_remaining: 0,
      })),
    },
  })),
  "sync-clean": createBaseFixture("sync-clean"),
  "sync-pending-local": withFixture("sync-pending-local", (fixture) => ({
    ...fixture,
    sync: {
      ...fixture.sync,
      state: "pending_local_changes",
      status: { ...structuredClone(populatedStatus), tasks_updated_at: "2026-05-18T05:00:00.000Z" },
    },
  })),
  "sync-conflict": withFixture("sync-conflict", (fixture) => ({
    ...fixture,
    sync: {
      ...fixture.sync,
      state: "conflict",
      pushResponse: {
        results: {
          tasks: [
            {
              id: "task-001",
              status: "conflict",
              conflict_reason: "server is newer",
              server_updated_at: "2026-05-18T06:00:00.000Z",
            },
          ],
        },
      },
    },
  })),
  "sync-retryable-failure": withFixture("sync-retryable-failure", (fixture) => ({
    ...fixture,
    sync: { ...fixture.sync, state: "retryable_failure", pushError: 503 },
  })),
  "sync-offline": withFixture("sync-offline", (fixture) => ({
    ...fixture,
    sync: { ...fixture.sync, state: "offline", statusError: 503, pullError: 503, pushError: 503 },
  })),
  "work-location-actions": withFixture("work-location-actions", (fixture) => ({
    ...fixture,
    workLocations: {
      ...fixture.workLocations,
      items: [
        ...fixture.workLocations.items,
        {
          id: 1002,
          user_id: 1,
          date: "2026-05-19",
          country_code: "BE",
          label: "Office",
          created_at: CREATED_AT,
        },
      ],
    },
  })),
  "auth-signed-out": withFixture("auth-signed-out", (fixture) => ({
    ...fixture,
    auth: { ...fixture.auth, state: "signed_out" },
  })),
  "auth-expired": withFixture("auth-expired", (fixture) => ({
    ...fixture,
    auth: { ...fixture.auth, state: "expired_session" },
  })),
  "auth-forbidden": withFixture("auth-forbidden", (fixture) => ({
    ...fixture,
    auth: { ...fixture.auth, state: "forbidden" },
  })),
  "server-error": withFixture("server-error", (fixture) => ({
    ...fixture,
    sync: { ...fixture.sync, statusError: 500, pullError: 500, pushError: 500 },
    readModels: { ...fixture.readModels, statusCode: 500 },
    timeOffRequests: { ...fixture.timeOffRequests, statusCode: 500 },
    workLocations: { ...fixture.workLocations, statusCode: 500 },
  })),
};
