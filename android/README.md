# Worktime Android

Native Android companion app for Worktime's mobile-first read-only flows.

## Open locally

```bash
cd android
./gradlew ktlintCheck detekt testDebugUnitTest
./gradlew assembleDebug
```

## Build Variants

- `debug` uses local development defaults.
- `release` uses production defaults and requires explicit release secrets when building a release artifact.

Override environment values with Gradle properties:

- `ANDROID_DEBUG_API_BASE_URL`
- `ANDROID_API_BASE_URL`
- `ANDROID_DEBUG_OIDC_CLIENT_ID`
- `ANDROID_OIDC_CLIENT_ID`
- `ANDROID_OIDC_SCOPE`
- `ANDROID_CERTIFICATE_PIN_HOST` (OkHttp API certificate pin host)
- `ANDROID_CERTIFICATE_PINS` (comma-separated `sha256/...` pins)

## Release variant

The manual **Android Release APK** workflow (`.github/workflows/android-release.yml`)
builds a signed `release` APK and requires these repository secrets:

- `KEYSTORE_BASE64`, `KEY_ALIAS`, `KEY_PASSWORD`, `STORE_PASSWORD` - release signing
- `ANDROID_API_BASE_URL` - e.g. `https://worktime.tjor.im/`
- `ANDROID_CERTIFICATE_PIN_HOST` - e.g. `worktime.tjor.im`
- `ANDROID_CERTIFICATE_PINS` - comma-separated `sha256/<base64 SPKI hash>` pins,
  used for OkHttp certificate pinning in release builds

`assembleRelease` fails fast when these production values are missing instead
of silently shipping an APK with placeholder endpoints or stale hardcoded pins.
The pin host should be the production API host used by the app's OkHttp client.
The OIDC authorization and token endpoints are discovered from
`${ANDROID_API_BASE_URL}/api/auth/oidc-config`, so the Android workflow does not
need an OIDC issuer secret.

Prefer pinning the current issuing intermediate CA plus a backup such as the root
or documented rollover intermediate. Avoid leaf-only pinning: client-facing TLS is
terminated by the public edge, and routine leaf renewals can rotate the leaf key.

Regenerate pins with:

```bash
# Show the chain so you can identify the intermediate/root you want to pin
openssl s_client -connect worktime.tjor.im:443 -servername worktime.tjor.im \
  -showcerts </dev/null 2>/dev/null | grep -E "^(subject|issuer)="

# Compute the SPKI pin for chain certificate at index N (0=leaf, 1=intermediate, ...)
N=1
openssl s_client -connect worktime.tjor.im:443 -servername worktime.tjor.im \
  -showcerts </dev/null 2>/dev/null \
  | awk -v n="$N" '/BEGIN CERTIFICATE/{c++} c==n+1{print} /END CERTIFICATE/&&c==n+1{exit}' \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary | openssl enc -base64
```

Example:

```bash
cd android
./gradlew testDebugUnitTest -PANDROID_DEBUG_API_BASE_URL=http://10.0.2.2:8000/
```

## Local reminders

Planned-task and stale-running-timer reminders are local-only: Worktime stores only the
next alarm's timestamp, message, and numeric account id in app-private storage. FCM
(see below) never carries the reminder's content -- only a signal to go reconcile --
so what actually shows the notification is unchanged by whether the reconcile that
scheduled it was triggered by opening the app or by a push-wake.

The planned-task alarm is requested ~10 minutes before its start; a running timer is
considered stale after eight hours. Android 12 and newer may require the user to allow
exact alarms. When exact alarms are unavailable, Worktime schedules an inexact
idle-safe alarm, so delivery can be delayed by Doze. Notification permission denial
suppresses presentation without crashing. Alarms are reconciled after dashboard
refreshes and preference changes, restored after reboot, clock, or timezone changes,
and canceled on logout. Every delivered alarm checks its stored account id, preventing
an alarm created for a previous account from being shown after an account switch.

## Push-wake (FCM)

A planned task created or rescheduled while the app is closed has no way to get a
locally-scheduled reminder armed for it until the app is next opened (see #1205). FCM
closes that gap as a pure wake signal -- "something changed, go reconcile now" -- never
as a delivery channel for the reminder's actual content; see `AGENTS.md`'s "Live
Updates" section for how this mirrors the webapp's SSE notify-then-pull pattern.

Entirely optional and off by default, both here and on the backend:

- **Backend**: no-ops (token-registration endpoints 503, no wake-pings sent) unless
  `FCM_SERVICE_ACCOUNT_JSON` is set -- see `backend/README.md`.
- **Android**: the `com.google.gms.google-services` Gradle plugin only applies when
  `android/app/google-services.json` exists (never commit a real one -- it's
  `.gitignore`d). Without it, `firebase-messaging` still compiles and links fine, but
  `FirebaseApp` never auto-initializes, so `WorktimeFirebaseMessagingService` simply
  never receives anything and token registration silently no-ops.

To enable it for a build: create a Firebase project, register the app's application
ID, download its `google-services.json` into `android/app/`, and configure the
backend's `FCM_SERVICE_ACCOUNT_JSON` with a service-account key from the same project
(Firebase console → Project settings → Service accounts → Generate new private key).
