# Onboarding wizard migration (#1396)

`WelcomeWizard` and all nine `components/wizard/Step*` files now use owned UI components and
prefixed Tailwind utilities; no react-bootstrap imports or Bootstrap layout/control classes remain
there.

## Decisions

- `Button`, `Alert`, `Badge`, `Card`, `Progress`, `Spinner`, `Switch`, `Field*` and `Separator`
  replace their react-bootstrap counterparts; `Grid`/`GridItem` replace `Row`/`Col`. The existing
  Base UI `Dialog` (focus on open, no pointer dismissal) and `Hint` tooltip are unchanged.
- Step configuration (`wizardStepConfig.ts`), the optional-feature flow and the setup logic are
  untouched; only markup changed.
- `wizard/WizardParts.tsx` holds the two patterns repeated across steps: `WizardActions` (back/next
  footer that stacks with the primary action on top below `sm`, replacing Bootstrap `order-*`
  classes) and `WizardToggle` (labelled switch plus the opt-out hint).
- Feature switches are Base UI switches, so tests query `getByRole("switch")`. The opt-out hint is
  wired with `aria-describedby` while it is visible.
- Schedule options expose their selection with `aria-pressed` instead of only a colour change.
- The two country pickers on the work-location step now have visible `<label for>` associations
  (`CountrySelect`'s existing `inputId`) in addition to the `aria-label`.
- The progress bar is the owned `Progress` (4px default track) with the translated `aria-label`;
  the inline `height` is gone. The account step badge uses `Badge` instead of an inline `fontSize`.
- The `.team-btn` hover lift is dropped; team buttons are plain outline buttons with the shared
  hover/focus styles.

## Legacy cleanup

The generated legacy class inventory went from **2,282 to 2,278** classes. Removed: `.icon-display`,
`.icon-feature`, `.team-btn` and `.selected` (only ever used as `.team-btn.selected`). The
`WelcomeWizard.tsx` and `Step9AccountSetup.tsx` entries were removed from
`legacy-inline-styles.json`.

Still shared with another area: `.icon-lg` (`TransferView`) and the global Bootstrap
layout/control selectors other migration groups still use. Package removal and baseline deletion
belong to #1384.

## Verification

Behavioural tests cover the switch toggle and its opt-out hint (mutation-checked: dropping
`aria-describedby` fails it), the labelled progressbar, the pressed schedule option and the labelled
country pickers; the existing wizard flow, loading, change-flow and integration tests were updated
to the switch role. Visual review covered every step in light and dark at 1280px and 390px,
including the cross-border step with the pickers expanded.
