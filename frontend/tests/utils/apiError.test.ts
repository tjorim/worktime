import { describe, expect, it } from "vitest";
import * as m from "@/paraglide/messages.js";
import { ApiError, describeError, getErrorMessage, isUnauthorizedError } from "@/utils/apiError";

function jsonResponse(body: unknown, status: number, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("ApiError.fromResponse", () => {
  it("reads the status, code and request id, keeping detail only as the diagnostic message", async () => {
    const error = await ApiError.fromResponse(
      jsonResponse({ code: "token_limit", detail: "Too many tokens" }, 409, {
        "X-Request-ID": "req-1",
      }),
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.code).toBe("token_limit");
    expect(error.requestId).toBe("req-1");
    expect(error.message).toBe("Too many tokens (409)");
  });

  it("copes with a body that is not JSON or has blank fields", async () => {
    const html = await ApiError.fromResponse(new Response("<html>", { status: 502 }));
    expect(html.status).toBe(502);
    expect(html.code).toBeNull();
    expect(html.message).toBe("502");

    const blank = await ApiError.fromResponse(jsonResponse({ code: " ", detail: "" }, 500));
    expect(blank.code).toBeNull();
    expect(blank.message).toBe("500");
  });
});

describe("describeError / getErrorMessage", () => {
  const fallback = "Could not do the thing right now.";

  it("prefers a surface-specific message for a known code", () => {
    const error = new ApiError({ status: 409, code: "token_limit" });
    const codeMessages = { token_limit: () => "Token limit reached." };

    expect(getErrorMessage(error, fallback, codeMessages)).toBe("Token limit reached.");
  });

  it("maps recognised statuses to translated messages", () => {
    expect(describeError(new ApiError({ status: 429 }))).toBe(m.error_rate_limited());
    expect(describeError(new ApiError({ status: 403 }))).toBe(m.auth_error_forbidden());
    expect(describeError(new ApiError({ status: 401 }))).toBe(m.auth_session_expired());
  });

  it("falls back to the translated operation message for an unknown code or status", () => {
    const error = new ApiError({ status: 500, code: "something_new", message: "Boom (500)" });

    expect(describeError(error, { other: () => "x" })).toBeNull();
    expect(getErrorMessage(error, fallback)).toBe(fallback);
  });

  it("never exposes the English message of a plain Error or a non-error value", () => {
    expect(getErrorMessage(new Error("Failed to fetch"), fallback)).toBe(fallback);
    expect(getErrorMessage("Pairing failed (502)", fallback)).toBe(fallback);
    expect(getErrorMessage(undefined, fallback)).toBe(fallback);
  });

  it("does not resolve prototype keys as codes", () => {
    const error = new ApiError({ status: 400, code: "constructor" });
    expect(getErrorMessage(error, fallback, {})).toBe(fallback);
  });
});

describe("isUnauthorizedError", () => {
  it("is true only for a 401 ApiError", () => {
    expect(isUnauthorizedError(new ApiError({ status: 401 }))).toBe(true);
    expect(isUnauthorizedError(new ApiError({ status: 403 }))).toBe(false);
    expect(isUnauthorizedError(new Error("Unauthorized"))).toBe(false);
  });
});
