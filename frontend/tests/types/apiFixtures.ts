// Compile-only assertions, included by typecheck:tests (also covers e2e/).
import type {
  DashboardReadModel,
  IcalFeedStatus,
  PreferencesResponse,
  SyncPullResponse,
  SyncPushResponse,
} from "@/api-types";
import { jsonBody, jsonResponse, routeJson } from "@/mocks/response";
import { emptyPushResponse } from "@/mocks/data/syncStore";

declare const dashboard: DashboardReadModel;
declare const pull: SyncPullResponse;
declare const status: IcalFeedStatus;

function fixtureContracts() {
  // @ts-expect-error Must explicitly choose a contract; inference cannot bless arbitrary data.
  jsonResponse({ anything: true });
  // @ts-expect-error The same rule applies to injected fetch json() doubles.
  jsonBody({ anything: true });
  // @ts-expect-error And to browser route fixtures.
  routeJson({ anything: true });
  // @ts-expect-error Even a complete typed variable requires the contract argument.
  jsonResponse(status);
  // @ts-expect-error Defaults in responses are required, even when nullable.
  jsonResponse<IcalFeedStatus>({ configured: true });
  const { created_at: omitted, ...incomplete } = status;
  void omitted;
  // @ts-expect-error Non-literal values cannot hide missing response metadata.
  routeJson<IcalFeedStatus>(incomplete);
  jsonResponse<SyncPushResponse>({
    // @ts-expect-error Nested sync results must include the nullable metadata.
    results: { ...emptyPushResponse.results, tasks: [{ id: "task", status: "ok" }] },
  });
  // @ts-expect-error Nested pull records must be complete generated records.
  jsonBody<SyncPullResponse>({ ...pull, labels: [{ id: "label" }] });
  // @ts-expect-error Dashboard nesting must not become an opaque dictionary.
  jsonBody<DashboardReadModel>({ ...dashboard, work_context: { state: "ready" } });
  // @ts-expect-error Opaque preference data does not make the response envelope optional.
  jsonBody<PreferencesResponse>({ data: {} });
  jsonResponse<IcalFeedStatus>({
    configured: true,
    created_at: null,
    token_preview: null,
    last_used_at: null,
  });
}
void fixtureContracts;
