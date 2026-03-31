import SuperTokens from "supertokens-auth-react";
import EmailPassword from "supertokens-auth-react/recipe/emailpassword";
import Session from "supertokens-auth-react/recipe/session";

/**
 * Initialize SuperTokens with email-password and session recipes.
 *
 * Must be called once before rendering the React tree (e.g. in main.tsx).
 * Authentication is handled by the dedicated auth service at auth.tjor.im;
 * session cookies are managed automatically by the session recipe.
 */
export function initSuperTokens(): void {
  SuperTokens.init({
    appInfo: {
      appName: "Worktime",
      apiDomain: "https://auth.tjor.im",
      websiteDomain: "https://worktime.tjor.im",
      apiBasePath: "/auth",
      websiteBasePath: "/auth",
    },
    recipeList: [EmailPassword.init(), Session.init()],
  });
}
