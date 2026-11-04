# API errors in the interface

Failed requests never show English text to the user. `error.message`, server `detail`
strings and `new Error("…")` arguments are developer diagnostics: they go to `logger`
and nowhere else. This is what lets `scripts/locale-audit.mjs` ignore `Error(...)`
arguments (#1472); keep it true (#1473).

## Shape

`frontend/src/utils/apiError.ts`:

- `ApiError` carries `status`, an optional stable `code`, and the `requestId`
  (`X-Request-ID`). Its `message` is English and for logs only.
- `ApiError.fromResponse(response)` builds one from a non-ok response. It reads an
  optional top-level `code` string from the JSON body; `detail` is kept only as the
  diagnostic message.
- `apiFetch` throws `ApiError` for 401 and 403, so `useApiClient` recognises a 401 by
  `status`, not by matching message text (`isUnauthorizedError`).

## Showing an error

```ts
const response = await fetchFn("/api/access-tokens", { method: "POST", … });
if (!response.ok) throw await ApiError.fromResponse(response);
…
} catch (error) {
  logger.error("Failed to create API token:", error);
  setError(getErrorMessage(error, m.api_tokens_create_failed()));
}
```

`getErrorMessage(error, fallback, codeMessages?)` resolves, in order:

1. a surface-specific translated message for the error's `code` (`codeMessages`, a
   `{ [code]: () => string }` map; unknown codes and prototype keys are ignored),
2. a generic translated message for a recognised status (401, 403, 429),
3. the surface's translated operation `fallback`.

It never returns `error.message`. Use `describeError(error)` (returns `null` when the
error is not recognised) when the surface composes a sentence around the reason, as
the .hday helper toasts do (`timeoff_push_failed({ error: reason })`, else the
`…_generic` message).

Hooks that expose a string to the view (`useLongWeekend`, `usePaydates`, the settings
hooks) translate inside the hook, so views never see an `Error`.

## Adding a code

1. Add an `ErrorCode` member in `backend/app/core/errors.py` and raise
   `api_error(status, ErrorCode.X, "English detail")` instead of `HTTPException`. The
   handler renders `{ "code": "snake_case_code", "detail": "…" }`. Plain `HTTPException`s
   keep `{ "detail": "…" }` and the client shows its status/operation message.
   Codes are permanent: never rename or reuse one.
2. Add a message to `messages/en.json` and `nl.json`.
3. Add it to the surface's map in `src/utils/apiErrorCodes.ts` and pass that map as
   `codeMessages`. A code the client has not learned yet falls back to the operation
   message, so adding codes on the server first is safe.
   `tests/utils/apiErrorCodes.test.ts` fails if a map lists a code the backend does not send.
4. Assert the code in a backend test (`response.json()["code"]`).

Every router sends a code. Authentication, tokens, integration clients, account deletion and
registration have specific ones; the data routers share `not_found`, `conflict` and
`validation_failed` (the `detail` keeps the specific English diagnostic for logs). Conditions a
client may branch on have their own: `sync_cursor_expired` (410; `detail` stays the structured
`{code, message, max_offline_days}` object offline clients already parse), `bulk_delete_blocked`,
`sync_stream_limit_reached`, `push_not_configured`, `fcm_not_configured`, `no_running_task`,
`unsupported_country`, `unknown_timezone`, `calendar_feed_not_found`, `audit_access_denied`.

Not every code has a client message. Add one to `messages/` and `apiErrorCodes.ts` only when a
surface shows that error to people. Push registration, for example, is best-effort and silent by
design, so `push_not_configured` is not mapped. FastAPI request-validation errors (422) are still
the framework's `{ "detail": [...] }` shape.

## Tests

For each surface, cover one recognised error (translated reason shown, server text
absent) and one unknown error (operation fallback shown, server text absent). See
`tests/utils/apiError.test.ts` and the surface tests that assert
`queryByText(/<server detail>/)` is absent.

## Time-tracking task validation

REST task writes reject overlaps with 409 (`task_overlap`); `detail.conflicting_task_id`
identifies the conflicting task. Text must contain non-whitespace content and be at
most 1,000 characters (`task_text_invalid`, 400). Completed task duration must be
between zero and 24 elapsed hours (`task_duration_invalid`, 400), and start/stop
values must include a timezone (`task_timezone_required`, 400). Adjacent intervals
are allowed. Midnight crossings are stored as one task with complete start and stop timestamps (#1700).
The web forms interpret an earlier stop clock time as the next calendar day; equal clock
times are invalid. Daily and weekly reports attribute the full elapsed duration to the
local start day, including Sunday nights, with one optional break deduction. Templates
use the same next-day interpretation. No linked split records or schema migration are needed. Running timers are
compared through the current instant, so future planned tasks remain possible;
the existing single-running-task rule also applies.

Sync push reports these rejections per record as `status: "conflict"`, with `code`
and optional `conflicting_task_id`, while accepting the remaining valid records.
The web client shows the translated reason, retains rejected edits for the existing
conflict resolver, and pulls the server state. Choosing to keep a rejected local
edit retries validation; it does not override these rules. Replays rejected by LWW
and unchanged legacy fields are not revalidated by REST or sync, so pre-existing
invalid rows remain readable and editable. Restoring a deleted row always validates
its interval again. Accepting server state refreshes the snapshot before removing
conflicted tasks that are still absent, including rejected creates later edited
locally, while preserving unrelated local edits.
Labels are required for new tasks and templates.

## Gantt dependencies

Gantt dependencies remain comma-separated task IDs for compatibility. REST writes
return 400 with `gantt_dependency_unknown` (missing, deleted or another user's
target), `gantt_dependency_self`, or `gantt_dependency_cycle`. Sync returns the same
codes as per-record conflicts and accepts other valid records. Forward references
within a sync batch are retried after their targets are accepted; unresolved
cyclic creates are rejected without storing either row. Writes are serialized per
user on PostgreSQL to prevent concurrent updates from creating a cycle.

Deleting a task removes its ID from active dependencies in the same transaction,
with timestamps advanced so other devices receive the cleanup. Unchanged legacy
invalid dependencies remain readable and editable through REST and sync; restoring
a deleted task validates its dependencies again. The modal requires repairing bad
links, the table shows translated warnings, and the chart omits invalid arrows.

## User profile validation

Explicit username writes (create, admin registration and update) trim surrounding
whitespace, then require 1–64 ASCII characters: a letter or digit first, followed
by letters, digits or `._@+-`. Changed display names are limited to 150 Unicode
characters. The API returns `username_invalid`, `username_reserved` or
`display_name_invalid` (400); the Account form translates profile failures and
checks display-name length before sending.

Non-admins cannot take `admin`, `administrator`, `root`, `system` or `support`
(case-insensitive). Admins may assign these names. Existing unchanged usernames
and display names remain editable, including legacy values outside these rules;
response schemas and OIDC provisioning remain unrestricted. Renames retain the
existing permissions pending the owner's decision in #1695 and write a
transactional `rename_user` audit entry containing old and new usernames.

## Work-location countries

REST upserts validate ISO 3166-1 alpha-2 membership and normalise accepted codes
to uppercase. Sync applies the same membership check to creates, changed countries
and restored rows, returning `validation_failed` as a per-record conflict so other
records in the batch can still succeed. Unchanged legacy codes remain readable
and can retain annotation edits; replacing them requires a valid ISO code. Stale
LWW writes and deletes keep their existing behaviour.
