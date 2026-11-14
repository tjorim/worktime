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

export type TimeTrackingScenarioState =
  | "active"
  | "paused"
  | "completed"
  | "correction_needed"
  | "validation_failure";

export interface TimeTrackingFixture {
  state: TimeTrackingScenarioState;
  active_entry_id: string | null;
  seconds_elapsed: number;
  validation_errors: string[];
}

export interface TimeOffRequestFixture {
  id: string;
  status: "pending" | "approved" | "rejected";
  starts_on: string;
  ends_on: string;
  note: string;
  overlap_with: string[];
  quota_days_remaining: number;
}

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
  timeTracking: TimeTrackingFixture;
  timeOffRequests: {
    statusCode: number;
    requests: TimeOffRequestFixture[];
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
  | "time-tracking-active"
  | "time-tracking-paused"
  | "time-tracking-completed"
  | "time-tracking-correction-needed"
  | "time-tracking-validation-failure"
  | "time-off-pending"
  | "time-off-approved"
  | "time-off-rejected"
  | "time-off-overlap"
  | "time-off-quota-edge"
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
