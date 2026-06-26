# Code Review & Optimization Plan

> Reviewer pass over the Worktime frontend (`frontend/src`) and supporting
> backend layout. The codebase is mature and well-maintained — strict
> TypeScript, ~88 test files, i18n via Paraglide, near-zero `any`/`@ts-ignore`.
> The findings below are therefore about **structure, consistency, and
> performance**, not correctness gaps. Each step is atomic, preserves existing
> behavior, and touches a bounded set of files.

<analysis>
Here is my detailed review of the current codebase:

## 1. Code Organization & Structure

- **Two parallel architectural conventions.** Most UI lives under
  `src/components/**`, but a single feature has been migrated to a
  `src/features/calendar/**` "feature folder" layout (colocating
  `CalendarView.tsx`, `useCalendarRangeData.ts`, `mapToScheduleXEvents.ts`,
  `dragAndDropAdapter.ts`, `calendar.css`). This is a good target pattern, but
  having exactly one feature folder while everything else stays flat under
  `components/` is the worst of both worlds: contributors can't tell which
  convention to follow. Either commit to the feature-folder migration or pause
  it explicitly with a documented rule.

- **Duplicated CalendarView shipped as two tabs.** `MainTabs.tsx` imports both
  the legacy `@/components/CalendarView` (566 LOC) as `LegacyCalendarView` and
  the new `@/features/calendar/CalendarView` (323 LOC), exposing them as two
  separate tabs (`calendar` and `unified-calendar`). This is in-flight
  migration debt: two calendars to maintain, two sets of behavior to keep in
  sync, and a larger bundle. There is no feature flag gating the choice — both
  are always present. A migration plan with a cut-over path is needed.

- **Several oversized modules.** `db/collections.ts` (915), `utils/syncClient.ts`
  (875), `contexts/SettingsContext.tsx` (753), `utils/shiftCalculations.ts`
  (722), and the time-tracking views (`TimeTrackingDailyView` 655,
  `TimeTrackingWeeklyView` 640) are large enough that they mix multiple
  responsibilities. These are the natural seams for extraction (pure helpers,
  sub-views, custom hooks).

- **No route/tab code-splitting.** There is no `React.lazy` / `Suspense`
  anywhere. Heavy, rarely-first-painted features — Gantt (`frappe-gantt`),
  the Schedule-X calendar stack (`@schedule-x/*`), time tracking — are all
  pulled into the initial bundle even though they sit behind tabs and feature
  flags (`enableGantt`, `enableTimeTracking`). This is the single biggest
  low-risk performance win available.

## 2. Code Quality & Best Practices

- **`SettingsContext` is highly repetitive.** It defines ~20 near-identical
  `updateX` callbacks, each a `useCallback(setUserState(prev => ({...})))`
  wrapper differing only by the field path. The `normalizeUserState` validator
  repeats the same `typeof x === "..." ? x : default` shape per field. Both
  can be collapsed into small generic helpers (a field-setter factory and a
  declarative schema/validator map) without changing the public context API.
  This would cut the file substantially and make new settings one-liners.

- **No central logging abstraction.** There are ~59 raw `console.*` calls. Most
  are legitimate `console.error` in `catch` blocks, but they are unguarded and
  uncategorized. A thin `logger` util (dev-verbose, prod-quiet, single choke
  point for future telemetry) would standardize this and let lint forbid raw
  `console.*` going forward.

- **Context value composition.** `SettingsContext` bundles user settings,
  `lastUsed` UI state, onboarding state, and per-feature announcement flags in
  one provider. Any change to "last active tab" re-renders every consumer of
  settings. Splitting the volatile `lastUsed` slice from stable `settings`
  would reduce re-render fan-out, though this is a larger change and should be
  measured first.

- **Strengths worth preserving.** `strict: true` with `noUnusedLocals` /
  `noUnusedParameters`, almost no `any`, only 3 TODO/FIXME markers, consistent
  `@/` alias imports, centralized storage keys, and a documented
  notify-then-pull SSE contract. The optimization plan must not regress these.

## 3. UI/UX

- **Accessibility is partial but inconsistent.** 71 files use `aria-*` and
  decorative icons correctly carry `aria-hidden="true"`, and there's a
  `#main-content` skip target. But coverage is ad hoc — there's no shared
  pattern/lint ensuring every icon-only control has an accessible name. An
  audit pass plus a couple of reusable helpers would make this uniform.

- **Tab content is always mounted.** Only `unified-calendar` is guarded with
  `{activeKey === "unified-calendar" && <CalendarView />}`; the other tabs
  render eagerly. Combined with the lack of lazy-loading, inactive heavy tabs
  do mount/compute work. Consistent "render active tab only" + lazy boundaries
  improves perceived performance.

