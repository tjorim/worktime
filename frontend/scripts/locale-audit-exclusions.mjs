// Whole files that hold no interface copy: authored data and development fixtures. Keep this list short and
// give each entry a reason; a trailing slash matches a directory.
export const excludedFiles = {
  "data/changelog.ts": "authored release notes, not interface copy",
  "mocks/": "MSW development fixtures, loaded only when VITE_MSW is set",
};
// Functions that only log for developers; their string arguments are not interface copy.
export const diagnosticCallees = [];
// Exact source/value exclusions. Never approve a whole component or directory for visible copy.
export const exclusions = {
  "components/AboutModal.tsx": {
    "Apache 2.0": "licence name",
    "React + TypeScript": "technology names",
  },
  "components/Header.tsx": {
    Worktime: "fixed application brand",
  },
  "components/MainTabs.tsx": {
    Worktime: "fixed application brand",
  },
  "utils/share.ts": {
    Worktime: "fixed application brand",
  },
  "components/TransferView.tsx": {
    "mb-1 hidden text-muted-foreground uppercase md:block": "CSS class list",
  },
  "components/schedule/TodayView.tsx": {
    "hidden sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2": "CSS class list",
  },
  "components/settings/SettingsGeneralSection.tsx": {
    "24h": "time format code",
    "12h": "time format code",
    EN: "language code",
    NL: "language code",
  },
  "components/settings/SettingsHdayHelper.tsx": {
    "http://127.0.0.1:8080": "URL input example",
  },
  "components/settings/account/SettingsIntegrationClientsSection.tsx": {
    "worktime:mcp": "OAuth scope identifier",
  },
  "config/oidc.ts": {
    "openid profile email": "OIDC scopes",
  },
  "contexts/PwaInstallContext.tsx": {
    "(display-mode: standalone)": "media query",
  },
  "data/rosters.ts": {
    "Weekday-only coverage.": "roster implementation note, never rendered",
    "Four-team support rotation: teams alternate Morning/Evening by week, with one team assigned to a Day support weekend each week. The support weekend rotates team-by-team across the 4-week cycle.":
      "roster implementation note, never rendered",
    "Weekend-only coverage with early/late rotation. Friday coverage uses the day shift.":
      "roster implementation note, never rendered",
    "Continuous multi-team rotation.": "roster implementation note, never rendered",
  },
  "db/collections.ts": {
    Bearer: "HTTP authorization scheme",
  },
  "hooks/useApiClient.ts": {
    Bearer: "HTTP authorization scheme",
  },
  "hooks/useSyncSignal.ts": {
    Bearer: "HTTP authorization scheme",
  },
  "features/gantt/GanttTaskModal.tsx": {
    "gap-1": "CSS class fragment",
  },
  "features/timeTracking/LabelModal.tsx": {
    "#3B82F6": "colour input example",
  },
  "features/timeTracking/TemplatesPanel.tsx": {
    "label-1": "example import payload shown as a data format sample",
    "Project work": "example import payload shown as a data format sample",
    "label-2": "example import payload shown as a data format sample",
    "Team meeting": "example import payload shown as a data format sample",
    "label-3": "example import payload shown as a data format sample",
    "Admin tasks": "example import payload shown as a data format sample",
    "label-4": "example import payload shown as a data format sample",
  },
  "features/timeTracking/TimelineProgressBar.tsx": {
    "truncate px-1 text-xs font-semibold": "CSS class list",
  },
  "features/timeTracking/WeeklyDataView.tsx": {
    "mb-3 text-base font-medium text-muted-foreground uppercase": "CSS class list",
  },
  "utils/dateTimeUtils.ts": {
    "hh:mm A": "Day.js format",
    "12:00 AM": "12-hour clock midnight label",
  },
  "utils/syncClient.ts": {
    "refusing to build a keep-local replace payload from empty local data":
      "internal invariant diagnostic",
  },
  "utils/reactSelectStyles.ts": {
    "flex min-h-8 w-full flex-wrap items-center rounded-lg border bg-background px-2.5 py-1 text-sm":
      "CSS class fragment",
    "rounded-md px-3 py-2 text-sm": "CSS class fragment",
  },
};
