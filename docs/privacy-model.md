# Worktime Privacy Model

## Current Privacy Stance

Worktime currently follows a **trusted-server model**:

- The app and API enforce user-level access boundaries so regular users can only access their own data.
- Data is stored in PostgreSQL and `.hday` files in server-readable form.
- A server/operator with infrastructure-level access (host shell, Docker, Postgres, backups, or mounted shares) can read stored Worktime data.

This means Worktime provides strong **application-level isolation** between users, but it does **not** currently provide confidentiality from the infrastructure operator.

## Sensitive Data Categories

The following categories should be treated as sensitive:

- Time entries and work patterns (start/stop times, durations, labels, templates)
- Notes/descriptions attached to entries
- Work locations/countries
- Employer/team/user metadata
- Time-off/absence records
- Imported `.hday` content and shared `.hday` files

## Admin and Operator Access Implications

- App-level admin capabilities should focus on user/account operations, not browsing other users' private worktime content by default.
- Infrastructure operators remain high-trust actors in the current model and can inspect data at rest.
- Database dumps and backups must be treated as sensitive artifacts because they can contain readable user data.

## Product/UX Decisions

- **Privacy notice:** Yes — add an explicit in-app and docs privacy notice that clearly explains the trusted-server model.
- **Admin UX messaging:** Yes — clarify that app admin permissions do not automatically imply day-to-day user data browsing in normal UI flows.
- **Backup handling:** Yes — document backups as sensitive and recommend encryption-at-rest plus strict access control.
- **Data minimization/redaction:** Yes — prioritize minimization and selective redaction opportunities before deeper encryption work.

## Evaluated Options

1. **Document trusted-server model** — adopt now as baseline.
2. **Reduce admin exposure inside the app** — adopt as near-term hardening.
3. **Encrypt selected sensitive fields at rest** — evaluate with key-management design; likely protects DB/backups only when key separation is real.
4. **Client-side/end-to-end encryption** — keep as long-term research due major product and operational cost.

## API Endpoint Compatibility If Encryption Is Added

- **Trusted-server + app isolation:** Existing API endpoints work as-is.
- **Server-side field encryption (server holds keys):** Existing endpoint paths can stay the same; payload shapes can stay mostly the same; server decrypts/encrypts sensitive fields before/after persistence.
- **Client-side/end-to-end encryption:** Existing endpoint paths can still be reused for CRUD, but behavior changes:
  - the server stores ciphertext for protected fields,
  - server-side search/filter/reporting on protected fields becomes limited or unavailable unless additional metadata/index design is added,
  - imports/exports, conflict handling, and recovery flows need redesign.

## Follow-up Implementation Issues (to be tracked)

1. Add explicit privacy notice to frontend and top-level docs.
2. Add/expand backend tests for cross-user data isolation boundaries.
3. Document backup security requirements (encryption, retention, access controls, restore handling).
4. Prototype field-level encryption for selected high-sensitivity fields (for example notes/descriptions).
5. Research feasibility and UX impact of client-side encryption.