- **Error surfacing relies on console.** Several user-facing failures (e.g.
  `.hday` import/parse in `TimeOffView`) log to console and rely on
  surrounding toast handling; verifying every catch path produces a
  user-visible message (toast/inline) rather than a silent console line would
  tighten UX.
</analysis>

# Optimization Plan

## Code Structure & Organization

- [ ] **Step 1: Decide and document the calendar cut-over**
  - **Task**: Resolve the duplicate `CalendarView`. Either (a) make the legacy
    `calendar` tab delegate to the new `features/calendar/CalendarView` behind
    a developer-options flag, or (b) formally keep both with a documented
    rationale. Add a short ADR note describing the chosen direction so the
    migration intent is explicit. Do not delete the legacy file yet — gate it.
  - **Files**:
    - `frontend/src/components/MainTabs.tsx`: Gate which CalendarView renders;
      remove the always-on duplicate if (a) is chosen.
    - `frontend/src/contexts/DeveloperOptionsContext.tsx`: Add a flag (if (a)).
    - `docs/calendar-migration.md`: New ADR documenting the decision/cut-over.
  - **Step Dependencies**: None
  - **User Instructions**: Confirm whether `unified-calendar` is intended to
    replace `calendar` or coexist permanently.
  - **Success Criteria**: Only one calendar path is active by default; the
    other is reachable only via an explicit flag, and the intent is documented.

- [ ] **Step 2: Introduce lazy boundaries for heavy tabs**
  - **Task**: Wrap the heaviest, flag-gated tab views in `React.lazy` +
    `Suspense` so `frappe-gantt`, `@schedule-x/*`, and time-tracking code split
    out of the initial bundle. Add a lightweight fallback (existing spinner/
    skeleton). Keep behavior identical when a tab is opened.
  - **Files**:
    - `frontend/src/components/MainTabs.tsx`: Convert Gantt, time-tracking, and
      calendar tab content to lazily-loaded components with `Suspense`.
    - `frontend/src/components/gantt/GanttView.tsx`: Ensure default export /
      lazy-compatible entry.
    - `frontend/src/components/timeTracking/TimeTrackingView.tsx`: Same.
  - **Step Dependencies**: Step 1 (calendar settled first)
  - **Success Criteria**: `pnpm build` produces separate chunks for gantt /
    schedule-x / time-tracking; initial JS shrinks; all tabs still render.

- [ ] **Step 3: Render only the active tab**
  - **Task**: Apply the existing `activeKey === ...` guard pattern uniformly so
    inactive heavy tabs are not mounted. Verify nothing relies on a hidden
    tab's mounted side effects (e.g. background sync); leave those mounted at a
    higher level if so.
  - **Files**:
    - `frontend/src/components/MainTabs.tsx`: Guard each heavy `Tab` body.
  - **Step Dependencies**: Step 2
  - **Success Criteria**: Switching tabs mounts/unmounts content; existing
    integration tests for each tab still pass.

## Code Quality & Best Practices

- [ ] **Step 4: Add a shared `logger` utility and route console calls through it**
  - **Task**: Create a minimal `logger` (`debug`/`info`/`warn`/`error`) that is
    verbose in dev (`import.meta.env.DEV`) and quiet/forwarded in prod, as a
    single future telemetry choke point. Replace raw `console.*` calls with it.
    Keep `ErrorBoundary`'s console as-is or route it too.
  - **Files**:
    - `frontend/src/utils/logger.ts`: New utility.
    - Up to ~15 call sites across `hooks/useOngoingSync.ts`,
      `hooks/useSyncSignal.ts`, `components/TimeOffView.tsx`,
      `components/TeamScheduleView.tsx`, `components/timeTracking/*`: swap
      `console.*` → `logger.*`. (Split across two PRs if >20 files.)
  - **Step Dependencies**: None
  - **Success Criteria**: No raw `console.*` outside `logger.ts`; tests pass;
    dev logging unchanged in behavior.

- [ ] **Step 5: Collapse repetitive `SettingsContext` setters**
  - **Task**: Introduce a generic field-setter factory (e.g.
    `makeSettingUpdater("theme")`) to replace the ~20 near-identical
    `updateX` callbacks, preserving the exact public context API and memo
    identity semantics. Pure refactor — no consumer changes.
  - **Files**:
    - `frontend/src/contexts/SettingsContext.tsx`: Replace per-field callbacks
      with factory-generated ones.
  - **Step Dependencies**: None
  - **Success Criteria**: Public `SettingsContextType` unchanged; existing
    SettingsContext tests pass; file LOC meaningfully reduced.

