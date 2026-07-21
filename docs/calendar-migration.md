# Calendar Migration ADR

## Decision (revised)

`frontend/src/components/CalendarView.tsx` — the shift-roster month grid — is the default
`calendar` tab. `frontend/src/features/calendar/CalendarView.tsx` (the Schedule-X-powered
view combining shifts, time off, and time-tracking tasks) is a permanent, user-facing opt-in
feature: the `unified-calendar` tab, gated by the `enableUnifiedCalendar` setting in
Settings → Features. Both are intended to stay; this is not an in-flight migration toward
deleting either one.

## Rationale

An earlier version of this ADR treated the roster view as legacy, made the Schedule-X view the
default, and staged the roster view for deletion after the Schedule-X view "covered its
behavior." That direction was reversed: for a 5-team continuous-schedule app, the roster grid
conveys shift patterns (which team works M/E/N, where the rest days fall, when handovers happen)
at a glance in a way a generic event calendar cannot — Schedule-X renders each shift as a
near-identical timed event block, which is denser and less scannable for that purpose. The
Schedule-X view earns its place for a different reason: it is the only place shifts, time off,
and time-tracking tasks are shown together with drag-and-drop rescheduling, which the roster
view was never designed to do.

Gating it behind a developer-only flag also hid a real feature from users who might want it.
Making it a normal opt-in setting (like Gantt or Cross-Border Tracking) lets people choose it
without digging into Developer Options, while keeping it lazy-loaded so its dependencies
(Preact, `@schedule-x/*`, `temporal-polyfill`) are never pulled into the initial bundle unless
enabled.

## Status

Both calendar implementations are permanent, coexisting features — not migration debt. There is
no planned removal of either `CalendarView`.
