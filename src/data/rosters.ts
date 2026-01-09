export type ScheduleOption = "9-5" | "2-shift" | "weekend-shift" | "5-shift";

export type ShiftDisplayOverride = {
  displayName?: string;
  displayHours?: string;
};

export type ShiftDisplayOverrides = {
  M?: ShiftDisplayOverride;
  L?: ShiftDisplayOverride;
  N?: ShiftDisplayOverride;
  D?: ShiftDisplayOverride;
  O?: ShiftDisplayOverride;
};

export type ShiftRosterConfig = {
  teamCount?: number;
  cycleLengthDays?: number;
  shiftsPerDay?: number;
  schedulePattern?: SchedulePattern;
  referenceDate?: string; // ISO date string (YYYY-MM-DD) for shift calculation anchor
  referenceTeam?: number; // 1-based team number for reference point
  notes?: string;
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
  shiftConfig: ShiftRosterConfig;
};

export const SCHEDULE_OPTIONS: ScheduleRoster[] = [
  {
    value: "9-5",
    title: "9-5",
    description: "Standard weekday schedule with weekends off.",
    showsTeamSelection: false,
    shiftConfig: {
      teamCount: 1,
      cycleLengthDays: 7,
      shiftsPerDay: 1,
      referenceDate: "2025-01-06", // Monday of week 1, 2025
      referenceTeam: 1,
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
    shiftConfig: {
      teamCount: 2,
      cycleLengthDays: 28,
      shiftsPerDay: 2,
      referenceDate: "2025-01-06", // Monday of week 1, 2025
      referenceTeam: 1,
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
        M: { displayName: "Early" },
      },
    },
  },
  {
    value: "weekend-shift",
    title: "Weekend shift",
    description: "Weekend-only teams rotating early one weekend, late the next.",
    showsTeamSelection: false,
    shiftConfig: {
      teamCount: 2,
      cycleLengthDays: 14,
      shiftsPerDay: 2,
      referenceDate: "2025-01-06", // Monday of week 1, 2025
      referenceTeam: 1,
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
        M: { displayName: "Early" },
      },
    },
  },
  {
    value: "5-shift",
    title: "5-shift",
    description: "Continuous rotating shifts across multiple teams.",
    showsTeamSelection: true,
    shiftConfig: {
      teamCount: 5,
      cycleLengthDays: 10,
      shiftsPerDay: 3,
      referenceDate: "2025-07-16", // Reference date from CONFIG
      referenceTeam: 1, // Reference team from CONFIG
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
        L: { displayName: "Evening" },
      },
    },
  },
];
