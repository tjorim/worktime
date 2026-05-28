import type { SyncPullResponse, SyncPushResponse, SyncStatusResponse } from "@/utils/syncClient";
import type { PublicHoliday } from "@/hooks/usePublicHolidays";
import type { SchoolHoliday } from "@/hooks/useSchoolHolidays";
import type { LongWeekend } from "@/types/longWeekend";

export type AuthScenarioState =
  | "valid_session"
  | "signed_out"
  | "expired_session"
  | "forbidden";

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

export interface ReadModelShift {
  code: string;
  display_code: string;
  name: string;
  start_hour: number | null;
  end_hour: number | null;
  is_working: boolean;
}

export interface TeamShiftStatusReadModel {
  team_number: number;
  date: string;
  shift_day: string;
  shift_code: string;
  shift: ReadModelShift;
  is_currently_working: boolean;
}

export interface CurrentStatusReadModel {
  as_of: string;
  current_shift: TeamShiftStatusReadModel | null;
  currently_working_team: TeamShiftStatusReadModel | null;
  off_day_progress: { current: number; total: number } | null;
}

export interface TeamStatusReadModel {
  as_of: string;
  items: TeamShiftStatusReadModel[];
}

export interface TimeOffSummaryReadModel {
  as_of: string;
  active_items: Array<{
    entry_id: string;
    entry_kind: string;
    entry_type: string;
    entry_flag: string;
    note: string | null;
    starts_on: string;
    ends_on: string;
    is_recurring_weekly: boolean;
    is_active: boolean;
  }>;
  upcoming_items: Array<{
    entry_id: string;
    entry_kind: string;
    entry_type: string;
    entry_flag: string;
    note: string | null;
    starts_on: string;
    ends_on: string;
    is_recurring_weekly: boolean;
    is_active: boolean;
  }>;
  total_upcoming: number;
}

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

export interface WorkLocationFixtureItem {
  id: number;
  user_id: number;
  date: string;
  country_code: string;
  label: string | null;
  created_at: string;
}

export interface MockScenarioFixture {
  id: MockScenarioId;
  auth: {
    state: AuthScenarioState;
    profile: {
      id: number;
      username: string;
      display_name: string;
      is_admin: boolean;
      capabilities: { backup_enabled: boolean };
    };
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
    items: WorkLocationFixtureItem[];
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
