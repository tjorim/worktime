// The records the API sends and receives, named for the screens. Every one is the type FastAPI generated for
// its response or request model in `api-schema/` (`pnpm api:generate`), so a field renamed or retyped in
// `backend/app/schemas.py` stops `pnpm typecheck` here. Declare no API record by hand: add a response model
// to the backend, regenerate, and alias it below. Frontend-only models (the camelCase time-off entries,
// calendar events, view models) stay where they are.
export type {
  // Account, users and credentials
  AccessTokenCreated as CreatedApiToken,
  AccessTokenRead as ApiToken,
  AccountProfile,
  AuditEntryListResponse,
  AuditEntryRead as AuditEntry,
  IcalFeedCreated,
  IcalFeedStatus,
  IntegrationClientCreated as CreatedIntegrationClient,
  IntegrationClientListResponse,
  IntegrationClientRead as IntegrationClient,
  UserListResponse,
  UserPreferencesRead as PreferencesResponse,
  UserRead as ManagedUser,
  VapidPublicKeyResponse,
  // Sync wire format (`/api/sync/*`)
  GanttTaskSyncItem,
  GanttTaskSyncRead,
  LabelSyncItem,
  LabelSyncRead,
  SyncPullResponse,
  SyncPushRequest as SyncPushPayload,
  SyncPushResponse,
  SyncRecordResult,
  SyncStatusResponse,
  TaskSyncItem,
  TaskSyncRead,
  TemplateSyncItem,
  TemplateSyncRead,
  TimeOffEntrySyncItem,
  TimeOffEntrySyncRead,
  WorkLocationSyncItem,
  WorkLocationSyncRead,
  // Holiday proxies (`/api/holidays/*`)
  LongWeekendRead as LongWeekend,
  PublicHolidayRead as PublicHoliday,
  SchoolHolidayRead as SchoolHoliday,
} from "./api-schema";
