# Frontend data standard (TanStack Query + TanStack DB)

This repository uses a single frontend server-state pattern:

- **TanStack Query** provides fetch lifecycle and cache orchestration.
- **TanStack DB QueryCollection** owns local observable state for sync-managed domains.
- **One domain → one state path**. Do **not** add standalone `useQuery` for a domain that already has a QueryCollection.

## Collection-backed domains (sync-managed)

These domains must be read/written through collections in `/tmp/workspace/tjorim/worktime/frontend/src/db/collections.ts`:

- Time tracking: `tasks`, `templates`, `labels`
- Work locations
- Gantt tasks
- Time-off entries

## Non-collection domains

The following remain non-collection by design:

- **Preferences/settings sync metadata**: synchronized via `/api/preferences` helpers in `syncClient.ts` and `SettingsContext`, not QueryCollection-backed.
- **Read-only external/computed lookups**: `useOpenHolidays`, `useLongWeekend`, `usePaydates` (plain `useQuery` is allowed).

## Guardrails

- Static architecture test: `/tmp/workspace/tjorim/worktime/frontend/tests/architecture/frontendDataStandard.test.ts`
  - allows plain `useQuery` only in approved read-only hooks
  - forbids `useQuery` calls using `["sync", ...]` query keys
- Existing collection-backed hook tests cover load/update/delete/reset flows.

## Where to add a new server-state domain

1. If the domain is sync-managed or shared mutable app state, add a QueryCollection in `collections.ts` and consume it via `useLiveQuery`.
2. If the domain is strictly read-only external lookup data, add a plain `useQuery` hook and keep it out of `["sync", ...]` keys.
3. Add/update tests to cover loading, update, deletion, and reset behavior for the chosen path.
