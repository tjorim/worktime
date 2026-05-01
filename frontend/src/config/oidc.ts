/**
 * OIDC configuration for react-oidc-context.
 *
 * Environment variables (all optional):
 *   VITE_OIDC_AUTHORITY     — OIDC provider base URL
 *   VITE_OIDC_CLIENT_ID     — Client identifier registered with the provider
 *   VITE_OIDC_REDIRECT_URI  — Callback URL after successful login (defaults to /auth/callback)
 *   VITE_OIDC_SCOPE         — Requested OAuth scopes (default: openid profile email)
 */

import type { AuthProviderProps } from "react-oidc-context";

const OIDC_AUTHORITY =
  import.meta.env.VITE_OIDC_AUTHORITY ?? "http://localhost:9000/application/o/worktime";
const OIDC_CLIENT_ID = import.meta.env.VITE_OIDC_CLIENT_ID ?? "worktime";
const OIDC_REDIRECT_URI =
  import.meta.env.VITE_OIDC_REDIRECT_URI ?? `${window.location.origin}/auth/callback`;
const OIDC_SCOPE = import.meta.env.VITE_OIDC_SCOPE ?? "openid profile email";

export const oidcConfig: AuthProviderProps = {
  authority: OIDC_AUTHORITY,
  client_id: OIDC_CLIENT_ID,
  redirect_uri: OIDC_REDIRECT_URI,
  scope: OIDC_SCOPE,
  post_logout_redirect_uri: window.location.origin,
  /**
   * Automatically redirect back to the page the user was on before logging in.
   * The state is encoded in the OIDC state parameter and restored on callback.
   */
  onSigninCallback: () => {
    // Remove the OIDC query params from the URL after successful login
    window.history.replaceState({}, document.title, window.location.pathname);
  },
};
