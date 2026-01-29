export type ScheduleOption = "9-5" | "2-shift" | "weekend-shift" | "5-shift";

export type ShiftCode = "M" | "L" | "N" | "D" | "O";
export const SHIFT_CODES = ["M", "L", "N", "D", "O"] as const;

export type ShiftTimeDefinition = {
  name: string;
  start: number | null;
  end: number | null;
  displayCode: string;
};

const OFF_SHIFT_TIME: ShiftTimeDefinition = Object.freeze({
  name: "Off",
  start: null,
  end: null,
  displayCode: "O",
});

export type ShiftRosterConfig = {
  // Required fields for shift calculation
  teamCount: number;
  cycleLengthDays: number;
  shiftsPerDay: number;
  shiftTimes: Partial<Record<ShiftCode, ShiftTimeDefinition>>;
  schedulePattern: ShiftCode[]; // M=morning/early, L=evening/late, N=night, D=day, O=off
  referenceDate: string; // ISO date string (YYYY-MM-DD) for shift calculation anchor
  referenceTeam: number; // 1-based team number for reference point
  // Optional fields
  notes?: string; // Developer reference only - describes schedule characteristics, not displayed in UI
};

export type ScheduleRoster = {
  value: ScheduleOption;
  title: string;
  description: string;
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
  if (schedulePattern.length !== cycleLengthDays) {
    throw new Error(
      `Schedule pattern validation failed: ` +
        `Pattern has ${schedulePattern.length} days but cycleLengthDays is ${cycleLengthDays}`,
    );
  }

  // Validation 2: Shift codes are valid and defined in shiftTimes
  const invalidShifts = schedulePattern.filter((shift) => !config.shiftTimes[shift]);

  if (invalidShifts.length > 0) {
    throw new Error(
      `Schedule pattern validation failed: ` +
        `Invalid shift codes found: ${invalidShifts.join(", ")}. ` +
        `Valid codes must be defined in shiftTimes.`,
    );
  }

  if (!config.shiftTimes.O) {
    throw new Error(
      `Schedule pattern validation failed: shiftTimes must define an "O" off-day shift`,
    );
  }

  // Validation 3: Reference date is valid ISO format and parseable
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

  // Validation 4: Reference team is within valid range
  if (referenceTeam < 1 || referenceTeam > teamCount) {
    throw new Error(
      `Schedule pattern validation failed: ` +
        `Reference team ${referenceTeam} is outside valid range (1-${teamCount})`,
    );
  }

  // Validation 5: Cycle length is reasonable (1-365 days)
  if (cycleLengthDays < 1 || cycleLengthDays > 365) {
    throw new Error(
      `Schedule pattern validation failed: ` +
        `Cycle length ${cycleLengthDays} is outside reasonable range (1-365 days)`,
    );
  }

  // Validation 6: Team count is positive
  if (teamCount < 1) {
    throw new Error(
      `Schedule pattern validation failed: ` + `Team count ${teamCount} must be at least 1`,
    );
  }

  // Validation 7: At least one working shift exists (not all off days)
  const hasWorkingShift = schedulePattern.some((shift) => shift !== "O");
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
    isAvailable: true,
    shiftConfig: {
      teamCount: 1,
      cycleLengthDays: 7,
      shiftsPerDay: 1,
      shiftTimes: {
        D: {
          name: "Day",
          start: 9,
          end: 17,
          displayCode: "D",
        },
        O: OFF_SHIFT_TIME,
      },
      referenceDate: "2025-01-06", // Monday of week 1, 2025
      referenceTeam: 1, // Reference team is on day shift (Monday) on the reference date
      schedulePattern: [
        "D", // Monday
        "D", // Tuesday
        "D", // Wednesday
        "D", // Thursday
        "D", // Friday
        "O", // Saturday
        "O", // Sunday
      ],
      notes: "Weekday-only coverage.",
      // 9-5 uses "Day" shift - no overrides needed
    },
  },
  {
    value: "2-shift",
    title: "2-shift",
    description: "Alternating early and late shifts each week.",
    isAvailable: false, // Coming soon
    shiftConfig: {
      teamCount: 2,
      cycleLengthDays: 28,
      shiftsPerDay: 2,
      shiftTimes: {
        M: {
          name: "Early",
          start: 6.5,
          end: 15.5,
          displayCode: "E",
        },
        L: {
          name: "Late",
          start: 15,
          end: 24,
          displayCode: "L",
        },
        D: {
          name: "Day",
          start: 7,
          end: 16,
          displayCode: "D",
        },
        O: OFF_SHIFT_TIME,
      },
      referenceDate: "2025-01-06", // Monday of week 1, 2025
      referenceTeam: 1, // Reference team is on early shift (week 1, day 1 of cycle) on the reference date
      schedulePattern: [
        // Week 1: Early shift Mon-Fri, off weekend
        "M", // Monday
        "M", // Tuesday
        "M", // Wednesday
        "M", // Thursday
        "M", // Friday
        "O", // Saturday
        "O", // Sunday
        // Week 2: Late shift Mon-Fri, off weekend
        "L", // Monday
        "L", // Tuesday
        "L", // Wednesday
        "L", // Thursday
        "L", // Friday
        "O", // Saturday
        "O", // Sunday
        // Week 3: Early shift Mon-Fri, off weekend
        "M", // Monday
        "M", // Tuesday
        "M", // Wednesday
        "M", // Thursday
        "M", // Friday
        "O", // Saturday
        "O", // Sunday
        // Week 4: Late shift Mon-Fri, off weekend (assigned weekend day shift TBD)
        "L", // Monday
        "L", // Tuesday
        "L", // Wednesday
        "L", // Thursday
        "L", // Friday
        "O", // Saturday
        "O", // Sunday
      ],
      notes:
        "Early/late rotation by week in 4-week cycle. Each team has one assigned working weekend (day shift) and individual jumpdays within the cycle (team-specific, not shown in base pattern).",
    },
  },
  {
    value: "weekend-shift",
    title: "Weekend shift",
    description: "Weekend-only teams rotating early one weekend, late the next.",
    isAvailable: true,
    shiftConfig: {
      teamCount: 2,
      cycleLengthDays: 14,
      shiftsPerDay: 2,
      shiftTimes: {
        M: {
          name: "Early",
          start: 6,
          end: 14.5,
          displayCode: "E",
        },
        L: {
          name: "Late",
          start: 13.5,
          end: 22,
          displayCode: "L",
        },
        D: {
          name: "Day",
          start: 8,
          end: 16.5,
          displayCode: "D",
        },
        O: OFF_SHIFT_TIME,
      },
      referenceDate: "2025-01-06", // Monday of week 1, 2025
      referenceTeam: 1, // Reference team is off (week 1, day 1 of cycle = Monday = off) on the reference date
      schedulePattern: [
        // Week 1: Off Mon-Thu, Day Friday, Early Sat-Sun
        "O",
        "O",
        "O",
        "O",
        "D", // Friday
        "M", // Saturday
        "M", // Sunday
        // Week 2: Off Mon-Thu, Day Friday, Late Sat-Sun
        "O",
        "O",
        "O",
        "O",
        "D", // Friday
        "L", // Saturday
        "L", // Sunday
      ],
      notes: "Weekend-only coverage with early/late rotation. Friday coverage uses the day shift.",
    },
  },
  {
    value: "5-shift",
    title: "5-shift",
    description: "Continuous rotating shifts across multiple teams.",
    isAvailable: true,
    shiftConfig: {
      teamCount: 5,
      cycleLengthDays: 10,
      shiftsPerDay: 3,
      shiftTimes: {
        M: {
          name: "Morning",
          start: 7,
          end: 15,
          displayCode: "M",
        },
        L: {
          name: "Evening",
          start: 15,
          end: 23,
          displayCode: "E",
        },
        N: {
          name: "Night",
          start: 23,
          end: 7,
          displayCode: "N",
        },
        O: OFF_SHIFT_TIME,
      },
      referenceDate: "2025-07-16", // Wednesday, reference date from CONFIG
      referenceTeam: 1, // Reference team is on morning shift (day 1 of cycle) on the reference date
      schedulePattern: ["M", "M", "L", "L", "N", "N", "O", "O", "O", "O"],
      notes: "Continuous multi-team rotation.",
    },
  },
];

// Validate all schedule configurations at module load time
SCHEDULE_OPTIONS.forEach((option) => {
  validateSchedulePattern(option.shiftConfig);
});
