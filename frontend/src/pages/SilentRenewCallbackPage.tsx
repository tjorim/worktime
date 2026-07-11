/**
 * Blank OIDC silent-renew callback page.
 *
 * react-oidc-context processes the iframe callback before rendering the routed
 * app. Keeping this route intentionally empty avoids showing sign-in UI inside
 * the hidden iframe used for automatic token renewal.
 */
export function SilentRenewCallbackPage() {
  return null;
}
