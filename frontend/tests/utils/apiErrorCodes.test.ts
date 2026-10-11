import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as codes from "@/utils/apiErrorCodes";
import { ApiError, describeError, type ErrorCodeMessages } from "@/utils/apiError";

const backendSource = readFileSync(
  path.resolve(import.meta.dirname, "../../../backend/app/core/errors.py"),
  "utf8",
);
const backendCodes = new Set(
  [...backendSource.matchAll(/= "([a-z_]+)"$/gm)].map((match) => match[1]),
);

const surfaces = Object.entries(codes) as Array<[string, ErrorCodeMessages]>;

describe("error code messages", () => {
  it("finds the backend's codes", () => {
    expect(backendCodes.has("oidc_session_required")).toBe(true);
  });

  it.each(surfaces)("%s only maps codes the backend sends, each to a message", (_name, map) => {
    for (const [code, message] of Object.entries(map)) {
      expect(backendCodes.has(code), `${code} is not a backend ErrorCode`).toBe(true);
      expect(message()).not.toBe("");
    }
  });

  it("shows the translated reason for a mapped code and nothing for an unknown one", () => {
    const known = new ApiError({ status: 404, code: "access_token_not_found" });
    const unknown = new ApiError({ status: 404, code: "something_new", message: "English" });

    expect(describeError(known, codes.accessTokenErrorMessages)).toBe(
      "That token no longer exists.",
    );
    expect(describeError(unknown, codes.accessTokenErrorMessages)).toBeNull();
  });
});
