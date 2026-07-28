# Authorization model

Keycloak is the identity authority for web, Android, and MCP clients. Interactive
clients use Authorization Code with PKCE and send the resulting access token to
the backend. MCP user operations use the same Keycloak user identity.

The backend normalizes authentication into a principal containing the Keycloak
subject, local user ID, authorized client, authentication type, roles, and
scopes. Regular application endpoints require a Keycloak user principal.

Pebble pairing is initiated from an interactive Keycloak session, but the watch
receives a revocable delegated credential rather than Keycloak refresh tokens.
That credential may carry `pebble:read` and/or `pebble:write`: `pebble:read`
grants the Pebble dashboard read model, and `pebble:write` grants the
clock-in/clock-out actions. Account, administration, sync, and token-management
operations remain Keycloak-only regardless of the credential's scopes.

Service-to-service MCP access uses a dedicated Keycloak confidential client and
service account. Because Worktime data is user-owned, its access token must
contain a trusted `worktime_user_id` claim added by a Keycloak protocol mapper.
Without that mapping the MCP server rejects the service account instead of
auto-provisioning it as a human user. Interactive MCP users need no mapper.

Use separate public Keycloak clients for web and Android even though both are
Authorization Code + PKCE clients. Give all API tokens the backend API audience.
The SPA keeps tokens in session storage, renews before expiry, monitors the
provider session, revokes tokens on sign-out, and redirects through Keycloak
logout. Android stores AppAuth state in encrypted storage and performs RP-
initiated logout.
