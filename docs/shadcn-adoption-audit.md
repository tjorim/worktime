# shadcn / Base UI adoption audit (#1629)

Audit of the shared controls and application compositions against the configured
`base-nova` registry (`pnpm dlx shadcn@latest add <name> --dry-run` shows what a
component would add) and the Base UI docs. Decisions are **keep**, **extend** or
**replace**. A custom implementation stays only when it covers a real requirement.

## Inventory and decisions

| Area | Source | Consumers | Decision | Reason |
| --- | --- | --- | --- | --- |
| Main navigation tabs | `components/ui/tabs.tsx`, `components/MainTabs.tsx` | `MainTabs` (6 tabs, `keepMounted` panels) | **Keep** | Already the generated Base UI Tabs, with its `default` list variant. The responsive icon-over-label trigger is composed with classes, not forked. |
| Compact single-choice selections (view switchers, theme/language/time format, work location) | was hand-rolled `role="group"` + `Button aria-pressed` six times | `ScheduleTabView`, `TimeOffView`, `TimeTrackingView`, `GanttView`, `SettingsGeneralSection`, `WorkLocationDayHeader` | **Replace** with `ui/toggle-group.tsx` through `shared/ChoiceToggleGroup.tsx` | The same pattern was copied in six places with different spacing/labels. Base UI ToggleGroup gives the group role, per-option `aria-pressed` and arrow-key navigation. `ChoiceToggleGroup` stays controlled and calls `onChange` on every activation (the work location "Other…" option must reopen its dialog when already selected). |
| Empty states | `components/shared/EmptyState.tsx` | `CalendarView`, `GenericStatus`, `PersonalizedStatus`, `TimeOffTableView`, `TransferView`, `GanttChart`, `DailyTaskList`, `LabelsPanel`, `TemplatesPanel`, `TimeTrackingWeeklyView` | **Replace** internals with `ui/empty.tsx` | Same props and call sites; markup now comes from `Empty`/`EmptyHeader`/`EmptyMedia`/`EmptyTitle`/`EmptyDescription`/`EmptyContent`. `EmptyTitle` renders the heading the old component exposed (`h6`) so the accessibility tree is unchanged. |
| Table pagination | `components/shared/TablePagination.tsx` | `AdminUsersTable`, `TimeOffTableView`, `GanttTableView` | **Keep** | The generated `Pagination` renders anchor links for URL navigation. This footer drives TanStack Table state (`getCanNextPage`, page size) with buttons and a page-size `Select`, which the generated component does not model. Built on the owned `Button` and `Select`. |
| Date navigation (previous / current / next) | `components/shared/NavigationButtonGroup.tsx` | `TeamScheduleView`, `WeekView`, `DailyViewHeader`, `TimeTrackingWeeklyView` | **Keep** | These are actions, not a selection, so neither ToggleGroup nor Tabs fits. The generated `ButtonGroup` would join the buttons and force a group label, but the `inline` mode lets callers lay the buttons out inside their own toolbars, and the "current" button swaps between `default` and disabled. Uses `Button`/`IconButton`, `FieldLabel` and `Input`. |
| Loading indicators | `components/ui/spinner.tsx` | 11 consumers (`MainTabs`, `RouteStatus`, dialogs, auth callback) | **Keep**; no Skeleton | No consumer shows a content-shaped placeholder, only short route/data loads with `role="status"`. A generated `Skeleton` would have no caller, so it was not added. Revisit when a view needs layout-stable loading. |
| Tables | `components/ui/table.tsx` | 9 consumers | **Keep** | Already generated. The raw `<table>` in `TeamScheduleView` is the Team grid's domain rendering and stays specialised. |
| Alerts, badges, cards, progress, tooltips, accordion, separator | `components/ui/*` | 28 / 26 / 21 / 7 / 18 / 3 / 3 | **Keep** | Already generated primitives used through their variants. |
| Calendar and Gantt chrome | `features/calendar/`, `features/gantt/` | Schedule-X, Frappe Gantt | **Keep** | Vendor rendering, styled only in `calendar.css` / `gantt.css`. Their surrounding view switchers now use `ChoiceToggleGroup`. |
| Tokens, theme, `cn` | `styles/*.css`, `lib/utils.ts` | all | **Keep** | The preset, runtime `data-theme` mechanism, strict lint rules, local `cn` and semantic tokens are unchanged. |

## What was generated

Only the components with a consumer: `toggle`, `toggle-group`, `empty`. The CLI also
resolves `button`, `separator` and `button-group`/`pagination` as dependencies; those
were not applied, because `button.tsx` and `separator.tsx` are already owned and
restyled, and the other two have no consumer (see above).

Generated source was restyled to our conventions: local `cn` import, no inline
style, no arbitrary values, Base UI's `aria-pressed` styling mapped onto the
`primary` tokens (so a selected option matches the old `variant="default"` button
in both themes) and prettier formatting.

## Verification

- Unit tests: `tests/components/shared/ChoiceToggleGroup.test.tsx` (group name,
  `aria-pressed`, activation including the already-selected option, controlled
  value) and `tests/components/shared/EmptyState.test.tsx`; the existing
  `aria-pressed` assertions in the Settings, Welcome wizard and Time off tests
  keep passing unchanged.
- Browser: the Playwright suite (axe accessibility, theme tokens, calendar, team grid,
  lazy routes, weekly summary; 67 specs) passes against the dev server.
- Bundle: the main `index` chunk grew from 259.43 kB (67.30 kB gzip) to 262.30 kB
  (68.05 kB gzip) on a production build, which covers the three new primitives and
  `ChoiceToggleGroup`.
- Lint (`@shadcn/lint` strict rules), formatting, both type checks, unit tests and
  production build pass.
- Visual review in light and dark at 1100px and 390px: Time off, Time tracking,
  Gantt and Schedule view switchers, Settings > Preferences, the work location
  row (selected, keyboard focus), and the empty states (Time off, Gantt).
  Reduced motion was on for the captures; the toggle only uses a colour
  transition.

## Follow-ups

None blocking. If a content-shaped loading state is added later, generate
`skeleton` at that point rather than ahead of a consumer.
