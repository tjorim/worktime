import SuperTokens from "supertokens-auth-react";
import EmailPassword from "supertokens-auth-react/recipe/emailpassword";
import Session from "supertokens-auth-react/recipe/session";

/**
 * Initialize SuperTokens with email-password and session recipes.
 *
 * Must be called once before rendering the React tree (e.g. in main.tsx).
 * Domains and base paths are read from Vite environment variables so that
 * local development (e.g. http://localhost:5173 / http://localhost:8000) can
 * override the production defaults without a code change.
 *
 * Environment variables (all optional, with production defaults):
 *   VITE_API_DOMAIN          — Backend origin          (default: https://worktime.tjor.im)
 *   VITE_WEBSITE_DOMAIN      — Frontend origin          (default: https://worktime.tjor.im)
 *   VITE_API_BASE_PATH       — SuperTokens API base     (default: /v1/auth)
 *   VITE_WEBSITE_BASE_PATH   — SuperTokens UI route     (default: /auth)
 *
 * Session cookies are managed automatically by the session recipe.
 */

const API_DOMAIN =
  import.meta.env.VITE_API_DOMAIN ?? "https://worktime.tjor.im";
const WEBSITE_DOMAIN =
  import.meta.env.VITE_WEBSITE_DOMAIN ?? "https://worktime.tjor.im";
const API_BASE_PATH = import.meta.env.VITE_API_BASE_PATH ?? "/v1/auth";
const WEBSITE_BASE_PATH = import.meta.env.VITE_WEBSITE_BASE_PATH ?? "/auth";

export function initSuperTokens(): void {
  SuperTokens.init({
    appInfo: {
      appName: "Worktime",
      apiDomain: API_DOMAIN,
      websiteDomain: WEBSITE_DOMAIN,
      apiBasePath: API_BASE_PATH,
      websiteBasePath: WEBSITE_BASE_PATH,
    },
    recipeList: [EmailPassword.init(), Session.init()],
  });
}
