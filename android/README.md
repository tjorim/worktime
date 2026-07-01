# Worktime Android

Native Android companion app for Worktime's mobile-first read-only flows.

## Open locally

```bash
cd android
./gradlew ktlintCheck detekt testDevDebugUnitTest
./gradlew assembleDevDebug
```

## Flavors

- `devDebug` / `devRelease`
- `prodDebug` / `prodRelease`

Override environment values with Gradle properties:

- `WORKTIME_ANDROID_DEV_API_BASE_URL`
- `WORKTIME_ANDROID_PROD_API_BASE_URL`
- `WORKTIME_ANDROID_DEV_OIDC_AUTHORITY`
- `WORKTIME_ANDROID_PROD_OIDC_AUTHORITY`
- `WORKTIME_ANDROID_DEV_OIDC_CLIENT_ID`
- `WORKTIME_ANDROID_PROD_OIDC_CLIENT_ID`
- `WORKTIME_ANDROID_OIDC_SCOPE`
- `WORKTIME_ANDROID_PROD_CERTIFICATE_PIN_HOSTS` (comma-separated OkHttp certificate pin hosts)
- `WORKTIME_ANDROID_PROD_CERTIFICATE_PINS` (comma-separated `sha256/...` pins)

Production builds pin `worktime.tjor.im` and `auth.tjor.im` to the ISRG Root X1 public key by default. Override the pin properties when the production TLS chain changes.

Example:

```bash
cd android
./gradlew testDevDebugUnitTest -PWORKTIME_ANDROID_DEV_API_BASE_URL=http://10.0.2.2:8000/
```
