# Release validation: interactive login and logout

Manual, on-device validation of the authorization stack described in
[`authorization-model.md`](./authorization-model.md). The automated suites cover
token validation, scope enforcement, and pairing at the API level; this runbook
covers what only a human with a browser, a phone, and a watch can check.

Run it against the production stack. The backend refuses to start with
`DEV_AUTH_BYPASS_TOKEN` set outside `ENVIRONMENT=development`, so a real
deployment cannot silently fall back — but do not point any client at a local
bypass build while working through these steps, and do not use a personal access
token where the step calls for an interactive session.

## What to record

Fill this in once per validation round and attach it to the tracking issue.

| Field | Value |
|-------|-------|
| App version (root `VERSION`) | |
| Frontend build / commit | |
| Android `versionName` (`versionCode`) | |
| Pebble package version + watch model / firmware | |
| Phone OS + Pebble app version | |
| Browser + version | |
| Keycloak realm / issuer | |
| Date, tester | |

For each check below record pass/fail plus evidence — screenshots for UI states,
response status codes for API checks, `adb logcat` or `pebble logs` excerpts for
native failures. Open a focused follow-up issue per failure rather than
expanding this one.

## A note on "the session is no longer usable"

The backend validates bearer JWTs locally against the provider's JWKS
(`backend/app/config/oidc_config.py`); it does not call the token
introspection endpoint. An access token that was captured *before* sign-out
therefore keeps passing validation until it expires, even though the provider
session is gone. That is expected, not a bug.

So the sign-out checks below verify the things that are actually enforceable:
the refresh token is revoked, no new access token can be minted, and the client
is returned to an unauthenticated state that requires a fresh login. If you want
a hard bound on the stale-token window, that is a Keycloak access token lifetime
question, not a client one.

## Web

Configuration lives in `frontend/src/config/oidc.ts`: Authorization Code +
PKCE against `VITE_OIDC_AUTHORITY`, callback `/auth/callback`, silent renew via
a hidden iframe at `/auth/silent-callback`, with `automaticSilentRenew`,
`monitorSession`, and `revokeTokensOnSignout` all enabled.

1. **Login.** From a clean profile (or after clearing session storage), open a
   deep link such as `/settings` while signed out. Confirm the redirect to the
   real Keycloak login page, authenticate, and confirm you land back on
   `/settings` — not `/`. The return path travels in the OIDC `state` parameter
   and is restored by `onSigninCallback`; a bounce to `/` means `returnTo` was
   dropped.
2. **Authenticated access.** Confirm the app renders authenticated data and that
   a request to an authenticated endpoint (e.g. `GET /api/sync/status`) succeeds
   with the session's bearer token.
3. **Silent renew.** Leave the tab open across an access token expiry. Confirm
   the token is replaced without a visible redirect and without the
   "silent renew failed" toast (`auth_silent_renew_failed`).
4. **Logout.** Sign out from Settings → Account. Confirm the redirect through
   the Keycloak end-session endpoint and the return to the app origin
   (`post_logout_redirect_uri`).
5. **Post-logout state.** Confirm session storage no longer holds OIDC state,
   that reloading a protected route triggers a fresh login redirect, and that
   completing that login requires re-entering credentials (i.e. the Keycloak SSO
   session itself ended, not just the local one).

## Android

`OidcSessionManager` uses AppAuth. Endpoints come from
`OidcServiceConfigurationDiscovery`, which is pinned like the API client, and
`AuthState` is persisted through `SecureSessionStore` (EncryptedSharedPreferences).

1. **Login.** On a real device, from a freshly installed or logged-out app,
   start sign-in. Confirm the browser/Custom Tab handoff, authenticate, and
   confirm the redirect back into the app completes the code exchange.
2. **Authenticated access.** Confirm authenticated screens load real data, and
   that the session survives a cold app restart (state is read back from
   encrypted storage on construction).
3. **Token refresh.** Confirm a request after access token expiry refreshes
   silently rather than dropping to the logged-out state.
4. **Logout.** Sign out. Confirm the RP-initiated end-session request opens with
   the `id_token_hint` and returns to the app.
5. **Post-logout state.** Confirm the app shows logged out, that a cold restart
   stays logged out, and that a fresh login is required. Note that
   `clearLocalSession()` runs even if the end-session intent fails — so if the
   app looks logged out but the next login completes with no credential prompt,
   the provider session survived. Record that as a failure with logs.

## Pebble

Pairing runs through the phone's configuration webview
(`frontend/src/pages/PebblePairPage.tsx`), which signs in interactively and then
calls `POST /api/access-tokens/pebble`. The watch receives a revocable delegated
credential scoped `pebble:read` + `pebble:write` — never Keycloak tokens — handed
back via `pebblejs://close#...` and stored by `pebble/src/pkjs/index.js` as
`AUTH_TOKEN`.

1. **Pairing.** With the watch connected, open the app settings from the Pebble
   phone app. Confirm the webview redirects to Keycloak, that after login the
   page shows the "you can close this window" state, and that the webview closes
   cleanly back to the phone app.
2. **Handoff reaches the watch.** Confirm the watch leaves its unpaired state
   and loads the dashboard (`GET /api/pebble/dashboard`).
3. **Write scope.** Clock in and clock out from the watch and confirm both are
   reflected in the web app.
4. **Rotation.** Re-run pairing. `rotate_pebble_access_token` deletes the prior
   Pebble-named token before issuing the replacement, so confirm the watch keeps
   working on the new credential and that the old raw token now returns 401.
5. **Scope boundary.** Confirm the Pebble credential cannot reach OIDC-only
   surfaces — account deletion and token management are gated by
   `require_oidc_principal` and must return 403 for a `wtpat_...` token.
6. **Interaction with sign-out.** Signing out of the web app does not revoke the
   Pebble credential by design. Confirm the watch still works after a web
   sign-out, and that revoking the token from Settings → Account → API tokens is
   what actually stops it.
