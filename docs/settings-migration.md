# Settings and account migration (#1395)

`SettingsPage` and every `components/settings/**` section now use owned UI components and prefixed
Tailwind utilities; no react-bootstrap imports or Bootstrap layout/control classes remain there.

## Decisions

- `Button`, `Alert`, `Badge`, `Card`, `Spinner`, `Switch`, `Checkbox`, `Input`, `NativeSelect`,
  `Field*` and `Separator` replace their react-bootstrap counterparts. `ListGroup` became semantic
  `<ul>`/`<li>` lists separated by `tw:divide-y`. Dialogs, popovers, tooltips and the
  `AdminUsersTable` hooks (`useDataTable`, owned `Table`) are unchanged; its last Bootstrap body-cell
  utilities were swapped for Tailwind ones.
- `settings/SettingsParts.tsx` holds the patterns repeated across sections: `SettingsSection`
  (titled `<section>` with an `aria-labelledby` heading), `SettingsList`/`SettingsItem`,
  `SettingsRow` (text left, control right, wrapping on narrow screens), `SettingsActionRow` (a
  ghost-button row), `SettingsSwitchRow`, `SettingsLoading`, `SettingsHint` and `SettingsSecret`.
- Feature and notification toggles are Base UI switches, so tests query `getByRole("switch")`.
  Their accessible name is now the translated row title (it used to be hard-coded English
  "Toggle time off" etc.) and the row description is wired through `aria-describedby`; clicking the
  row text toggles the switch.
- The About and Data rows are real buttons. A row that cannot act (install unavailable, restore in
  progress) is natively `disabled` instead of `aria-disabled`.
- Schedule options expose their selection with `aria-pressed`. The "coming soon" badge uses the
  shared `Badge`, so its inline `fontSize` is gone.
- The sync status tone was a dynamic `text-${variant}` Bootstrap class; it is now a static lookup of
  semantic Tailwind text tokens.
- The page header, section nav and content use `Card`/token utilities. The 1080px content width is
  the `--container-settings` theme token (`tw:max-w-settings`) instead of an inline `maxWidth`. The
  desktop section list is wrapped in a labelled `<nav>` and marks the active item `aria-current`.
- `FieldDescription` is a `<p>`, which Bootstrap's reboot gives a bottom margin; the three settings
  uses pass `tw:mb-0`.

## Legacy cleanup

The generated legacy class inventory is unchanged at **2,278** classes: the settings screens only
consumed Bootstrap-provided selectors (`list-group`, `form-check`, `alert`, `badge`, `d-flex`, …) and
owned no custom selectors of their own. Those Bootstrap selectors are still used by the time-off,
gantt and transfer areas, so they leave with their last consumer and with #1384. The
`SettingsPage.tsx`, `SettingsFeaturesSection.tsx` and `SettingsScheduleSection.tsx` entries were
removed from `legacy-inline-styles.json`; `TransferView.tsx` is the only allowance left.

## Verification

Behavioural tests cover the labelled/described switches including label-text clicks
(mutation-checked: dropping `aria-describedby` fails it), schedule `aria-pressed` and disabled
options, the labelled account region, and the updated install/notification/feature/reset flows. The
integration-client admin scope is queried as a checkbox by name.

Visual review covered every section in light and dark at 1280px and 390px, signed in (mocked
backend) and signed out, using the MSW dev server.
