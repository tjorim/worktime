# Worktime Development Roadmap

**Current Version**: 4.7.0
**Branch**: `main`
**Status**: Active Development

## Overview

To-do list and development roadmap for Worktime. Audited against the codebase on 2026-05-31.

---

## Next Up

### 1. Cross-Schedule Overlap Detection in TransferView

- **What exists**: TransferView already has a schedule selector (`onChangeSchedule` prop), date range filtering, and grouped accordion layout.
- **What's missing**: Overlap calculation logic — computing which working hours a user on schedule A shares with a team on schedule B, and surfacing those as a timeline.
- **Files to modify**:
  - `src/components/TransferView.tsx` — render overlap periods alongside handover moments
  - `src/utils/shiftCalculations.ts` — add cross-schedule overlap detection utilities
- **Estimated effort**: 2–3 hours
- **Status**: 🔲 Planned

---

## Backlog — Code Quality

### 2. Reusable TeamSelector Component

- **What exists**: Team selection is implemented inline in at least `TransferView.tsx` and `ScheduleDetailModal.tsx` using `Form.Select`.
- **What's missing**: `src/components/common/TeamSelector.tsx` — a shared component with standard props (`selectedTeam`, `availableTeams`, `onChange`, `label`).
- **Files to modify**:
  - Create `src/components/common/TeamSelector.tsx`
  - `src/components/TransferView.tsx` — replace inline select
  - `src/components/schedule/ScheduleDetailModal.tsx` — replace inline select
- **Estimated effort**: 2–3 hours
- **Status**: 🔲 Planned

---

## Backlog — Features

### 3. ScheduleDetailModal — Export Button

- **What exists**: The modal is complete — 7-day view, shift distribution, weekly statistics, responsive desktop table and mobile cards.
- **What's missing**: An export action in `Modal.Footer` (currently only a Close button). Export format TBD — `.ics` one-time download or PDF.
- **GitHub issue**: #274
- **Files to modify**: `src/components/schedule/ScheduleDetailModal.tsx`
- **Estimated effort**: 1–2 hours
- **Status**: 🔲 Planned

### 4. Time-Off Overlays on TransferView

- **What exists**: `TimeOffView` shows events separately. `ScheduleView` already has overlay dots (shipped in v4.7.0).
- **What's missing**: Time-off event indicators (vacation, business trips) overlaid on TransferView items so absence is visible alongside transfer points.
- **Files to modify**: `src/components/TransferView.tsx`
- **Estimated effort**: 2–3 hours
- **Status**: 🔲 Planned

### 5. iCal Subscription Link

- **What exists**: Backend REST API for time-off CRUD is complete (auth, DB models, GET/POST/PATCH/DELETE). The previous blocker ("backend must be in place first") is resolved.
- **What's missing**: A `/api/ical/subscribe` endpoint returning an RFC 5545 `.ics` feed combining shifts and time-off, plus a frontend UI to surface the subscription URL.
- **Notes**: Shifts are currently client-computed, so the backend feed must replicate the shift calculation logic for the user's team and schedule type. A subscription link auto-refreshes in calendar apps; prefer it over a one-time download.
- **Files to modify/create**:
  - `backend/app/routers/ical.py` — new endpoint
  - Frontend settings panel — show subscription URL
- **Estimated effort**: 4–6 hours
- **Status**: 🔲 Planned

---

## Backlog — UI / UX

### 6. Advanced Accessibility

- **What exists**: Extensive ARIA coverage (aria-label, aria-hidden, aria-describedby throughout), screen reader enhancements and focus management shipped in v4.6–4.7.
- **What's missing**: High-contrast mode, font size scaling (75–150%), and `prefers-reduced-motion` support. Needs an `AccessibilityContext` and a settings panel section.
- **GitHub issue**: #270
- **Estimated effort**: 3–4 hours
- **Status**: 🔲 Planned

### 7. Notification System

- **What exists**: `ToastContext` (success/error/warning/info with auto-dismiss), a notifications on/off toggle in SettingsContext, and the toggle UI in SettingsGeneralSection.
- **What's missing**: Browser Notification API integration and shift reminder scheduling (e.g. 15 min before shift start).
- **Constraint**: PWA service workers were intentionally removed in v4.6.0 to avoid cache-related issues. Push notifications via a service worker would require re-enabling PWA infrastructure. Browser Notification API (foreground-only) can be done without a service worker.
- **GitHub issue**: #271
- **Estimated effort**: 4–5 hours (foreground-only); more if push/background is required
- **Status**: 🔲 Planned

