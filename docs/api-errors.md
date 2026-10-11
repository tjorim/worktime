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
