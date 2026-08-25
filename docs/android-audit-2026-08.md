# Android quality and parity audit (August 2026)

## Scope and method

This audit covers every tracked file below `android/`: Gradle/release configuration,
the manifest and resources, authentication, storage and networking, repositories,
all Compose destinations and their loading/empty/error states, and JVM tests. The
review was static plus local lint/unit/build checks; it was compared with the
responsive web feature set and source, not represented as a device usability study.
The screen-state capture checklist below is deliberately explicit so a release
reviewer can repeat the remaining TalkBack and physical-device observations.

## Findings and disposition

| Severity | Evidence / reproduction | Finding | Disposition |
|---|---|---|---|
| Critical | Kill the process after loading Today; no receiver or alarm existed and notification calls were inside `WorktimeApp`'s `LaunchedEffect`. | Shift and stale timer reminders could not fire closed-app. | Fixed by the persisted `ReminderScheduler`, alarm receiver, restore receiver, and account validation. Shift reminders are recomputed from stored shift date and start time after timezone changes to ensure correct local alarm times. |
| High | Change account after an alarm was calculated. The previous in-memory dedupe key had no account identity. | A future implementation could leak a prior account's reminder. | Fixed: reconciliation cancels on identity change, logout clears state, receiver validates account. |
| High | Deny exact-alarm capability on Android 12+. | Exact scheduling had no degradation path. | Fixed: exact-while-idle when available, otherwise inexact while-idle. Notification denial remains a safe no-op. |
| Medium | Rotate, background, and restore each destination. | Navigation route is saveable through Navigation Compose, but transient form edits are not consistently state-restored after process death. | Follow-up: introduce `SavedStateHandle` for editable time-off and task forms. |
| Medium | Disable connectivity and cold-launch. | Repository requests expose loading/error/retry, but there is no durable read cache or visible staleness timestamp. | Follow-up: Room-backed last-known dashboard with explicit Offline/Stale treatment. |
| Medium | Enable large font and TalkBack; inspect dense Today and Settings controls. | Material controls provide baseline semantics, but screen headings, grouped card semantics, focus order, and 200% text layout are not device-tested. | Follow-up: semantics/UI-test pass using font scale 2.0 and TalkBack. |
| Medium | Inspect `WorktimeRepository` and dashboard refresh. | A refresh fans out multiple requests and there is no connectivity-triggered reconciliation policy. | Follow-up: consolidate refresh ownership and add constrained one-shot WorkManager reconciliation, not periodic reminders. |
| Low | Inspect theme and screens against the web app. | Native colors are coherent but spacing, state surfaces, and typography have no named design tokens or screenshot contract. | Proposed system below; implement incrementally. |
| Low | Inspect test tree. | Repository/view-model/auth tests exist; there are no Compose UI, navigation, receiver instrumentation, screenshot, or accessibility tests. | Add device matrix and deterministic screenshot tests before visual redesign. |

Authentication uses AppAuth and encrypted session storage, refreshes access tokens,
clears sessions on terminal authorization failure, and supports an interactive
end-session flow. Release configuration requires signing/API/pinning inputs;
debug permits cleartext only for emulator development. No embedded production
secret was found. Certificate pins introduce an availability tradeoff and the
documented backup-pin rotation procedure must remain part of release operations.

## Capability and UX matrix

| Experience | Responsive web | Android | Decision |
|---|---|---|---|
| Today/current status and timer actions | Full | Native cards and actions | Required parity; keep native card/action layout. |
| Upcoming shifts and team status | Full | Read-only destinations | Required parity. |
| Time off | Summary and editing | Summary and form | Required parity; use native date pickers/dialogs. |
| Labels/templates and work location | Full | Settings/actions | Required parity where mobile workflows benefit. |
| Gantt, transfer, calendar power views | Full | Absent | Deliberately web-only until a mobile use case is approved. |
| Account/API settings | Full | Focused native settings | Native pattern; do not reproduce desktop sections. |
| Loading/empty/error | Per view | Generic read-model treatment | Required parity; add explicit offline/stale variants. |
| Authentication and biometric lock | OIDC/PWA | AppAuth plus native biometric gate | Better expressed natively. |
| Theme | Light/dark/system | System-derived light/dark | Required parity, with Android dynamic behavior remaining native. |