- [ ] **Step 6: Make `normalizeUserState` schema-driven**
  - **Task**: Replace the repeated `typeof ... ? ... : default` validation
    blocks with a small declarative validator map (enum/boolean/country
    validators per field). Preserve every existing default and migration
    behavior, including the raw-state backup on migration error.
  - **Files**:
    - `frontend/src/contexts/SettingsContext.tsx`: Refactor `normalizeUserState`.
  - **Step Dependencies**: Step 5 (same file; sequence to avoid conflicts)
  - **Success Criteria**: All state-migration tests pass; identical normalized
    output for the same inputs (add a snapshot test if missing).

## Component Decomposition

- [ ] **Step 7: Extract time-tracking view sub-components/hooks**
  - **Task**: Break `TimeTrackingDailyView.tsx` (655) and
    `TimeTrackingWeeklyView.tsx` (640) into smaller presentational pieces and
    move calculation logic into hooks (reusing `timeUtils.ts`). No behavior or
    styling changes.
  - **Files**:
    - `frontend/src/components/timeTracking/TimeTrackingDailyView.tsx`
    - `frontend/src/components/timeTracking/TimeTrackingWeeklyView.tsx`
    - New `frontend/src/components/timeTracking/hooks/` modules as needed.
  - **Step Dependencies**: None
  - **Success Criteria**: Each file under ~400 LOC; time-tracking tests pass;
    no visual diff in screenshots.

- [ ] **Step 8: Split `lastUsed` UI state from `settings` (measured)**
  - **Task**: If profiling shows re-render fan-out, move the volatile
    `lastUsed` slice into its own context/provider so changing the active tab
    doesn't re-render settings consumers. Keep a thin compatibility shim if
    needed. Gate this on an actual measurement.
  - **Files**:
    - `frontend/src/contexts/SettingsContext.tsx`
    - New `frontend/src/contexts/LastUsedContext.tsx` (if pursued)
    - Consumers reading `lastUsed` (update imports).
  - **Step Dependencies**: Steps 5–6
  - **User Instructions**: Profile first; only proceed if re-renders are a real
    cost.
  - **Success Criteria**: Tab switches no longer re-render settings-only
    consumers; all tests pass.

## UI/UX & Accessibility

- [ ] **Step 9: Accessibility audit for icon-only controls**
  - **Task**: Sweep icon-only buttons/links for missing accessible names; add
    `aria-label`/`visually-hidden` text where absent. Add one or two reusable
    helpers (e.g. an `IconButton` wrapper) to make the correct pattern the
    default.
  - **Files**:
    - `frontend/src/components/shared/` (new `IconButton.tsx` helper)
    - Up to ~12 component files with bare icon buttons (toolbars, navigation
      groups, context menus).
  - **Step Dependencies**: None
  - **Success Criteria**: Every interactive icon-only control has an accessible
    name; no regression in existing `aria-*` usage; tests pass.

- [ ] **Step 10: Guarantee user-visible error surfacing**
  - **Task**: Audit `catch` blocks that currently only `console.error`
    (e.g. `.hday` import/parse in `TimeOffView`) and ensure each user-triggered
    failure also produces a toast/inline message via the existing `ToastContext`.
  - **Files**:
    - `frontend/src/components/TimeOffView.tsx`
    - Other catch sites identified in Step 4 lacking user feedback.
  - **Step Dependencies**: Step 4 (logger in place)
  - **Success Criteria**: Each audited failure path shows a user-facing message;
    tests cover at least the `.hday` import failure case.

## Tooling Guardrails

- [ ] **Step 11: Lint rule to forbid raw `console.*` and enforce conventions**
  - **Task**: Add an oxlint rule banning raw `console.*` (allow-list
    `logger.ts`), and optionally a rule nudging feature-folder imports. Wire
    into the existing `pnpm lint`.
  - **Files**:
    - `frontend/.oxlintrc.json` (or equivalent oxlint config)
  - **Step Dependencies**: Step 4
  - **Success Criteria**: `pnpm lint` fails on a newly introduced raw
    `console.log`; current code passes.

## Logical Next Step

After these steps, the highest-leverage follow-up is to **complete the
feature-folder migration** started in `src/features/calendar`: once the
calendar cut-over (Step 1) and lazy boundaries (Step 2) are in place, migrate
the next vertical slice (time tracking or gantt) into a `src/features/*`
folder, then update `AGENTS.md` to make the feature-folder layout the
documented standard so the structural inconsistency is resolved going forward.
</content>
</invoke>
