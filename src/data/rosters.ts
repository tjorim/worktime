export type ScheduleOption = "9-5" | "2-shift" | "weekend-shift" | "5-shift";

export type ShiftDisplayOverride = {
  displayName?: string;
  displayHours?: string;
  displayCode?: string;
};

export type ShiftDisplayOverrides = {
  M?: ShiftDisplayOverride;
  L?: ShiftDisplayOverride;
  N?: ShiftDisplayOverride;
  D?: ShiftDisplayOverride;
  O?: ShiftDisplayOverride;
};

export type ShiftRosterConfig = {
  // Required fields for shift calculation
  teamCount: number;
  cycleLengthDays: number;
  shiftsPerDay: number;
  schedulePattern: SchedulePattern;
  referenceDate: string; // ISO date string (YYYY-MM-DD) for shift calculation anchor
  referenceTeam: number; // 1-based team number for reference point
  // Optional fields
  notes?: string; // Developer reference only - describes schedule characteristics, not displayed in UI
  shiftDisplayOverrides?: ShiftDisplayOverrides;
};

export type SchedulePattern = {
  days: Array<{
    dayIndex: number;
    shift: "M" | "L" | "N" | "D" | "O"; // M=morning/early, L=evening/late, N=night, D=day, O=off
  }>;
  extra?: {
    weekendAssignment?: string;
    jumpday?: string;
  };
};

export type ScheduleRoster = {
  value: ScheduleOption;
  title: string;
  description: string;
  showsTeamSelection: boolean;
  isAvailable: boolean; // Whether this schedule is available for selection
  shiftConfig: ShiftRosterConfig;
};

/**
 * Validates a schedule pattern configuration for internal consistency.
 * Throws an error if validation fails.
 */
function validateSchedulePattern(config: ShiftRosterConfig): void {
  const { schedulePattern, cycleLengthDays, teamCount, referenceDate, referenceTeam } = config;

  // Validation 1: Pattern length matches cycle length
  if (schedulePattern.days.length !== cycleLengthDays) {
    throw new Error(
      `Schedule pattern validation failed: ` +
        `Pattern has ${schedulePattern.days.length} days but cycleLengthDays is ${cycleLengthDays}`,
    );
  }

  // Validation 2: Day indices are sequential starting from 1
  const expectedIndices = Array.from({ length: cycleLengthDays }, (_, i) => i + 1);
  const actualIndices = schedulePattern.days.map((d) => d.dayIndex);
  const indicesMismatch = expectedIndices.some((expected, i) => expected !== actualIndices[i]);

  if (indicesMismatch) {
    throw new Error(
      `Schedule pattern validation failed: ` +
        `Day indices must be sequential from 1 to ${cycleLengthDays}. ` +
        `Got: [${actualIndices.join(", ")}]`,
    );
  }

  // Validation 3: Shift codes are valid
  const validShiftCodes = new Set(["M", "L", "N", "D", "O"]);
  const invalidShifts = schedulePattern.days.filter((d) => !validShiftCodes.has(d.shift));

  if (invalidShifts.length > 0) {
    throw new Error(
      `Schedule pattern validation failed: ` +
        `Invalid shift codes found: ${invalidShifts.map((d) => `${d.shift} at day ${d.dayIndex}`).join(", ")}. ` +
        `Valid codes: M, L, N, D, O`,
    );
  }

  // Validation 4: Reference date is valid ISO format and parseable
  const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDatePattern.test(referenceDate)) {
    throw new Error(
      `Schedule pattern validation failed: ` +
        `Reference date "${referenceDate}" is not in ISO format (YYYY-MM-DD)`,
    );
  }

  const refDate = new Date(referenceDate);
  if (Number.isNaN(refDate.getTime())) {
    throw new Error(
      `Schedule pattern validation failed: ` +
        `Reference date "${referenceDate}" is not a valid date`,
    );
  }

  // Validation 5: Reference team is within valid range
  if (referenceTeam < 1 || referenceTeam > teamCount) {
    throw new Error(
      `Schedule pattern validation failed: ` +
        `Reference team ${referenceTeam} is outside valid range (1-${teamCount})`,
    );
  }

  // Validation 6: Cycle length is reasonable (1-365 days)
  if (cycleLengthDays < 1 || cycleLengthDays > 365) {
    throw new Error(
      `Schedule pattern validation failed: ` +
        `Cycle length ${cycleLengthDays} is outside reasonable range (1-365 days)`,
    );
  }

  // Validation 7: Team count is positive
  if (teamCount < 1) {
    throw new Error(
      `Schedule pattern validation failed: ` + `Team count ${teamCount} must be at least 1`,
    );
  }

  // Validation 8: At least one working shift exists (not all off days)
  const hasWorkingShift = schedulePattern.days.some((d) => d.shift !== "O");
  if (!hasWorkingShift) {
    throw new Error(
      `Schedule pattern validation failed: ` +
        `Pattern must contain at least one working shift (all days are marked as "O" - off)`,
    );
  }
}

