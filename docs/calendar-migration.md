# Calendar Migration ADR

## Decision

The feature-folder calendar in `frontend/src/features/calendar/CalendarView.tsx` is the default
calendar experience. The legacy `frontend/src/components/CalendarView.tsx` remains in the codebase
for comparison and rollback, but it is only reachable when the developer option
`enableLegacyCalendar` is enabled.

## Rationale

Keeping both calendars as normal tabs made the migration state ambiguous and mounted two calendar
implementations in everyday builds. Defaulting the existing `calendar` tab to the feature-folder
implementation gives users one calendar path while preserving the legacy view for targeted
developer checks.

## Cut-over Path

1. Keep the legacy tab hidden by default behind Developer Options.
2. Use the feature-folder calendar for normal verification and new work.
3. Remove `frontend/src/components/CalendarView.tsx` after the feature-folder calendar has covered
   the legacy behavior for a release cycle and no rollback comparison is needed.
