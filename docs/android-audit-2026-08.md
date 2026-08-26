# Android quality and parity audit (August 2026)

## Scope and method

This audit covers every tracked file below `android/`: Gradle/release configuration, the
manifest and resources, authentication, storage and networking, notification/reminder
scheduling, all Compose destinations, view models, and JVM tests. It was performed in two
passes. The first pass (recorded below as "Fixed") drove the reliable-reminders work now
closed by #1191. This second pass, for #1192, re-read the full source tree line by line
against the dimensions #1192 lists — auth lifecycle, background execution, offline/cache/
retry, notifications/deep links, API error handling, navigation/state restoration, privacy/
release config, accessibility, Compose performance/state ownership, and test/CI coverage —
and compared the result against the responsive web app's source (`frontend/src/`).

**What this audit is:** a static source review plus the existing local lint/unit/build
checks (`ktlintCheck`, `detekt`, `testDebugUnitTest`, `lintDebug`, `assembleDebug` — see
`.github/workflows/android.yml`), run from an environment with no Android SDK, emulator, or
physical device attached.

**What this audit is not:** a device usability study. No screenshot was captured and none is
fabricated from source. TalkBack traversal, physical font-scale rendering, and actual battery/
network measurements are called out explicitly below as unverified and captured in the device
manifest at the end of this document, which is the reproducible protocol for a reviewer with a
device to fill in. Every finding below is instead anchored to a concrete file, line range, and
(where the underlying mechanism is a well-documented platform behavior — e.g. `remember` vs
`rememberSaveable` across an Activity recreation) a stated reproduction path, so it can be
verified without a device.

## Findings and disposition