export const SCHEDULE_OPTIONS: ScheduleRoster[] = [
  {
    value: "9-5",
    title: "9-5",
    description: "Standard weekday schedule with weekends off.",
    showsTeamSelection: false,
    isAvailable: true,
    shiftConfig: {
      teamCount: 1,
      cycleLengthDays: 7,
      shiftsPerDay: 1,
      referenceDate: "2025-01-06", // Monday of week 1, 2025
      referenceTeam: 1, // Reference team is on day shift (Monday) on the reference date
      schedulePattern: {
        days: [
          { dayIndex: 1, shift: "D" }, // Monday
          { dayIndex: 2, shift: "D" }, // Tuesday
          { dayIndex: 3, shift: "D" }, // Wednesday
          { dayIndex: 4, shift: "D" }, // Thursday
          { dayIndex: 5, shift: "D" }, // Friday
          { dayIndex: 6, shift: "O" }, // Saturday
          { dayIndex: 7, shift: "O" }, // Sunday
        ],
      },
      notes: "Weekday-only coverage.",
      // 9-5 uses "Day" shift - no overrides needed
    },
  },
  {
    value: "2-shift",
    title: "2-shift",
    description: "Alternating early and late shifts each week.",
    showsTeamSelection: false,
    isAvailable: false, // Coming soon
    shiftConfig: {
      teamCount: 2,
      cycleLengthDays: 28,
      shiftsPerDay: 2,
      referenceDate: "2025-01-06", // Monday of week 1, 2025
      referenceTeam: 1, // Reference team is on early shift (week 1, day 1 of cycle) on the reference date
      schedulePattern: {
        days: [
          // Week 1: Early shift Mon-Fri, off weekend
          { dayIndex: 1, shift: "M" }, // Monday
          { dayIndex: 2, shift: "M" }, // Tuesday
          { dayIndex: 3, shift: "M" }, // Wednesday
          { dayIndex: 4, shift: "M" }, // Thursday
          { dayIndex: 5, shift: "M" }, // Friday
          { dayIndex: 6, shift: "O" }, // Saturday
          { dayIndex: 7, shift: "O" }, // Sunday
          // Week 2: Late shift Mon-Fri, off weekend
          { dayIndex: 8, shift: "L" }, // Monday
          { dayIndex: 9, shift: "L" }, // Tuesday
          { dayIndex: 10, shift: "L" }, // Wednesday
          { dayIndex: 11, shift: "L" }, // Thursday
          { dayIndex: 12, shift: "L" }, // Friday
          { dayIndex: 13, shift: "O" }, // Saturday
          { dayIndex: 14, shift: "O" }, // Sunday
          // Week 3: Early shift Mon-Fri, off weekend
          { dayIndex: 15, shift: "M" }, // Monday
          { dayIndex: 16, shift: "M" }, // Tuesday
          { dayIndex: 17, shift: "M" }, // Wednesday
          { dayIndex: 18, shift: "M" }, // Thursday
          { dayIndex: 19, shift: "M" }, // Friday
          { dayIndex: 20, shift: "O" }, // Saturday
          { dayIndex: 21, shift: "O" }, // Sunday
          // Week 4: Late shift Mon-Fri, off weekend
          { dayIndex: 22, shift: "L" }, // Monday
          { dayIndex: 23, shift: "L" }, // Tuesday
          { dayIndex: 24, shift: "L" }, // Wednesday
          { dayIndex: 25, shift: "L" }, // Thursday
          { dayIndex: 26, shift: "L" }, // Friday
          { dayIndex: 27, shift: "O" }, // Saturday
          { dayIndex: 28, shift: "O" }, // Sunday
        ],
        extra: {
          weekendAssignment: "One assigned weekend within the 4-week cycle.",
          jumpday: "Fixed jumpday within the cycle.",
        },
      },
      notes:
        "Early/late rotation by week in 4-week cycle. Each team has one assigned working weekend and individual jumpdays within the cycle (team-specific, not shown in base pattern).",
      shiftDisplayOverrides: {
        M: { displayName: "Early", displayCode: "E" },
      },
    },
  },
  {
    value: "weekend-shift",
    title: "Weekend shift",
    description: "Weekend-only teams rotating early one weekend, late the next.",
    showsTeamSelection: false,
    isAvailable: false, // Coming soon
    shiftConfig: {
      teamCount: 2,
      cycleLengthDays: 14,
      shiftsPerDay: 2,
      referenceDate: "2025-01-06", // Monday of week 1, 2025
      referenceTeam: 1, // Reference team is off (week 1, day 1 of cycle = Monday = off) on the reference date
      schedulePattern: {
        days: [
          // Week 1: Off Mon-Thu, Day Friday, Early Sat-Sun
          { dayIndex: 1, shift: "O" },
          { dayIndex: 2, shift: "O" },
          { dayIndex: 3, shift: "O" },
          { dayIndex: 4, shift: "O" },
          { dayIndex: 5, shift: "D" }, // Friday
          { dayIndex: 6, shift: "M" }, // Saturday
          { dayIndex: 7, shift: "M" }, // Sunday
          // Week 2: Off Mon-Thu, Day Friday, Late Sat-Sun
          { dayIndex: 8, shift: "O" },
          { dayIndex: 9, shift: "O" },
          { dayIndex: 10, shift: "O" },
          { dayIndex: 11, shift: "O" },
          { dayIndex: 12, shift: "D" }, // Friday
          { dayIndex: 13, shift: "L" }, // Saturday
          { dayIndex: 14, shift: "L" }, // Sunday
        ],
      },
      notes: "Weekend-only coverage with early/late rotation.",
      shiftDisplayOverrides: {
        M: { displayName: "Early", displayCode: "E", displayHours: "06:00-14:30" },
        L: { displayHours: "13:30-22:00" },
        D: { displayHours: "08:00-16:30" },
      },
    },
  },
  {
    value: "5-shift",
    title: "5-shift",
    description: "Continuous rotating shifts across multiple teams.",
    showsTeamSelection: true,
    isAvailable: true,
    shiftConfig: {
      teamCount: 5,
      cycleLengthDays: 10,
      shiftsPerDay: 3,
      referenceDate: "2025-07-16", // Wednesday, reference date from CONFIG
      referenceTeam: 1, // Reference team is on morning shift (day 1 of cycle) on the reference date
      schedulePattern: {
        days: [
          { dayIndex: 1, shift: "M" },
          { dayIndex: 2, shift: "M" },
          { dayIndex: 3, shift: "L" },
          { dayIndex: 4, shift: "L" },
          { dayIndex: 5, shift: "N" },
          { dayIndex: 6, shift: "N" },
          { dayIndex: 7, shift: "O" },
          { dayIndex: 8, shift: "O" },
          { dayIndex: 9, shift: "O" },
          { dayIndex: 10, shift: "O" },
        ],
      },
      notes: "Continuous multi-team rotation.",
      shiftDisplayOverrides: {
        L: { displayName: "Evening", displayCode: "E" },
      },
    },
  },
];

// Validate all schedule configurations at module load time
SCHEDULE_OPTIONS.forEach((option) => {
  validateSchedulePattern(option.shiftConfig);
});
