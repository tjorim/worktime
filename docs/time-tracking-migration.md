# Daily and weekly time tracking migration (#1393)

All `features/timeTracking` files now use owned UI components and prefixed Tailwind
utilities; no react-bootstrap imports or Bootstrap layout/control classes remain there.

## Decisions

- `Button`, `Badge`, `Card`, `Alert`, `Field`/`Input`/`Textarea` and the owned `Table` replace
  their react-bootstrap counterparts. Dialog bodies reuse the existing Base UI dialogs.
  `ListGroup` becomes a divided, bordered container (`data-slot="task-list"` / `"task-row"`).
- `ProgressBar` and the weekly/category bars use the owned `Progress` (new `trackClassName`
  prop). `TimelineProgressBar` stays custom: planned/actual/break/gap intervals, the Now line
  and hover tooltips need their own geometry. Segments keep `role="progressbar"`.
- Runtime values never become free-form inline styles. User label colours use the existing
  `--label-bg`/`--label-fg` custom properties (`LabelChip`); segment widths, the Now position
  and the daily ring use `--seg-w`, `--now-pos` and `--ring-pct`. `features/timeTracking/cssVars.ts`
  validates them (hex-only label colours with a theme fallback, percentages clamped to 0–100).
- `tw:progress-stripes` (planned time) and `tw:progress-ring` (daily total) are the only new
  utilities, plus `success-solid`/`warning-solid` tokens for filled bars.
- WeeklyHoursChart keeps its chart library; only its legend and wrapper lost inline styles.
- No search or pagination was added to the weekly table.
- Without Tailwind preflight, `tw:border-dashed` alone draws default-width dashed borders on
  every side. Pair it with `tw:border-0` before a single-side width.

## Legacy cleanup

The generated legacy class inventory went from **2,285 to 2,282** classes. Removed:
`.progress-thin`, `.time-tracking-label` and `.time-tracking-codeblock`. All
`features/timeTracking/*` entries were removed from `legacy-inline-styles.json`.

Still shared with another area: `.textarea-mono` (`TimeOffRawView`), and the global Bootstrap
layout/control selectors other migration groups still use. `GanttTableView` still imports
react-bootstrap `ProgressBar`. Package removal and baseline deletion belong to #1384.

## Verification

Behavioural tests cover label-colour and percentage validation, the stop-conflict dialog
(labelled field, range description, invalid state, disabled confirm), timeline segment
geometry, the Now line and planned/break states, weekly rings and copy cells, and category
tinting. The validation and invalid-state tests were mutation-checked. Visual review covered
the daily view (idle, planned rows, Now/gap indicators, error alert), weekly view, label modal,
label/template settings panels and template modal in light and dark at 1280px and 390px.
