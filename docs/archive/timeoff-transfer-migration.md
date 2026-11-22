# Time Off, event editing and transfer migration (#1394)

`TimeOffView`, `components/timeOff/*`, `EventModal` and `TransferView` now use owned UI components and
prefixed Tailwind utilities; no react-bootstrap imports or Bootstrap layout/control classes remain there.

## Decisions

- `Button`, `Alert`, `Badge`, `Card`, `Checkbox`, `Input`, `Textarea`, `NativeSelect`, `Field*`,
  `Grid`/`GridItem`, `Separator` and `Spinner` replace their react-bootstrap counterparts. `ListGroup`
  became semantic `<ul>`/`<li>` lists separated by `tw:divide-y`. Dialogs, accordions, the table hooks
  (`useDataTable`, `SortableHeaderCell`, `TablePagination`) and direct row-button rendering are unchanged.
- New `ui/radio-group.tsx` (Base UI `RadioGroup`/`Radio`). The event modal's type and time/location flags
  are `role="radiogroup"` regions labelled by their section heading, with the selected flag derived from
  `eventFlags` (the neutral option is selected when the section has no flag). Tests query
  `getByRole("radio", { name })` instead of `getByLabelText`.
- `Grid`/`GridItem` gained the 5-, 7- and 8-column spans the transfer rows need.
- Bulk-select checkboxes in the time-off table are Base UI checkboxes; the header one reports
  `aria-checked="mixed"` while only some visible rows are selected (it was a DOM `indeterminate` flag).
- The remote-change banner is an `Alert` with a text `Pull` button and an icon-only dismiss button named
  "Close" (was react-bootstrap's `dismissible`).
- Validation messages (`FieldError`, `role="alert"`) are only rendered while invalid; the inputs expose
  `aria-invalid`, and the modal's date errors are still linked through `aria-describedby`.
- The raw `.hday` textarea keeps its 20 fixed rows (`tw:field-sizing-fixed`) and monospace font.

## Colours

Colours still come from `event-palette.css`; nothing repeats a hex value.

- The time-off table's type badge uses `getEventColorUtilities()`, like the team schedule.
- The statistics view replaced the Bootstrap-named `EVENT_TYPE_COLORS` map with the same palette: each
  category icon sits in a round chip and the day-count badge uses the category's palette pair.
- `TransferView`'s "you're on leave" pill took its colours from event metadata through inline
  `backgroundColor`/`color`. It now sets `--event-bg`/`--event-fg` custom properties that
  `tw:bg-event` / `tw:text-event-foreground` read (the `LabelChip` approach). The values go through
  `resolveEventPaletteVars()`, which only accepts the palette's own `var(--wt-event-…)` references and
  falls back to the "unknown" pair, so a stray string can never become free-form CSS.

## Legacy cleanup

| | Before | After |
|---|---|---|
| Generated legacy classes (`legacy-classes.json`) | 2,278 | 2,276 |
| `legacy-inline-styles.json` allowances | `TransferView.tsx` (4 properties) | none (`{}`) |
| DOM-hook allowances in `oxlint.config.ts` | `preview-card`, `event-type-badge`, `time-off-view` | removed |

The two classes that left the inventory are the owned `.icon-lg` and `.textarea-mono` selectors, which
had no other consumer. `preview-card`, `event-type-badge` and `time-off-view` never had CSS; they were
test/DOM hooks and are gone (the table badge carries `data-event-type-badge` for its locale tests).

The count only drops by two because almost everything these screens used is a Bootstrap-provided
selector (`btn`, `card`, `badge`, `alert`, `form-*`, `d-flex`, `list-group`, spacing utilities, …). Those
are still referenced by other unmigrated areas (calendar, gantt, navigation/accordion, remaining
shared pieces) and leave with their last consumer and with #1384. `.event-*` palette classes stay
because the calendar day cells and legend still use them.

## Verification

Targeted tests: `EventModal.test.tsx` (radio groups, neutral option, callbacks, date-error
description, weekly/view modes), the table's mixed/checked header checkbox and per-type palette
classes, the statistics palette badges, the transfer indicator's custom properties and
`resolveEventPaletteVars` (mutation-checked: dropping the regex guard or hard-coding the selected radio
fails them). Visual review covered the empty and populated table, add/edit modal with and without
validation errors, selection, raw editor with skipped lines, statistics, transfers and the invalid
custom range, in light and dark at 1280px and 390px.
