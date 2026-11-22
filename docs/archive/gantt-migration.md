# Gantt migration (#1397)

`GanttView`, `GanttTableView`, `GanttTaskModal` and `GanttChart` no longer import react-bootstrap or use
Bootstrap layout/control classes. frappe-gantt stays the timeline renderer.

## Decisions

- `Button`, `Progress`, `Field*`, `Input` and `Textarea` replace their react-bootstrap counterparts, and
  `ListGroup` became a semantic `<ul>`/`<li>` list separated by `tw:divide-y`. The table hooks, direct row
  buttons, `ConfirmationDialog` and the dynamic label chip (`--label-bg`/`--label-fg`) are unchanged.
- The chart/table switch and "Add Task" button are plain `Button`s; the pressed state is still
  `aria-pressed`.
- The task modal's two pickers use `DialogSelect` (menu portalled into the dialog's modal scope) with
  `selectClassNames`, so the dropdown is no longer clipped by the scrolling dialog body.
- Field errors (`FieldError`, `role="alert"`) render only after a submit attempt and are linked to their
  input through `aria-invalid`/`aria-describedby`.
- The progress input stays a native `<input type="range">` (`tw:accent-primary`), now labelled through
  `FieldLabel htmlFor`; no Base UI slider was generated for this single use.
- The table's progress cell is a Base UI `Progress` named "Progress" with `aria-valuenow`.

## Vendor styling

`src/features/gantt/gantt.css` (imported by `GanttChart`) holds everything the chart needs:

- `frappe-gantt.css` is imported into a new `gantt` layer, declared between `calendar` and `components` in
  both `main.scss` and `tailwind.css`, so it sits below utilities (it used to live in `legacy`).
- The scroll container is `[data-slot="gantt-scroll"]`; its `--g-*` variables map onto the runtime
  `--wt-theme-*` tokens, so both themes follow the app. Previously frappe's own dark palette only applied
  under `html[data-theme="dark"]`, which the app never sets, so the chart stayed light in dark mode.
- The vertical-scroll suppression moved from `_utilities.scss` into that file, scoped to the container.
- Holiday/weekend backgrounds passed to frappe use `--wt-theme-warning-bg` and `--wt-theme-secondary`
  (new runtime token `--wt-theme-warning-bg`, plus `--wt-theme-muted-foreground`, which `--color-muted-foreground`
  now reads). They still resolve to the Bootstrap values until #1384 repoints the tokens.

## Legacy cleanup

| | Before | After |
| --- | --- | --- |
| `legacy-classes.json` | 2,276 | 2,275 |
| `legacy-inline-styles.json` | no gantt entries | unchanged |

- Removed `.gantt-scroll-container` and the `gantt-view` DOM hook (no CSS, unused by tests).
- frappe-gantt's own classes remain in the list because the generator still reads its stylesheet; they go
  with the package decisions in #1384.
- `gantt.css` is included in the generator's inputs.

## Verification

Targeted tests: field errors linked to the invalid input and cleared when fixed, end-before-start
rejection, the labelled progress slider, the named table progress bar and the scoped, token-based scroll
container (`tests/features/gantt/*`). Visual review covered the empty chart, populated chart and table,
and the add (with validation error) and edit modals in light and dark at 1280px and 390px.
