# Accessibility fixes for #1693

Screenshots cover Unified Calendar and the selected Daily Log toggle in light and
dark themes at 1280px and 390px. Other fixes change accessible semantics only.

## Before / after

- Unified Calendar: outline colours were also used as text colours; neutral text
  now uses the muted foreground token in both themes, including the vendor's
  dark calendar scope. The date chevron now has a 24 × 24px minimum target.
- The vendor hides the date label in dark mode; `aria-labelledby` now explicitly
  associates it with the input. The view selector uses its visible view name,
  fixing `label-content-name-mismatch`. The named all-day row has `role="group"`,
  fixing `aria-prohibited-attr` in the narrow day view.
- Orange task events previously used white text at 2.8:1. They now use the existing
  contrast helper (black at 7.49:1). Both Schedule-X event palettes are checked by
  `mapToScheduleXEvents.test.ts`, including every shift and bright/dark label samples.
- Gantt's native view select now retains its accessible name across view changes
  and refreshes (`select-name`). Daily Time Tracking's named current-time line now
  has an image role (`aria-prohibited-attr`).
- The selected Daily Log toggle previously faded its background on hover, reducing
  white text contrast to 3.32:1; it now retains its opaque primary background.
- Admin delete actions include the user's display name, falling back to username.

## Contrast verification

`tests/lib/eventPalette.test.ts` checks every background/foreground pair directly
from `event-palette.css`. Minimum contrast is **4.60:1 light** and **4.52:1 dark**;
no event-palette values changed. Schedule-X neutral text now maps to the existing
muted foreground token (light: **4.69:1** on white), rather than the border token.
The new event palette test enforces **4.5:1** in both themes; restoring the former
white label foreground makes that test fail. Browser axe scans verify resolved
colours and markup in light, dark and narrow contexts, with WCAG 2.2 AA enabled
and no violation allow-list.
