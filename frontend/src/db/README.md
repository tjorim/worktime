# Frontend data standard (TanStack Query + TanStack DB)

This repository uses a single frontend server-state pattern:

- **TanStack Query** provides fetch lifecycle and cache orchestration.
- **TanStack DB QueryCollection** owns local observable state for sync-managed domains.
- **One domain → one state path**. Do **not** add standalone `useQuery` for a domain that already has a QueryCollection.

## Collection-backed domains (sync-managed)

These domains must be read/written through collections in `src/db/collections.ts`:

- Time tracking: `tasks`, `templates`, `labels`
- Event store / synced events: `timeOffCollection` (consumed via `EventStoreContext`)
- Work locations
- Gantt tasks
- Time-off entries (same underlying collection used by the event store)

## Non-collection domains

The following remain non-collection by design:

- **Preferences/settings sync metadata**: synchronized via `/api/preferences` helpers in `syncClient.ts` and `SettingsContext`, not QueryCollection-backed.
- **Read-only external/computed lookups**: `useOpenHolidays` (and wrappers like `useLongWeekend` and `usePaydates`) may use plain `useQuery`.

## Guardrails

- Static architecture test: `tests/architecture/frontendDataStandard.test.ts`
  - allows plain `useQuery` only in approved read-only hooks
  - forbids standalone `useQuery` calls using `["sync", ...]` query keys
  - allows `queryKey: ["sync", ...]` only in `src/db/collections.ts`
- Existing collection-backed hook tests cover load/update/delete/reset flows.

## TanStack Form/Table adoption

- Use **TanStack Form** for multi-step or modal forms with cross-field validation and submit-state handling (for example template editing in time tracking).
- Use **TanStack Table** for dense operational summaries that benefit from reusable sorting/filtering/column visibility (for example yearly work-location summaries).
- Keep simple forms/lists on local component state when they do not need richer table/form state features.
- TanStack Form/Table adoption must stay aligned with this data standard: mutation/fetch paths still go through existing TanStack Query + QueryCollection flows.

## Where to add a new server-state domain

1. If the domain is sync-managed or shared mutable app state, add a QueryCollection in `collections.ts` and consume it via `useLiveQuery`.
2. If the domain is strictly read-only external lookup data, add a plain `useQuery` hook and keep it out of `["sync", ...]` keys.
3. Add/update tests to cover loading, update, deletion, and reset behavior for the chosen path.