| Severity | Evidence / reproduction | Finding | Disposition |
|---|---|---|---|
| Critical | Kill the process after loading Today; no receiver or alarm existed and notification calls were inside `WorktimeApp`'s `LaunchedEffect`. | Shift and stale timer reminders could not fire closed-app. | **Fixed** (#1191): persisted `ReminderScheduler` (`core/notifications/ReminderScheduler.kt`), `ReminderReceiver`/`ReminderRestoreReceiver`, and account validation. Shift reminders are recomputed from stored shift date and start time after timezone changes. |
| High | Change account after an alarm was calculated. The previous in-memory dedupe key had no account identity. | A future implementation could leak a prior account's reminder. | **Fixed**: `ReminderScheduler.reconcile()` cancels on identity change (`ReminderScheduler.kt:31-34`), logout clears state, `ReminderReceiver.onReceive` validates the stored account id before showing anything (`ReminderScheduler.kt:215-230`). |
| High | Deny exact-alarm capability on Android 12+. | Exact scheduling had no degradation path. | **Fixed**: `set()` uses `setExactAndAllowWhileIdle` when available, otherwise `setAndAllowWhileIdle` (`ReminderScheduler.kt:139-153`). Notification-permission denial is a safe no-op (`WorktimeNotifications.kt:92-96`). |
| High | Rotate the device while a time-off entry, label, or template dialog is open, or tap a reminder notification while one is open. | Rotation and `MainActivity.onNewIntent`'s unconditional `recreate()` (`MainActivity.kt:24-28`) both destroy and recreate the Activity; no `android:configChanges` is declared in `AndroidManifest.xml`. Several editable dialogs hold their field state in plain `remember`/class-backed `mutableStateOf` instead of `rememberSaveable`, so this silently discards whatever the user was typing — in some cases (`LabelManagementCard`'s `dialogTarget`, `LabelsTemplatesSettingsCards.kt:69`) it closes the edit dialog outright while a sibling flag on the same screen (`showCreateDialog`, line 70) survives, an inconsistency that makes the bug easy to miss in a quick read. | Follow-up: #1229. Also affects `TodayScreen.kt`'s inline task/work-location fields (lines 94-100) and all of `TimeOffEntryFormDialog.kt`'s `TimeOffFormFieldsState` (lines 81-119). |
| Medium | Inspect `WorkLocationChipsRow` and the label color pickers. | The work-location chip's delete control is a raw `Text("✕")` in a bare `.clickable{}`, nested inside the chip's own `onClick`, with no `contentDescription` and a sub-48dp target (`TodayScreen.kt:363-372`). Label color swatches in `NewLabelDialog` (`TodayScreen.kt:471-486`) and `ColorPicker` (`LabelsTemplatesSettingsCards.kt:356-370`) convey selection only via a 2dp border, with no semantics and a 32dp target. | Follow-up: #1232. |
| Medium | Disable connectivity and cold-launch. | `WorktimeRepository` has no caching layer (`data/repository/WorktimeRepository.kt`); a failed fetch is `DashboardLoadResult.Error`, and `ReadModelScreen` has no distinct offline/stale-data rendering, only Loading/LoggedOut/Error/Success. | Follow-up: #1230 (durable last-known-dashboard cache with an explicit Offline/Stale banner). |
| Medium | Enable large font and TalkBack; inspect dense Today and Settings controls. | Material controls provide baseline semantics, but screen headings, grouped card semantics, focus order, and 200% text layout are not device-tested. `WorkLocationQuickChips`'s Home/Office `FilterChip`s also always pass `selected = false` for what are momentary actions, not toggles (`TodayScreen.kt:301-313`), which can announce an incorrect checkable state. | Follow-up: #1231 (device/TalkBack pass, once a UI test harness exists to anchor it). |
| Medium | Inspect `WorktimeRepository` and dashboard refresh. | A refresh fans out multiple requests (`DashboardViewModel.refreshActions`, `data/repository/WorktimeRepository.kt`) and there is no connectivity-triggered reconciliation policy beyond the existing FCM wake-and-reconcile path for reminders. | Tracked with #1230; #1201 (SSE live-update while foregrounded) covers the related "when to refresh" question separately. |
| Low | Read `ui/theme/Theme.kt`/`Color.kt` and `frontend/src/styles/_variables.scss` side by side. | Android defines exactly two hard-coded colors over Material 3's stock light/dark schemes — no typography, shape, or spacing scale exists at all, stronger than "no named tokens." Its primary (`#0057B8`/`#6CA8FF`) doesn't match the web app's `#0d6efd`, and none of Today/Next shifts/Team status color-code shifts the way the web app's contrast-audited `--wt-shift-*` tokens do. | Follow-up: #1233 (design tokens + brand/shift-color parity). |
| Low | Inspect `WorktimeApp.kt` (454 lines) and `WorktimeAuthenticatedScaffold`'s ~30 parameters. | Session state, reminder reconciliation, FCM registration, biometric-lock lifecycle observation, login/logout, and navigation are all owned by one top-level composable and threaded down through every destination as individual lambdas. Not a correctness bug, but it widens each destination's effective recomposition scope and makes an isolated Compose UI test for one screen harder to write. | No dedicated issue; natural to address incrementally while extracting the components proposed below (#1233). |
| Low | Inspect test tree and `.github/workflows/android.yml`. | Solid JVM unit coverage exists for auth, networking, notifications/reminders, and the data/ViewModel layer (`android/app/src/test/**`), but there is no `androidTest` source set at all — zero Compose UI, navigation, receiver, screenshot, or accessibility test coverage, and CI runs only `ktlintCheck detekt testDebugUnitTest lintDebug assembleDebug`. | Follow-up: #1231. |

Authentication uses AppAuth and encrypted session storage (`SecureSessionStore`, backed by
`EncryptedSharedPreferences`), refreshes access tokens via `performActionWithFreshTokens`,
clears sessions on terminal authorization failure, and supports an interactive end-session
flow that defers clearing local state until the launched activity returns
(`DashboardViewModel.logout`/`onLogoutFlowFinished`). The app-lock gate binds a successful
`BiometricPrompt` callback to a real AndroidKeyStore cipher operation
(`BiometricAuthenticator.isVerifiedUnlock`) rather than trusting the callback's boolean alone,
and transparently regenerates its key if biometric enrollment changes invalidate it. Release
configuration (`android/app/build.gradle.kts`) fails `assembleRelease` fast when signing, API
base URL, or certificate-pin inputs are missing instead of shipping placeholder values; debug
permits cleartext only for `10.0.2.2`/`localhost`/`127.0.0.1` (`network_security_config.xml`).
No embedded production secret was found. Certificate pins introduce an availability tradeoff
and the documented backup-pin rotation procedure (`android/README.md`) must remain part of
release operations.

## Capability and UX matrix

| Experience | Responsive web | Android | Decision |
|---|---|---|---|
| Today/current status and timer actions | Full | Native cards and actions | Required parity; keep native card/action layout. |
| Upcoming shifts and team status | Full | Read-only destinations, uncolored | Required parity, **including shift-type color coding** (see #1233) — currently a real gap, not a native-pattern deferral. |
| Time off | Summary and editing | Summary and form | Required parity; use native date pickers/dialogs (fix state loss on rotate, #1229). |
| Labels/templates and work location | Full | Settings/actions | Required parity where mobile workflows benefit. |
| Gantt, transfer, calendar power views | Full | Absent | Deliberately web-only until a mobile use case is approved. |
| Account/API settings | Full | Focused native settings | Native pattern; do not reproduce desktop sections. |
| Loading/empty/error | Per view | Generic read-model treatment | Required parity; add explicit offline/stale variants (#1230). |
| Authentication and biometric lock | OIDC/PWA | AppAuth plus native biometric gate | Better expressed natively. |
| Theme | Light/dark/system, documented surface-elevation and shift-color tokens | System-derived light/dark, two ad hoc colors | Required parity on brand color and shift color-coding (#1233); Android dynamic-color behavior otherwise remains native. |

**Intended scope:** Android is a focused companion for glanceable status and frequent mobile
actions. Product parity means consistent facts, permissions, and outcomes — not duplicating
every PWA administration or planning surface. The shift color-coding gap above is the one
place this pass concluded the native app currently *undershoots* its own stated purpose
("glanceable status"), since color is the web app's primary glanceability cue and Android has
none of it.

## Proposed Worktime Android design system

* **Color roles:** Material 3 `primary` aligned to the web app's `#0d6efd` (currently
  diverges — see #1233), `secondary` for schedule accents, `tertiary` for time tracking,
  semantic error/warning and success containers, and surface-container levels rather than
  custom shadows. Shift-type colors adapted from `frontend/src/styles/_variables.scss`'s
  `--wt-shift-morning/late/day/night/off` (and their contrast-checked `-text` pairs) into
  Material 3 container/on-container roles, with a separate dark-theme mapping the same way
  the web app has one.
* **Type:** system-scalable Material display-small for today's key fact, title-large for
  destinations, title-medium for cards, body-medium and label-large for actions. Never encode
  status with type size or color alone.
* **Spacing:** 4 dp base; 8 dp inline, 12 dp compact card, 16 dp standard inset, 24 dp
  section, 32 dp major separation. Minimum interactive target 48 dp — audited controls that
  fall short today (chip delete affordance, color swatches) are tracked in #1232.
* **Shape:** 12 dp cards, 16 dp prominent summary surfaces, pill shapes only for
  filters/status chips. Use tonal elevation and restrained dividers.
* **Components:** `StatusHero`, `ScheduleCard`, `StatePane`, `WorktimeListRow`, confirmation
  dialog, and full-width primary action. Components own semantic headings and state
  descriptions. Extracting these out of `WorktimeApp.kt`'s current monolith is a reasonable
  side effect of implementing this system, not a prerequisite for it.
* **Icons:** Material symbols with a text/semantic label; decorative icons are excluded from
  accessibility. Never rely on icon or color alone (the current delete/color-swatch controls
  violate this today — #1232).
* **State treatment:** skeleton only for initial load; cached content remains visible beneath
  an Offline/Stale banner (#1230); empty states explain the next action; errors preserve
  context and expose Retry; destructive actions require explicit confirmation (already true
  for account deletion and time-off entry deletion).

## Prototype specification

The main navigation remains a Material bottom navigation on compact phones, with Today
centered as the default high-frequency destination; wider screens graduate to a navigation
rail. Today begins with a `StatusHero` (current shift/off-day and next transition, now
color-coded per the design system above), followed by the running-timer action surface and
next-shift card. Team and Upcoming use consistent list rows, also color-coded by shift type.
Settings uses grouped native list sections rather than web cards. These specifications are
the before/after prototype contract; broad UI changes are intentionally not bundled with this
audit, and a rendered mockup/prototype artifact requires either a device/emulator or a design
tool, neither available in this review's environment — the capture manifest below is the
reproducible protocol for producing one.

## Screen and state capture manifest

Capture Login, biometric locked/unavailable/prompting, Today (loading/error/off-day/working/
running timer), Upcoming (loading/empty/populated/error), Team (same), Time off (summary/
empty/form/validation/error), and Settings (all sections, permission denied, destructive
confirmation). Capture each on a compact phone (360×800 dp) and large phone (412×915 dp),
light and dark, plus one 200% font/TalkBack pass. Store approved artifacts under
`docs/screenshots/android/` named `<screen>-<state>-<size>-<theme>.png`. Screenshots are
intentionally not fabricated from static source; this manifest is the reproducible device
capture protocol, unchanged in method from the previous pass — no SDK/emulator was available
to execute it in this review's environment either.

## Prioritized roadmap

1. **P0 – reliable reminders (#1191, closed):** persisted alarms, lifecycle triggers,
   permission degradation, dedupe, account isolation, and tests. Done.
2. **P1 – state restoration (#1229):** stop discarding unsaved dialog/form input on rotation
   and on the notification-tap `recreate()` path.
3. **P1 – offline truth (#1230):** durable read cache, stale age, connectivity transitions,
   and reconciliation tests.
4. **P1 – accessibility/device harness (#1231, #1232):** fix the two concrete color-only/
   unlabeled controls now; stand up a Compose UI/instrumented test harness in CI; then run the
   font-scale and TalkBack device pass the harness makes it possible to keep passing.
5. **P2 – design tokens/shift-color parity (#1233):** introduce the system above, align brand
   color, add shift-type color coding, and migrate Today, then list destinations, in
   separately reviewable visual changes.
6. **P2 – refresh efficiency:** single refresh coordinator and constrained WorkManager
   reconciliation with network/battery measurements; coordinate with #1201 (SSE live-update
   while foregrounded) so both land on one refresh-triggering policy instead of two.
7. **Decision gate:** validate demand before adding Gantt, transfer, or admin surfaces; absent
   approval, those remain web-only.

## Follow-up issues filed from this audit

- #1229 — rotation/notification-tap discards unsaved dialog and form input (High)
- #1230 — no durable offline read cache or explicit offline/stale UI state (Medium)
- #1231 — no Compose UI, instrumented, or accessibility test coverage in CI (Medium)
- #1232 — color-only and unlabeled tap targets fail accessibility (Medium)
- #1233 — design tokens and brand/shift-color parity gaps (Low)

Pre-existing, still open and relevant: #1201 (SSE live-update while foregrounded).
