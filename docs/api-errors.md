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

1. The server sends `{ "code": "snake_case_code", "detail": "…" }`.
2. Add a message to `messages/en.json` and `nl.json`.
3. Pass it in the surface's `codeMessages`. A code the client has not learned yet falls
   back to the operation message, so adding codes on the server first is safe.

The backend does not send codes yet, so today only statuses are mapped; see the
follow-up issue linked from #1473.

## Tests

For each surface, cover one recognised error (translated reason shown, server text
absent) and one unknown error (operation fallback shown, server text absent). See
`tests/utils/apiError.test.ts` and the surface tests that assert
`queryByText(/<server detail>/)` is absent.
