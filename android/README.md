# Worktime Android

Native Android companion app for Worktime's mobile-first read-only flows.

## Open locally

```bash
cd android
./gradlew testDevDebugUnitTest
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

Example:

```bash
cd android
./gradlew testDevDebugUnitTest -PWORKTIME_ANDROID_DEV_API_BASE_URL=http://10.0.2.2:8000/
```
