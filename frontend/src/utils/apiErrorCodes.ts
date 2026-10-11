/**
 * Translated messages for the stable error codes the backend sends
 * (`backend/app/core/errors.py`), grouped by the surface that can hit them.
 * Pass one to `getErrorMessage(error, fallback, codeMessages)`; a code a map does
 * not list falls back to the surface's operation message. See `docs/api-errors.md`.
 */
import * as m from "@/paraglide/messages.js";
import type { ErrorCodeMessages } from "@/utils/apiError";

/** Token management and pairing need an interactive session, never an API token. */
export const accessTokenErrorMessages: ErrorCodeMessages = {
  oidc_session_required: () => m.error_code_oidc_session_required(),
  access_token_not_found: () => m.error_code_access_token_not_found(),
};

export const integrationClientErrorMessages: ErrorCodeMessages = {
  oidc_session_required: () => m.error_code_oidc_session_required(),
  admin_scope_required: () => m.error_code_admin_scope_required(),
  integration_client_not_found: () => m.error_code_integration_client_not_found(),
};

export const accountDeleteErrorMessages: ErrorCodeMessages = {
  oidc_session_required: () => m.error_code_oidc_session_required(),
  user_not_found: () => m.error_code_user_not_found(),
};

export const adminUserDeleteErrorMessages: ErrorCodeMessages = {
  oidc_session_required: () => m.error_code_oidc_session_required(),
  admin_required: () => m.error_code_admin_required(),
  admin_self_delete_forbidden: () => m.account_admin_users_delete_self_blocked(),
  user_not_found: () => m.error_code_user_not_found(),
};

export const pebblePairErrorMessages: ErrorCodeMessages = {
  oidc_session_required: () => m.error_code_oidc_session_required(),
};
