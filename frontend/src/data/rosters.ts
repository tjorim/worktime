export type ScheduleOption = "9-5" | "2-shift" | "weekend-shift" | "5-shift";

export type ShiftCode = "M" | "L" | "N" | "D" | "O";
export const SHIFT_CODES = ["M", "L", "N", "D", "O"] as const;

export type ShiftTimeDefinition = {
  name: string;
  start: number | null;
  end: number | null;
  displayCode: string;
  /**
   * Optional flex-time window. When present, the fixed `start`/`end` are only
   * the nominal window: the employee may clock in any time between
   * `flexStartEarliest` and `flexStartLatest` and is present for
   * `presenceHours` (work + mandatory break) from their actual start.
   * Used by the Current Status card to show a realistic finish time/range
   * instead of a misleading countdown to the fixed `end`.
   */
  flexStartEarliest?: number;
  flexStartLatest?: number;
  presenceHours?: number;
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
  const { schedulePattern, cycleLengthDays, teamCount, referenceDate } = config;

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

  // Validation 3: Shift time definitions are valid
  const isValidHour = (value: number) => Number.isFinite(value) && value >= 0 && value <= 24;

  Object.entries(config.shiftTimes).forEach(([shiftCode, definition]) => {
    if (!definition) return;

    const { start, end } = definition;

    if (shiftCode === "O") {
      if (start !== null || end !== null) {
        throw new Error(
          `Schedule pattern validation failed: Off shift must use null start/end times (shift=${shiftCode}).`,
        );
      }
      return;
    }

    if (start == null || end == null) {
      throw new Error(
        `Schedule pattern validation failed: Working shift ${shiftCode} must define start and end times.`,
      );
    }

    if (!isValidHour(start) || !isValidHour(end)) {
      throw new Error(
        `Schedule pattern validation failed: Shift ${shiftCode} has invalid time range (${start}-${end}).`,
      );
    }

    if (start === end) {
      throw new Error(
        `Schedule pattern validation failed: Shift ${shiftCode} must have a non-zero duration.`,
      );
    }

    if (shiftCode === "N") {
      if (start <= end) {
        throw new Error(
          `Schedule pattern validation failed: Night shift ${shiftCode} must span midnight (start > end).`,
        );
      }
    } else if (start > end) {
      throw new Error(
        `Schedule pattern validation failed: Shift ${shiftCode} must not span midnight (start < end).`,
      );
    }
  });

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
          // Flex day: clock in between 07:00 and 09:00, present 8.5h
          // (8h work + 30 min mandatory break), so finish 15:30-17:30.
          flexStartEarliest: 7,
          flexStartLatest: 9,
          presenceHours: 8.5,
        },
        O: OFF_SHIFT_TIME,
      },
      referenceDate: "2025-01-06", // Monday of week 1, 2025
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
    description:
      "Alternating morning and evening shifts across 4 teams with rotating support weekends.",
    isAvailable: true,
    shiftConfig: {
      teamCount: 4,
      cycleLengthDays: 28,
      shiftsPerDay: 2,
      shiftTimes: {
        M: {
          name: "Morning",
          start: 6.5,
          end: 15.5,
          displayCode: "M",
        },
        L: {
          name: "Evening",
          start: 15,
          end: 24,
          displayCode: "E",
        },
        D: {
          name: "Day",
          start: 7,
          end: 16,
          displayCode: "D",
        },
        O: OFF_SHIFT_TIME,
      },
      referenceDate: "2025-07-14", // Monday of week 1, 2025 (aligned with other rosters)
      schedulePattern: [
        // Week 1: Morning shift Mon-Fri + support weekend day shift
        "M", // Monday
        "M", // Tuesday
        "M", // Wednesday
        "M", // Thursday
        "M", // Friday
        "D", // Saturday
        "D", // Sunday
        // Week 2: Evening shift Mon-Fri, off weekend
        "L", // Monday
        "L", // Tuesday
        "L", // Wednesday
        "L", // Thursday
        "L", // Friday
        "O", // Saturday
        "O", // Sunday
        // Week 3: Morning shift Mon-Fri, off weekend
        "M", // Monday
        "M", // Tuesday
        "M", // Wednesday
        "M", // Thursday
        "M", // Friday
        "O", // Saturday
        "O", // Sunday
        // Week 4: Evening shift Mon-Fri, off weekend
        "L", // Monday
        "L", // Tuesday
        "L", // Wednesday
        "L", // Thursday
        "L", // Friday
        "O", // Saturday
        "O", // Sunday
      ],
      // 20 working weekdays across the 28-day cycle at 9h average to 45h/week.

      notes:
        "Four-team support rotation: teams alternate Morning/Evening by week, with one team assigned to a Day support weekend each week. The support weekend rotates team-by-team across the 4-week cycle.",
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
      schedulePattern: ["M", "M", "L", "L", "N", "N", "O", "O", "O", "O"],
      notes: "Continuous multi-team rotation.",
    },
  },
];

// Validate all schedule configurations at module load time
SCHEDULE_OPTIONS.forEach((option) => {
  validateSchedulePattern(option.shiftConfig);
});
