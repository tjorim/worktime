/**
 * Error shape for failed HTTP requests, and the mapping from it to text a user
 * can read in their own language.
 *
 * Server `detail` strings and `new Error("…")` messages are English developer
 * diagnostics. They go to the log (via `logger`), never to the interface: every
 * surface shows either a translated message for a status/code it recognises, or
 * its own translated operation fallback ("Could not create the token right now.").
 * See `docs/api-errors.md`.
 */
import * as m from "@/paraglide/messages.js";

export interface ApiErrorInit {
  /** HTTP status of the failed response. */
  status: number;
  /** Stable machine-readable error code from the response body, if the server sent one. */
  code?: string | null;
  /** `X-Request-ID` of the failed response, for support/debugging. */
  requestId?: string | null;
  /** English diagnostic text, for logs only. */
  message?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly requestId: string | null;

  constructor({ status, code = null, requestId = null, message }: ApiErrorInit) {
    super(message ?? String(status));
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }

  /**
   * Build an ApiError from a non-ok response, reading the optional `code` (and
   * `detail`, kept only as the diagnostic message) from a JSON body.
   */
  static async fromResponse(response: Response): Promise<ApiError> {
    let code: string | null = null;
    let detail: string | undefined;
    try {
      const payload = (await response.json()) as { code?: unknown; detail?: unknown };
      if (typeof payload.code === "string" && payload.code.trim() !== "") code = payload.code;
      if (typeof payload.detail === "string" && payload.detail.trim() !== "")
        detail = payload.detail;
    } catch {
      // Body is not JSON; the status alone is enough.
    }
    return new ApiError({
      status: response.status,
      code,
      requestId: response.headers.get("X-Request-ID"),
      message: detail ? `${detail} (${response.status})` : undefined,
    });
  }
}

/** Translated messages for stable error codes, supplied per surface. */
export type ErrorCodeMessages = Readonly<Record<string, () => string>>;

/**
 * Translated reason for an error the app recognises, or null when it does not.
 *
 * Resolution order: a surface-specific code, then the generic status mappings.
 */
export function describeError(error: unknown, codeMessages?: ErrorCodeMessages): string | null {
  if (!(error instanceof ApiError)) return null;
  const codeMessage =
    error.code && codeMessages && Object.hasOwn(codeMessages, error.code)
      ? codeMessages[error.code]
      : undefined;
  if (codeMessage) return codeMessage();
  if (error.status === 401) return m.auth_session_expired();
  if (error.status === 403) return m.auth_error_forbidden();
  if (error.status === 429) return m.error_rate_limited();
  return null;
}

/**
 * Text to show for a failed operation: the translated reason when the error is
 * recognised, otherwise the surface's translated `fallback`. Never `error.message`.
 */
export function getErrorMessage(
  error: unknown,
  fallback: string,
  codeMessages?: ErrorCodeMessages,
): string {
  return describeError(error, codeMessages) ?? fallback;
}

/** True when the error is a 401 raised by `apiFetch`. */
export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
