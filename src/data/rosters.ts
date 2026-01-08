export type ScheduleOption = "9-5" | "2-shift" | "weekend-shift" | "5-shift";

export type ShiftRosterConfig = {
  teamCount?: number;
  cycleLengthDays?: number;
  shiftsPerDay?: number;
  schedulePattern?: SchedulePattern;
  notes?: string;
};

export type SchedulePattern =
  | {
      type: "cycle";
      days: Array<{
        dayIndex: number;
        shift: "M" | "E" | "N" | "D" | "L" | "O";
      }>;
    }
  | {
      type: "weekly-rotation";
      weeks: Array<{
        weekIndex: number;
        shift: "Early" | "Late" | "Day";
        days: Array<"Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun">;
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
      schedulePattern: {
        type: "weekly-rotation",
        weeks: [
          {
            weekIndex: 1,
            shift: "Day",
            days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
          },
        ],
      },
      notes: "Weekday-only coverage.",
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
      schedulePattern: {
        type: "weekly-rotation",
        weeks: [
          {
            weekIndex: 1,
            shift: "Early",
            days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
          },
          {
            weekIndex: 2,
            shift: "Late",
            days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
          },
          {
            weekIndex: 3,
            shift: "Early",
            days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
          },
          {
            weekIndex: 4,
            shift: "Late",
            days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
          },
        ],
        extra: {
          weekendAssignment: "One assigned weekend within the 4-week cycle.",
          jumpday: "Fixed jumpday within the cycle.",
        },
      },
      notes: "Early/late rotation by week with one assigned weekend and a fixed jumpday.",
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
      schedulePattern: {
        type: "weekly-rotation",
        weeks: [
          {
            weekIndex: 1,
            shift: "Day",
            days: ["Fri"],
          },
          {
            weekIndex: 1,
            shift: "Early",
            days: ["Sat", "Sun"],
          },
          {
            weekIndex: 2,
            shift: "Day",
            days: ["Fri"],
          },
          {
            weekIndex: 2,
            shift: "Late",
            days: ["Sat", "Sun"],
          },
        ],
      },
      notes: "Weekend-only coverage with early/late rotation.",
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
      schedulePattern: {
        type: "cycle",
        days: [
          { dayIndex: 1, shift: "M" },
          { dayIndex: 2, shift: "M" },
          { dayIndex: 3, shift: "E" },
          { dayIndex: 4, shift: "E" },
          { dayIndex: 5, shift: "N" },
          { dayIndex: 6, shift: "N" },
          { dayIndex: 7, shift: "O" },
          { dayIndex: 8, shift: "O" },
          { dayIndex: 9, shift: "O" },
          { dayIndex: 10, shift: "O" },
        ],
      },
      notes: "Continuous multi-team rotation.",
    },
  },
];
