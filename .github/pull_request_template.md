## Change

Describe the problem and resulting behaviour.

## Validation

List the checks run and material limitations.

## UI dependency or shared-component changes

For Base UI/shadcn updates, follow [the UI maintenance workflow](https://github.com/tjorim/worktime/blob/main/docs/ui-maintenance.md).

- [ ] Run `ui:check` and `ui:test` from the app package directory.
- [ ] Review runtime release notes and affected direct primitive consumers.
- [ ] Compare captured upstream changes and local registry diffs where applicable; record keep/apply decisions without overwriting app customisations.
- [ ] Record interaction, theme/mobile/localisation and bundle validation, including any independently reproduced baseline failures. Update reviewed snapshots only after the corresponding source review.
