import { SCHEDULE_OPTIONS, type ScheduleOption } from "../src/data/rosters.ts";
import { dayjs } from "../src/utils/dateTimeUtils.ts";
import { getShiftCode } from "../src/utils/shiftCalculations.ts";

// How many full cycles (plus a few days of padding on each side, to cover
// cycle-boundary transitions) to sample shift codes for. Backend teams/dates
// are cheap to check, so this stays generous without ballooning the fixture.
const SAMPLE_CYCLES = 2;
const PADDING_DAYS = 3;

export type RosterFixtureScheduleConfig = {
  teamCount: number;
  cycleLengthDays: number;
  referenceDate: string;
  schedulePattern: string[];
  shiftTimes: Record<
    string,
    { name: string; start: number | null; end: number | null; displayCode: string }
  >;
};

export type RosterFixtureShiftCode = {
  schedule: ScheduleOption;
  team: number;
  date: string;
  code: string;
};

export type RosterFixture = {
  schedules: Record<ScheduleOption, RosterFixtureScheduleConfig>;
  shiftCodes: RosterFixtureShiftCode[];
};

// Path is relative to the frontend/ package root (process.cwd() for the
// scripts that consume this), matching how the other scripts resolve paths
// like "../VERSION" and "../CHANGELOG.md".
export const ROSTER_FIXTURE_RELATIVE_PATH = "../backend/tests/fixtures/roster_golden.json";

/**
 * Build the golden roster fixture consumed by the backend's
 * test_roster_golden_fixture.py, from the frontend's source-of-truth
 * roster config (rosters.ts) and shift-code algorithm (getShiftCode).
 *
 * Keeping this a shared builder (rather than duplicating it in both the
 * generate and check scripts) means the two can never drift from each other.
 */
export function buildRosterFixture(): RosterFixture {
  const schedules = {} as Record<ScheduleOption, RosterFixtureScheduleConfig>;
  const shiftCodes: RosterFixtureShiftCode[] = [];

  for (const option of SCHEDULE_OPTIONS) {
    const { shiftConfig } = option;

    schedules[option.value] = {
      teamCount: shiftConfig.teamCount,
      cycleLengthDays: shiftConfig.cycleLengthDays,
      referenceDate: shiftConfig.referenceDate,
      schedulePattern: [...shiftConfig.schedulePattern],
      shiftTimes: Object.fromEntries(
        Object.entries(shiftConfig.shiftTimes)
          .filter((entry): entry is [string, NonNullable<(typeof entry)[1]>] => entry[1] != null)
          .map(([code, definition]) => [
            code,
            {
              name: definition.name,
              start: definition.start,
              end: definition.end,
              displayCode: definition.displayCode,
            },
          ]),
      ),
    };

    const referenceDate = dayjs(shiftConfig.referenceDate, "YYYY-MM-DD", true);
    // Include a full cycle before the reference date so negative cycle offsets
    // (whose remainder semantics differ between JavaScript and Python) are covered.
    const rangeStart = referenceDate
      .subtract(shiftConfig.cycleLengthDays, "day")
      .subtract(PADDING_DAYS, "day");
    const totalDays =
      shiftConfig.cycleLengthDays * (SAMPLE_CYCLES + 1) + PADDING_DAYS * 2;

    for (let team = 1; team <= shiftConfig.teamCount; team++) {
      for (let offset = 0; offset < totalDays; offset++) {
        const date = rangeStart.add(offset, "day");
        shiftCodes.push({
          schedule: option.value,
          team,
          date: date.format("YYYY-MM-DD"),
          code: getShiftCode(date, team, option.value),
        });
      }
    }
  }

  return { schedules, shiftCodes };
}