### 8. PWA Installation Prompts

- **What exists**: Nothing — PWA functionality was removed in v4.6.0.
- **What's needed**: Smart install prompts triggered by user engagement signals (`beforeinstallprompt` event), with dismissal memory.
- **Constraint**: Requires re-enabling the service worker removed in v4.6.0. Evaluate whether the original cache issues can be avoided with a minimal service worker scope.
- **GitHub issue**: #273
- **Estimated effort**: 3–4 hours
- **Status**: 🔲 Planned

### 9. Mobile Carousel for Team View

- **What exists**: Nothing.
- **What's needed**: Swipe-through team browsing on mobile using `react-bootstrap/Carousel`, with desktop fallback (buttons or tabs).
- **Estimated effort**: 5–6 hours
- **Status**: 🔲 Future

### 10. Floating Action Button

- **What exists**: Nothing.
- **What's needed**: Fixed-position button with a quick-action menu (team switch, add time-off, add to calendar). Needs keyboard navigation and mobile-safe positioning.
- **Estimated effort**: 2–3 hours
- **Status**: 🔲 Future

---

## Backlog — Integrations

### 11. Pebble Companion App — Device Testing & Scoped Tokens

- **What exists**: `pebble/` — an Alloy watch app for clock in/out + active-task glance (issue #996), talking
  to the existing time-tracking endpoints via a phone-side (`pkjs`) companion. Its `/pebble-pair` webview
  authenticates the user with OIDC, then rotates a Pebble-only personal access token; the watch never
  receives the OIDC access or refresh token.
- **What's missing**: Real device/emulator testing — written against the published Alloy docs, but this repo
  has no Pebble SDK/CLI, so nothing here has actually been built or run on hardware yet. Tokens are already
  scoped to `pebble:read`/`pebble:write` (not full account access), and sensitive account/token-management
  operations require an interactive OIDC session regardless of token scope. Worth revisiting later: even
  more granular Pebble permissions (e.g. a clock-only scope) once there's a second companion-app use case.
- **Files**: `pebble/`, `backend/app/routers/access_tokens.py`, `backend/app/services/access_token_service.py`,
  `frontend/src/components/settings/account/SettingsApiTokensSection.tsx`, `frontend/src/pages/PebblePairPage.tsx`
- **Status**: 🟡 MVP built, untested on hardware

---

## Aspirational — Long-Term

### 12. Real-Time Team Collaboration (shared time-off)

- **What exists**: Backend REST API for time-off CRUD is complete (auth, DB, GET/POST/PATCH/DELETE). `EventStoreContext` is ready to receive `syncWithBackend()` and `subscribeToUpdates()` methods.
- **What's missing**: The sync layer — frontend calling the backend API — and then real-time broadcast.

**Phase 1 — Manual sync** (6–8 hours)
- "Sync to team" button in settings
- Pull team members' time-off from the API
- Show team events read-only alongside personal events

**Phase 2 — Real-time sync** (8–12 hours)
- SSE or WebSocket for live updates (SSE already used for `sync_changed` events — reuse `SyncSignalTransport`)
- Auto-sync on changes; read-only team events update instantly

**Phase 3 — Multi-user editing** (12–16 hours)
- Write access for other users' team events
- Conflict resolution
- Approval workflow for vacation requests

**Architecture**: Extend `EventStoreContext` with backend sync methods (Option A from original design). Shifts remain client-computed.

- **Total estimated effort**: 40–60 hours
- **Status**: 🔲 Aspirational

---

## Dropped / Resolved

| Item | Reason |
|------|--------|
| Enhanced Error Boundaries | `ErrorBoundary.tsx` with HOC wrapper already exists and is in use. Expand usage on a case-by-case basis rather than as a planned initiative. |
| ScheduleDetailModal display improvements | Fully shipped in v4.7.0 (shift distribution, weekly stats, responsive views). Only export remains — see item 3. |
| State management migration (Zustand) | Moved to future considerations only; not a planned initiative. |

---

## Future Considerations (not planned)

- **Zustand migration** — Replace Context API + useReducer with Zustand for structural sharing, undo/redo middleware, and granular subscriptions. +15 KB bundle (Zustand + Immer). Consider when adding a second store.
- **User account system** — Optional cloud sync on top of the current localStorage-first approach; hybrid model preserving offline capability.

---

**Last updated**: 2026-05-31
**Next review**: After v4.8.0
