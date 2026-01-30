# AGENTS.md

This file provides guidance for AI coding agents working with this repository.

## Project Overview

**Worktime** - Created by **[Jorim Tielemans](https://github.com/tjorim)**

Worktime is a Team Shift Tracker and Time-Off Manager supporting multiple roster patterns including continuous 24/7 rotations, standard weekday schedules, and custom shift patterns. This lightweight web application combines shift tracking with integrated time-off management (.hday format), allowing users to select their schedule type, check which teams are working on any given day, see when their team's next shift is, manage vacation/time-off events, and identify transfer/handover points between teams.

**Supported Schedule Types**:

- **5-shift**: Continuous 24/7 rotation with 5 teams (morning/evening/night shifts)
- **9-5**: Standard weekday schedule (Mon-Fri, single user)
- **2-shift**: Alternating early/late shifts (coming soon)
- **Weekend shift**: Weekend-only rotation (coming soon)

**Note**: Previously known as NextShift. Rebranded to Worktime with v4.0.0 after merging HdayPlanner's time-off management capabilities. Schedule selection and multi-roster support added in v4.4.0.

## Setup Commands

### Development Server

```bash
npm run dev          # Start Vite dev server at http://localhost:8000
```

### Production Build

```bash
npm run build        # Build for production in dist/ directory
npm run preview      # Preview production build locally
```

**⚠️ IMPORTANT**: ALWAYS run `npm run build` BEFORE `npm run preview`. The preview command serves the built files from the dist/ directory, so any code changes won't be visible until you build first.

### Code Quality

```bash
npm run lint         # Lint with oxlint (ultra-fast Rust-based linter)
npm run format       # Format code with oxfmt
npm run test         # Run Vitest test suite
```

### Utility Scripts

```bash
npm run generate-changelog  # Generate CHANGELOG.md from data
npm run generate-icons      # Generate favicon icons
```

## Code Style Guidelines

### Language & Spelling

- Use **American English** spelling throughout the codebase
- Examples: "color" (not "colour"), "organization" (not "organisation"), "license" (not "licence"), "optimize" (not "optimise")
- Aligns with programming conventions and React/TypeScript ecosystem standards

### Linting & Formatting

- **Linter**: oxlint (OXC toolchain - Rust-based, ultra-fast)
- **Formatter**: oxfmt (OXC toolchain)
- All code must pass `npm run lint` before completion
- Use inline `oxlint-disable-line` comments when suppression is necessary, with clear explanations

## Git Workflow

- **Do NOT commit automatically** - The user (Jorim) handles all git commits
- Only create commits when explicitly requested by the user
- Focus on implementation and testing, let the user control version control timing and commit messages

## Testing

### Running Tests

```bash
npm test                    # Run all tests
npm test -- <file>          # Run specific test file
npm test -- --coverage      # Run with coverage report
```

### Testing Stack

- **Framework**: Vitest with React Testing Library
- **Test Types**: Component tests, hook tests, unit tests
- **Coverage**: Comprehensive test coverage with data-driven patterns
- All tests must pass before marking work as complete

### Key Test Files

- `tests/components/` - Component tests
- `tests/hooks/` - Hook tests
- `tests/data/rosters.test.ts` - Roster configuration validation tests (14 test cases)
- `tests/lib/hday.test.ts` - .hday parser tests (139 test cases)
- `tests/contexts/EventStoreContext.test.tsx` - Event store tests
- `tests/utils/shiftCalculations.test.ts` - Core shift calculation logic tests
- `tests/utils/workingDayUtils.test.ts` - Working day and holiday logic tests
- `tests/utils/vacationCalculations.test.ts` - Vacation and time-off aggregation tests

## File Structure

```text
Worktime/
├── index.html              # Main HTML entry point
├── src/
│   ├── App.tsx            # Main React application component
│   ├── main.tsx           # React app entry point and initialization
│   ├── vite-env.d.ts      # TypeScript environment declarations
│   ├── components/        # React components
│   │   ├── AboutModal.tsx        # About modal with app/version details
│   │   ├── CalendarView.tsx      # Monthly calendar view with holidays/events
│   │   ├── ChangelogModal.tsx    # Interactive changelog viewer with accordion layout
│   │   ├── ConfirmationDialog.tsx # Reusable confirmation dialog
│   │   ├── CurrentStatus.tsx     # Current team shift and status display with timeline
│   │   ├── ErrorBoundary.tsx     # Error boundary wrapper for graceful error handling
│   │   ├── EventModal.tsx        # Time-off event editor modal
│   │   ├── Header.tsx            # App header with title and controls
│   │   ├── KeyboardShortcutsModal.tsx # Keyboard shortcut helper modal
│   │   ├── MainTabs.tsx          # Main tabbed interface container
│   │   ├── ScheduleTabView.tsx   # Schedule tab container and controls
│   │   ├── SettingsPanel.tsx     # Settings sidebar and configuration
│   │   ├── ShiftTimeline.tsx     # Today's shift timeline component (extracted from CurrentStatus)
│   │   ├── TimeOffView.tsx       # Time-off management view
│   │   ├── TransferView.tsx      # Team handover/transfer analysis
│   │   ├── WelcomeWizard.tsx     # Onboarding wizard (schedule/team selection)
│   │   ├── calendar/             # Calendar view building blocks
│   │   │   ├── CalendarLegend.tsx
│   │   │   ├── ContextMenu.tsx
│   │   │   ├── DayCell.tsx
│   │   │   └── MonthCalendar.tsx
│   │   ├── schedule/             # Schedule views
│   │   │   ├── ScheduleDetailModal.tsx
│   │   │   ├── ScheduleView.tsx
│   │   │   └── TodayView.tsx
│   │   ├── shared/               # Shared UI building blocks
│   │   │   ├── CountdownBadge.tsx
│   │   │   ├── SetupActionButton.tsx
│   │   │   ├── ShiftBadge.tsx
│   │   │   └── ShiftTimeDisplay.tsx
│   │   ├── status/               # Status card variants
│   │   │   ├── GenericStatus.tsx
│   │   │   └── PersonalizedStatus.tsx
│   │   └── timeoff/              # Time-off view panels
│   │       ├── RawContentPanel.tsx
│   │       └── VacationStatsPanel.tsx
│   ├── contexts/          # React contexts for global state
│   │   ├── EventStoreContext.tsx    # .hday event storage and CRUD operations
│   │   ├── SettingsContext.tsx      # User settings (team, time format, etc.)
│   │   └── ToastContext.tsx         # Global toast notification system
│   ├── data/              # Static data and configurations
│   │   ├── changelog.ts            # Changelog data structure for in-app viewer
│   │   └── rosters.ts              # Schedule roster configurations and patterns (IMPORTANT)
│   ├── hooks/             # Custom React hooks
│   │   ├── useCountdown.ts         # Countdown timer hook for next shift timing
│   │   ├── useFocusTrap.ts         # Focus trap for modals
│   │   ├── useFormattedShiftTime.ts # Shift time formatting helpers
│   │   ├── useKeyboardShortcuts.ts # Keyboard shortcuts functionality
│   │   ├── useLiveTime.ts          # Live updating time with configurable frequency
│   │   ├── useLocalStorage.ts      # LocalStorage persistence hook
│   │   ├── useOpenHolidays.ts      # OpenHolidays API hook
│   │   ├── usePublicHolidays.ts    # Public holiday lookup hook
│   │   ├── useSchoolHolidays.ts    # School holiday lookup hook
│   │   ├── useSetupAction.ts       # Wizard/setup action helpers
│   │   ├── useShiftCalculation.ts  # Shift calculation logic hook
│   │   ├── useSyncedState.ts       # State synchronized with storage
│   │   ├── useTransferCalculations.ts # Team transfer analysis hook
│   │   └── useViewMode.ts          # View mode preference hook
│   ├── lib/               # Core libraries
│   │   ├── events/        # Event processing
│   │   │   └── converters.ts      # .hday to internal format converters
│   │   └── hday/          # .hday parser
│   │       └── parser.ts          # Parser implementation (482 lines, 139 tests)
│   ├── utils/             # TypeScript utilities and business logic
│   │   ├── config.ts           # App configuration and constants
│   │   ├── dateTimeUtils.ts    # Date formatting and localization
│   │   ├── paydayUtils.ts      # Payday calculation helpers
│   │   ├── scheduleUtils.ts    # Schedule type guards and helpers
│   │   ├── share.ts            # Share functionality
│   │   ├── shiftCalculations.ts # Core shift calculation functions
│   │   ├── vacationCalculations.ts # Vacation/time-off aggregations
│   │   ├── viewUtils.ts         # View-level helpers
│   │   └── workingDayUtils.ts   # Working day and holiday logic
│   └── styles/
│       └── main.scss      # Custom styles and shift color coding (Sass)
├── tests/                 # Test files
│   ├── components/        # Component tests
│   ├── contexts/          # Context tests
│   ├── hooks/            # Hook tests
│   ├── lib/              # Library tests
│   ├── setup.ts          # Test environment setup
│   └── utils/             # Utility tests
├── public/
│   └── assets/icons/      # Favicon icons
├── scripts/               # Build and utility scripts
│   ├── generate-changelog.ts   # Automatic changelog generation from data
│   └── generate-icons.js       # Icon generator script
├── vite.config.ts         # Vite build configuration with React
├── vitest.config.ts       # Vitest testing configuration
├── tsconfig.json          # TypeScript project references
├── tsconfig.app.json      # TypeScript app configuration
├── tsconfig.node.json     # TypeScript Node.js configuration
└── tsconfig.test.json     # TypeScript test configuration
```

## Roster System Architecture

**Location**: `src/data/rosters.ts`

Worktime uses a structured, machine-readable roster configuration system that centralizes all schedule patterns and shift definitions. This architecture enables the app to support multiple schedule types while maintaining consistent shift calculations across the codebase.

### Schedule Configuration Structure

Each schedule is defined by a `ScheduleRoster` object containing:

```typescript
type ScheduleRoster = {
  value: ScheduleOption;           // "5-shift" | "9-5" | "2-shift" | "weekend-shift"
  title: string;                   // Display name for schedule selection
  description: string;             // User-facing description
  isAvailable: boolean;            // Whether schedule is ready for use
  shiftConfig: ShiftRosterConfig;  // Detailed shift configuration
};

type ShiftRosterConfig = {
  teamCount: number;               // Number of teams (1 for single-user)
  cycleLengthDays: number;         // Length of repeating cycle
  shiftsPerDay: number;            // How many shifts per 24h period
  shiftTimes: { ... };             // Shift time definitions keyed by shift code
  schedulePattern: ShiftCode[];    // Day-by-day shift assignments
  referenceDate: string;           // ISO date anchoring calculations
  referenceTeam: number;           // Team number at reference point
  notes?: string;                  // Developer documentation
};
```

### Schedule Pattern Format

Patterns define the repeating cycle of shifts as a list of shift codes:

```typescript
schedulePattern: [
  "M", // Day 1: Morning
  "M", // Day 2: Morning
  "L", // Day 3: Late
  // ... continues for full cycle
];
```

**Shift Codes**:

- `M` - Morning/Early shift
- `L` - Late/Evening shift
- `N` - Night shift
- `D` - Day shift (standard 9-5 hours)
- `O` - Off day

### Reference Date System

Each schedule uses a **reference date** and **reference team** to anchor shift calculations:

- **Reference Date**: A specific ISO date (YYYY-MM-DD) when the reference team is at a known point in their cycle
- **Reference Team**: Which team number is at the reference point on the reference date
- All shift calculations work forward/backward from this anchor point

**Example** (5-shift):

```typescript
referenceDate: "2025-07-16",  // Wednesday
referenceTeam: 1,             // Team 1 is on day 1 of cycle (Morning shift)
```

This means on July 16, 2025, Team 1 is working their first morning shift of the cycle. All other dates and teams are calculated relative to this anchor.

### Adding a New Schedule

To add a new roster pattern:

1. **Define the schedule configuration** in `SCHEDULE_OPTIONS` array in `src/data/rosters.ts`:

```typescript
{
  value: "my-schedule",
  title: "My Schedule",
  description: "Description for users",
  isAvailable: true,         // false while in development
  shiftConfig: {
    teamCount: 3,
    cycleLengthDays: 21,
    shiftsPerDay: 2,
    shiftTimes: {
      M: { name: "Morning", start: 7, end: 15, displayCode: "M" },
      L: { name: "Late", start: 15, end: 23, displayCode: "L" },
      O: { name: "Off", start: null, end: null, displayCode: "O" },
    },
    referenceDate: "2025-01-06",  // Pick a Monday for consistency
    referenceTeam: 1,
    schedulePattern: [
      "M",
      // ... define all days in cycle
    ],
    notes: "Internal documentation about this schedule",
  },
}
```

2. **Add the option to the type** in `src/data/rosters.ts`:

```typescript
export type ScheduleOption = "9-5" | "2-shift" | "weekend-shift" | "5-shift" | "my-schedule";
```

3. **Validation runs automatically** at module load - if your configuration is invalid, the app will throw an error on startup with details about what's wrong

4. **Add tests** in `tests/data/rosters.test.ts` to verify your pattern

5. **Test shift calculations** to ensure the reference date/team anchoring works correctly

### Shift Times

Define shift time metadata in `shiftTimes` for each shift code used by the schedule:

```typescript
shiftTimes: {
  M: { name: "Morning", start: 7, end: 15, displayCode: "M" },
  L: { name: "Evening", start: 15, end: 23, displayCode: "E" }, // e.g., "L" shift can be displayed as "E"
  N: { name: "Night", start: 23, end: 7, displayCode: "N" },
  O: { name: "Off", start: null, end: null, displayCode: "O" },
}
```

### Validation

The system validates all configurations at module load time (`validateSchedulePattern` function):

1. Pattern length matches `cycleLengthDays`
2. Shift codes are valid (M, L, N, D, O) and defined in `shiftTimes`
3. Reference date is valid ISO format and parseable
4. Reference team is within valid range (1 to `teamCount`)
5. Cycle length is reasonable (1-365 days)
6. Team count is positive
7. At least one working shift exists (not all off days)

If validation fails, the error message will indicate exactly what's wrong.

### How Shift Calculations Work

All shift calculation functions in `src/utils/shiftCalculations.ts` now accept an optional `scheduleType` parameter:

```typescript
// Get shift for a specific date, team, and schedule
const shift = calculateShift(date, teamNumber, scheduleType);

// Calculate next shift for a team
const nextShift = getNextShift(date, teamNumber, scheduleType);

// Get shift code in YYWW.D format
const code = getShiftCode(date, teamNumber, scheduleType);
```

When `scheduleType` is null/undefined, the system falls back to "5-shift" for backward compatibility with existing user data.

**Note**: The `scheduleType` comes from the SettingsContext and represents the user's selected schedule (e.g., "5-shift", "9-5"). Use the `isValidScheduleType()` type guard from `src/utils/scheduleUtils.ts` for runtime validation of user input.

## Core Logic & Architecture

### 5-Shift Pattern (Default/Legacy)

The original 5-shift continuous rotation - each team works a repeating 10-day cycle:

- 2 mornings (7h-15h) - Code: M
- 2 evenings (15h-23h) - Code: L (displays as "E" for Evening)
- 2 nights (23h-7h) - Code: N
- 4 days off - Code: O

Teams are numbered 1-5, with each team offset by 2 days in the schedule cycle, ensuring 24/7 coverage.

### 9-5 Pattern

Standard weekday schedule - single user, 7-day cycle:

- Monday-Friday: Day shift (9h-17h) - Code: D
- Saturday-Sunday: Off - Code: O

No team selection needed (teamCount = 1).

### Date Format

Uses weeknumber.weekday format (YYWW.D):

- Format: **YYWW.D** where YY=year, WW=week number, D=weekday (1=Monday, 7=Sunday)
- Today (Tuesday 13 May 2025) = **2520.2** (year 2025, week 20, Tuesday)
- Night shifts use previous day (2520.1N for night starting Monday 23h)
- Full shift codes: **2520.2M**, **2520.2E**, **2520.1N**

## Key Features

- **Schedule Selection**: Users choose their roster type during onboarding (5-shift, 9-5, etc.)
- **Team Shift View**: Show all teams and their shifts for any selected date (for multi-team schedules)
- **My Team Selection**: User selects their team on first visit for multi-team schedules (stored in localStorage)
- **Next Shift Lookup**: See when any team's next shift is scheduled
- **My Team Next Shift**: Quickly see when user's team works next
- **Transfer/Handover View**: See when user's team transfers with any other team (works before/after)
- **Calendar View**: Monthly calendar with working shifts, time-off, public holidays, school holidays, and paydays
- **Time Off Management**: Import/export .hday files for vacation and time-off tracking with event overlays on schedule
- **Date Navigation**: Today button, date picker, previous/next day
- **Date Format**: Display in YYWW.D format (e.g., 2520.2M = year 2025, week 20, Tuesday Morning)
- **Live Status**: Real-time shift status with countdown to next shift and off-day progress tracking

## Time Off Management (.hday Integration)

Worktime supports importing and managing time-off events via the `.hday` format (merged from HdayPlanner), enabling vacation planning and event tracking alongside shift schedules.

### .hday Format

The .hday format is a simple, human-readable text format for time-off events:

**Range Events** (specific dates):

```text
2025/01/15 # Vacation day
2025/12/23-2025/12/27 # Christmas vacation
2025/03/10-2025/03/14b # Business trip
```

**Weekly Events** (recurring patterns):

```text
d1 # Every Monday
d5 # Every Friday
d1i # Every Monday in office
```

**Event Flags**:

- **Type flags**: `b` (business trip), `s` (training/course), `i` (in office), `w` (weekend), `a` (birthday), `l` (sick leave), `o` (other)
- **Time/location flags**: `a` (AM/half day), `p` (PM/half day), `+` (onsite), `-` (no fly), `=` (can fly)

### Key Features

- **Dedicated Time Off Tab**: Manage all time-off events in one place
- **Import/Export**: Load existing .hday files or export for backup
- **CRUD Operations**: Add, edit, and delete events with live preview
- **Event Overlays**: See time-off indicators on the schedule view
- **Today Banner**: View today's events prominently in the Today view
- **Offline Capable**: All events stored in localStorage, fully functional offline
- **Round-trip Fidelity**: Export maintains exact .hday format from import

### Implementation

**Key Files**:

- Parser: `src/lib/hday/parser.ts` (482 lines, 139 test cases)
- Event store: `src/contexts/EventStoreContext.tsx`
- Event converters: `src/lib/events/converters.ts`
- UI components: `src/components/TimeOffView.tsx`, `src/components/EventModal.tsx`
- Tests: `tests/lib/hday.test.ts`, `tests/contexts/EventStoreContext.test.tsx`, `tests/components/TimeOffView.test.tsx`

**Storage**:

- Raw .hday text stored in localStorage (`worktime_hday_raw`)
- Parsed on load into HdayEvent objects
- No consent checks - direct localStorage access (internal users only)

**Accessibility**:

- Semantic table structure for screen readers
- ARIA labels on icon-only buttons
- Keyboard navigation throughout
- Form validation with aria-required and aria-describedby
- Modal focus traps and Escape key support
- Color contrast: #000 text on all colored event badges

## Technology Stack

- **Frontend**: React 19 with TypeScript and modern JSX transform
- **Build Tool**: Vite 8 beta for modern development and optimization
- **UI Framework**: React Bootstrap (Bootstrap 5 components) for responsive design
- **Date Handling**: Day.js for date calculations and week number formatting
- **Storage**: Custom React hooks for localStorage persistence and state management
- **Code Quality**: oxlint and oxfmt (OXC tools) for ultra-fast linting and formatting
- **Testing**: Vitest with React Testing Library for component and unit testing

## Recent Improvements

### v4.4 - Multi-Roster Support (Current)

- **Structured Roster System**: Machine-readable schedule configurations in `src/data/rosters.ts`
- **Schedule Selection**: Onboarding wizard now includes schedule selection step
- **Multiple Schedule Types**: Support for 5-shift, 9-5, 2-shift (coming soon), weekend-shift (coming soon)
- **Runtime Validation**: Comprehensive validation of roster configurations at module load
- **Reference Date System**: Per-schedule reference dates and teams for accurate calculations
- **Shift Times**: Define shift names, display codes, and hours per schedule
- **Schedule-Aware Components**: All shift calculations now support multiple roster patterns
- **Backward Compatibility**: Existing 5-shift users continue working without migration

### v3.1+ - Component Architecture & Performance

- **ShiftTimeline Component**: Extracted timeline logic from CurrentStatus into dedicated component for better separation of concerns
- **Enhanced CurrentStatus**: Optimized layout with datetime moved to header area and improved timeline display
- **Cross-day Timeline**: Fixed timeline to show next shift from tomorrow when current shift is last of day (e.g., T1 M after T4 N)
- **useLiveTime Hook**: Configurable update frequency with minute-level default (60x fewer re-renders)
- **Precision Control**: Second-level updates available when needed for precise timing
- **Memoized Calculations**: Better performance for shift day computations
- **Night Shift Fix**: Date codes now correctly use shift day instead of calendar day (2530.5N instead of 2530.6N)
- **Enhanced Display**: Current status shows combined format "2530.5N • Saturday, Jul 26 • 02:24"
- **Tooltip Context**: Shows both calendar day and shift day for user clarity
- **Interactive Changelog**: In-app changelog viewer with accordion interface
- **Toast Notifications**: Global notification system with React Context
- **Error Boundaries**: Graceful error handling and recovery
- **Enhanced Testing**: Comprehensive test coverage with data-driven patterns

## Future Extensions

- Multi-day calendar overview
- Export schedule as .ics calendar
- Shift notifications
- Internationalization (EN/NL)
