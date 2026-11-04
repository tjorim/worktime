/**
 * What went wrong when the Team tab asked the local .hday helper for a team, as a
 * kind the view can turn into a specific translated message with a next step.
 * The helper's English `detail` is never shown (docs/api-errors.md).
 */
import { ApiError, describeError } from "@/utils/apiError";

export type TeamLoadError =
  /** The team ID field was empty. */
  | { kind: "enter_id" }
  /** 404: the helper is running but has no such team. */
  | { kind: "not_found"; teamId: string }
  /** 400: the helper rejected the ID's format. */
  | { kind: "invalid_id"; teamId: string }
  /** The request never got an answer: helper stopped, wrong URL or blocked. */
  | { kind: "unreachable" }
  /** 5xx: the helper answered but could not read the team files. */
  | { kind: "helper" }
  /** Anything else; `reason` is the generic translated reason when one is recognised. */
  | { kind: "other"; reason: string | null };

export function classifyTeamLoadError(error: unknown, teamId: string): TeamLoadError {
  if (!(error instanceof ApiError)) return { kind: "unreachable" };
  if (error.status === 404) return { kind: "not_found", teamId };
  if (error.status === 400) return { kind: "invalid_id", teamId };
  if (error.status >= 500) return { kind: "helper" };
  return { kind: "other", reason: describeError(error) };
}

/** How many previously loaded team IDs the Team tab suggests. */
export const MAX_RECENT_TEAM_IDS = 5;

/** Puts `teamId` first in the recent list without duplicates, capped at the maximum. */
export function rememberTeamId(recent: readonly string[] | undefined, teamId: string): string[] {
  return [teamId, ...(recent ?? []).filter((id) => id !== teamId)].slice(0, MAX_RECENT_TEAM_IDS);
}
