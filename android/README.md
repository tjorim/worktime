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
- `ANDROID_DEBUG_OIDC_ISSUER_URL`
- `ANDROID_OIDC_ISSUER_URL`
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
- `ANDROID_OIDC_ISSUER_URL` - e.g. `https://auth.tjor.im/realms/worktime`
- `ANDROID_CERTIFICATE_PIN_HOST` - e.g. `worktime.tjor.im`
- `ANDROID_CERTIFICATE_PINS` - comma-separated `sha256/<base64 SPKI hash>` pins,
  used for OkHttp certificate pinning in release builds

`assembleRelease` fails fast when these production values are missing instead
of silently shipping an APK with placeholder endpoints or stale hardcoded pins.
The pin host should be the production API host used by the app's OkHttp client.
The OIDC authority is handled by AppAuth/browser flows, not this API pinner.

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