**Intended scope:** Android is a focused companion for glanceable status and
frequent mobile actions. Product parity means consistent facts, permissions,
and outcomes—not duplicating every PWA administration or planning surface.

## Proposed Worktime Android design system

* **Color roles:** Material 3 `primary` for Worktime brand/action, `secondary`
  for schedule accents, `tertiary` for time tracking, semantic error/warning and
  success containers, and surface-container levels rather than custom shadows.
* **Type:** system-scalable Material display-small for today's key fact,
  title-large for destinations, title-medium for cards, body-medium and
  label-large for actions. Never encode status with type size or color alone.
* **Spacing:** 4 dp base; 8 dp inline, 12 dp compact card, 16 dp standard inset,
  24 dp section, 32 dp major separation. Minimum interactive target 48 dp.
* **Shape:** 12 dp cards, 16 dp prominent summary surfaces, pill shapes only for
  filters/status chips. Use tonal elevation and restrained dividers.
* **Components:** `StatusHero`, `ScheduleCard`, `StatePane`, `WorktimeListRow`,
  confirmation dialog, and full-width primary action. Components own semantic
  headings and state descriptions.
* **Icons:** Material symbols with a text/semantic label; decorative icons are
  excluded from accessibility. Never rely on icon or color alone.
* **State treatment:** skeleton only for initial load; cached content remains
  visible beneath an Offline/Stale banner; empty states explain the next action;
  errors preserve context and expose Retry; destructive actions require explicit
  confirmation.

## Prototype specification

The main navigation remains a Material bottom navigation on compact phones, with
Today centered as the default high-frequency destination; wider screens graduate
to a navigation rail. Today begins with a `StatusHero` (current shift/off-day and
next transition), followed by the running-timer action surface and next-shift card.
Team and Upcoming use consistent list rows. Settings uses grouped native list
sections rather than web cards. These specifications are the before/after prototype
contract; broad UI changes are intentionally not bundled with this audit.

## Screen and state capture manifest

Capture Login, biometric locked/unavailable/prompting, Today (loading/error/off-day/
working/running timer), Upcoming (loading/empty/populated/error), Team (same), Time
off (summary/empty/form/validation/error), and Settings (all sections, permission
denied, destructive confirmation). Capture each on a compact phone (360×800 dp) and
large phone (412×915 dp), light and dark, plus one 200% font/TalkBack pass. Store
approved artifacts under `docs/screenshots/android/` named
`<screen>-<state>-<size>-<theme>.png`. Screenshots are intentionally not fabricated
from static source; this manifest is the reproducible device capture protocol.

## Prioritized roadmap

1. **P0 – reliable reminders (#1191):** persisted alarms, lifecycle triggers,
   permission degradation, dedupe, account isolation, and tests.
2. **P1 – offline truth:** durable read cache, stale age, connectivity transitions,
   and reconciliation tests.
3. **P1 – accessibility/device harness:** Compose semantics tests, font-scale and
   TalkBack audit, screenshot matrix, and 48 dp target enforcement.
4. **P1 – process restoration:** `SavedStateHandle` for forms, navigation/deep-link
   tests, and account-switch integration coverage.
5. **P2 – design tokens/components:** introduce the system above and migrate Today,
   then list destinations, in separately reviewable visual changes.
6. **P2 – refresh efficiency:** single refresh coordinator and constrained
   WorkManager reconciliation with network/battery measurements.
7. **Decision gate:** validate demand before adding Gantt, transfer, or admin
   surfaces; absent approval, those remain web-only.
