// Whole files that hold no interface copy: authored data and development fixtures. Keep this list short and
// give each entry a reason; a trailing slash matches a directory.
export const excludedFiles = {
  "features/settings/changelog.ts":
    "adapter over CHANGELOG.md, whose entries are release notes, not interface copy",
  "mocks/": "MSW development fixtures, loaded only when VITE_MSW is set",
};
// Functions that only log for developers; their string arguments are not interface copy.
export const diagnosticCallees = [];
// Exact source/value exclusions. Never approve a whole component or directory for visible copy.
export const exclusions = {
  "app/layout/AboutModal.tsx": {
    "Apache 2.0": "licence name",
    "React + TypeScript": "technology names",
  },
  "app/layout/Header.tsx": {
    Worktime: "fixed application brand",
  },
  "app/home/MainTabs.tsx": {
    Worktime: "fixed application brand",
  },
  "features/settings/share.ts": {
    Worktime: "fixed application brand",
  },
  "features/schedule/TransferView.tsx": {
    "mb-1 hidden text-muted-foreground uppercase md:block": "CSS class list",
  },
  "features/schedule/TodayView.tsx": {
    "hidden sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2": "CSS class list",
  },
  "features/settings/SettingsGeneralSection.tsx": {
    "24h": "time format code",
    "12h": "time format code",
    EN: "language code",
    NL: "language code",
  },
  "features/settings/SettingsHdayHelper.tsx": {
    "http://127.0.0.1:8080": "URL input example",
  },
  "features/settings/account/SettingsIntegrationClientsSection.tsx": {
    "worktime:mcp": "OAuth scope identifier",
  },
  "config/oidc.ts": {
    "openid profile email": "OIDC scopes",
  },
  "app/providers/PwaInstallContext.tsx": {
    "(display-mode: standalone)": "media query",
  },
  "lib/schedule/rosters.ts": {
    "Weekday-only coverage.": "roster implementation note, never rendered",
    "Four-team support rotation: teams alternate Morning/Evening by week, with one team assigned to a Day support weekend each week. The support weekend rotates team-by-team across the 4-week cycle.":
      "roster implementation note, never rendered",
    "Weekend-only coverage with early/late rotation. Friday coverage uses the day shift.":
      "roster implementation note, never rendered",
    "Continuous multi-team rotation.": "roster implementation note, never rendered",
  },
  "lib/db/collectionTransport.ts": {
    Bearer: "HTTP authorization scheme",
  },
  "lib/push/pushNotifications.ts": {
    Bearer: "HTTP authorization scheme",
  },
  "hooks/useApiClient.ts": {
    Bearer: "HTTP authorization scheme",
  },
  "app/providers/useSyncSignal.ts": {
    Bearer: "HTTP authorization scheme",
  },
  "types/gantt.ts": {
    "Quarter Day": "Frappe Gantt zoom identifier stored in preferences",
    "Half Day": "Frappe Gantt zoom identifier stored in preferences",
  },
  "features/gantt/GanttTaskModal.tsx": {
    "gap-1": "CSS class fragment",
  },
  "components/LabelModal.tsx": {
    "#3B82F6": "colour input example",
  },
  "features/settings/time-tracking/TemplatesPanel.tsx": {
    "label-1": "example import payload shown as a data format sample",
    "Project work": "example import payload shown as a data format sample",
    "label-2": "example import payload shown as a data format sample",
    "Team meeting": "example import payload shown as a data format sample",
    "label-3": "example import payload shown as a data format sample",
    "Admin tasks": "example import payload shown as a data format sample",
    "label-4": "example import payload shown as a data format sample",
  },
  "features/time-tracking/TimelineProgressBar.tsx": {
    "truncate px-1 text-xs font-semibold": "CSS class list",
  },
  "features/time-tracking/WeeklyDataView.tsx": {
    "mb-3 text-base font-medium text-muted-foreground uppercase": "CSS class list",
  },
  "lib/dates/dateTimeUtils.ts": {
    "hh:mm A": "Day.js format",
    "12:00 AM": "12-hour clock midnight label",
  },
  "lib/sync/localSyncPayload.ts": {
    "refusing to build a keep-local replace payload from empty local data":
      "internal invariant diagnostic",
  },
};
