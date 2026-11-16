import type {
  AccountProfile,
  CurrentStatusReadModel,
  LongWeekend,
  PublicHoliday,
  SchoolHoliday,
  SyncPullResponse,
  SyncPushResponse,
  SyncStatusResponse,
  TeamStatusReadModel,
  TimeOffSummaryReadModel,
  WorkLocationRead,
} from "@/api-types";

export type AuthScenarioState = "valid_session" | "signed_out" | "expired_session" | "forbidden";

export type SyncScenarioState =
  | "clean"
  | "pending_local_changes"
  | "conflict"
  | "retryable_failure"
  | "offline";

export interface MockScenarioFixture {
  id: MockScenarioId;
  auth: {
    state: AuthScenarioState;
    profile: AccountProfile;
  };
  sync: {
    state: SyncScenarioState;
    status: SyncStatusResponse;
    pullData: SyncPullResponse;
    pushResponse: SyncPushResponse;
    statusError: number | null;
    pullError: number | null;
    pushError: number | null;
  };
  readModels: {
    currentStatus: CurrentStatusReadModel;
    teamStatus: TeamStatusReadModel;
    timeOffSummary: TimeOffSummaryReadModel;
    statusCode: number;
  };
  holidays: {
    public: PublicHoliday[];
    longweekend: LongWeekend[];
    school: SchoolHoliday[];
    paydates: string[];
  };
  workLocations: {
    statusCode: number;
    items: WorkLocationRead[];
  };
}

export type MockScenarioId =
  | "demo-default"
  | "current-shift-day"
  | "current-shift-night"
  | "current-shift-off"
  | "current-shift-handover"
  | "sync-clean"
  | "sync-pending-local"
  | "sync-conflict"
  | "sync-retryable-failure"
  | "sync-offline"
  | "work-location-actions"
  | "auth-signed-out"
  | "auth-expired"
  | "auth-forbidden"
  | "server-error";
