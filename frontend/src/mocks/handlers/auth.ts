import { uncheckedJson } from "@/mocks/response";
import { getMockScenario } from "@/mocks/scenarios/state";

export function buildAuthFailureResponse(): Response | null {
  const authState = getMockScenario().auth.state;
  if (authState === "valid_session") {
    return null;
  }

  if (authState === "forbidden") {
    return uncheckedJson("error", { detail: "Forbidden" }, { status: 403 });
  }

  const detail =
    authState === "expired_session"
      ? "Session expired, please sign in again."
      : "Authentication required.";
  return uncheckedJson("error", { detail }, { status: 401 });
}
