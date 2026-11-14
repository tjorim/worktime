// The records the API sends and receives, named for the screens. Every one is the type FastAPI generated for
// its response or request model in `api-schema/` (`pnpm api:generate`), so a field renamed or retyped in
// `backend/app/schemas.py` stops `pnpm typecheck` here. Declare no API record by hand: add a response model
// to the backend, regenerate, and alias it below. Frontend-only models (the camelCase time-off entries,
// calendar events, view models) stay where they are.
import type { SyncPushRequest } from "./api-schema";

export type {
  // Account, users and credentials
  AccessTokenCreated as CreatedApiToken,
  AccessTokenListResponse,
  AccessTokenRead as ApiToken,
  AccountProfile,
  AuditEntryListResponse,
  AuditEntryRead,
  IcalFeedCreated,
  IcalFeedStatus,
  IntegrationClientCreated as CreatedIntegrationClient,
  IntegrationClientListResponse,
  IntegrationClientRead as IntegrationClient,
  HealthSummary,
  UserListResponse,
  UserPreferencesWrite,
  UserUpdate,
  UserPreferencesRead as PreferencesResponse,
  UserRead,
  VapidPublicKeyResponse,
  // Read models (`/api/read-models/*`) and work locations
  CurrentStatusReadModel,
  DashboardReadModel,
  NextShiftsReadModel,
  TeamShiftStatusReadModel,
  TeamStatusReadModel,
  TimeOffSummaryReadModel,
  WorkLocationListResponse,
  WorkLocationRead,
  // Sync wire format (`/api/sync/*`)
  GanttTaskSyncItem,
  GanttTaskSyncRead,
  LabelSyncItem,
  LabelSyncRead,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
  SyncRecordResult,
  SyncStatusResponse,
  TaskSyncItem,
  TaskSyncRead,
  TemplateSyncItem,
  TemplateSyncRead,
  TimeOffEntryRead,
  TimeOffEntrySyncCreateItem,
  TimeOffEntrySyncItem,
  TimeOffEntrySyncRead,
  WorkLocationSyncItem,
  WorkLocationSyncRead,
  // Holiday proxies (`/api/holidays/*`)
  LongWeekendRead as LongWeekend,
  PublicHolidayRead as PublicHoliday,
  SchoolHolidayRead as SchoolHoliday,
} from "./api-schema";

/**
 * A push body as the client builds it: the request model lists every entity array as optional (the server
 * defaults a missing one to empty), but the client always sends all six, so the helpers can rely on them.
 */
export type SyncPushPayload = SyncPushRequest &
  Required<
    Pick<
      SyncPushRequest,
      "labels" | "tasks" | "templates" | "work_locations" | "time_off_entries" | "gantt_tasks"
    >
  >;
