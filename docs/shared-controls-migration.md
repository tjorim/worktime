# Shared controls and feedback migration (#1390)

The shared controls, feedback, informational/conflict/backup dialogs and standalone
pages now use owned UI components and prefixed Tailwind utilities. Dialog and alert
dialog focus management, inertness and scroll locking still come from Base UI.
All dialog body consumers use the same padding and scrolling utilities.

## Decisions

- Keep `react-select` for CountrySelect and the shared label, task and team pickers.
  Search, clearing, disabled controls and existing option resolution stay intact.
  `selectClassNames` owns their token styles; `bootstrapSelectClassNames` remains an
  export alias for consumers in product areas that have not migrated yet.
- Use Base UI Menu with a virtual pointer anchor for ContextMenu. Base UI handles
  viewport collision detection, keyboard navigation, disabled actions and focus
  restoration. Disabled items remain keyboard discoverable and cannot activate.
- Keep the existing toast context API and duration rules. Owned feedback preserves
  action buttons, live announcements, explicit dismissal and remaining-time
  accounting. Autohide pauses while either pointer hover or keyboard focus remains.
  PWA install/update prompts continue using that same context.
- Keep task, shift, date and countdown logic custom. Shift badges resolve token
  utilities from the roster's semantic shift name and use the off palette when
  the day is not worked. Running-task label colors use validated CSS variables.
- Share `Grid`/`GridItem`, field primitives, badges, alerts, cards, progress,
  textarea, checkbox and switch components from `components/ui/`. External
  anchors use the shared button recipe. Keep `tw:` and Bootstrap theme variables
  throughout coexistence.

## Legacy cleanup

The generated legacy class inventory decreased from **2,357 to 2,333** classes.
Removed owned context-menu, dialog, shift-badge sizing, sync feedback/motion,
error-stack, toast-icon, date-picker and icon selectors. The decorative icon
wrapper now uses an owned `icon-em` utility.

Removed inline-style allowances for ContextMenu, EmptyState, TaskEntryForm,
ToastContext and PrivacyPage. TaskEntryForm retains only validated custom color
properties, which need no migration-baseline allowance.

Selectors still shared with another area remain:

- `.shift-*` and event palette classes: schedule, status and calendar consumers.
- `.cursor-help`: the personalised status component.
- `.time-tracking-label` and code-block helpers: time-tracking views.
- `.icon-display`, `.icon-feature`, `.icon-lg` and `.progress-thin`: wizard,
  settings and other product-area consumers.
- Global Bootstrap layout/control selectors: other migration groups still use
  them. Package removal, global token/prefix changes and baseline deletion belong
  to #1384.

## Verification

Behavioural coverage checks menu keyboard selection/dismissal and focus return,
labelled form fields, keyboard checkbox activation, short-task break restrictions,
footer submission and toast focus/hover timing. The toast regression test was
also checked against a temporary mutation that removed the focus pause.

Visual review covers light/dark at 1280px and 390px, including idle/running/empty
forms, disabled controls, validation feedback, searchable country selection,
backup/conflict/confirmation/informational dialogs, toast actions, error feedback,
privacy, sign-in completion, watch pairing loading/sign-in/error/success states,
and the actual About dialog. Screenshots are saved as review artifacts
for the eventual PR; the temporary screenshot harness is not part of the app.

Validation: lint, formatting, app/test type checks, 2,011 tests across 132 files,
two light/dark coexistence browser tests and the production build passed.
