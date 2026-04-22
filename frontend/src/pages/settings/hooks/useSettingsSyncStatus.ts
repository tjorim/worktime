import { useMemo } from "react";
import { dayjs } from "@/utils/dateTimeUtils";
import * as m from "@/paraglide/messages.js";

interface UseSettingsSyncStatusParams {
  conflictCount: number;
  hasSyncError: boolean;
  isAuthenticated: boolean;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  outboxCount: number;
  retryAfter: number | null;
  backupEnabled?: boolean;
}

export function useSettingsSyncStatus({
  backupEnabled,
  conflictCount,
  hasSyncError,
  isAuthenticated,
  isSyncing,
  lastSyncedAt,
  outboxCount,
  retryAfter,
}: UseSettingsSyncStatusParams) {
  const syncStatus = useMemo(() => {
    if (!isAuthenticated) {
      return {
        icon: "bi-cloud-slash",
        label: m.account_not_signed_in(),
        variant: "muted",
      };
    }
    if (hasSyncError) {
      return { icon: "bi-cloud-slash", label: m.sync_indicator_error(), variant: "danger" };
    }
    if (conflictCount > 0) {
      return {
        icon: "bi-exclamation-triangle",
        label: m.sync_indicator_conflicts({ count: String(conflictCount) }),
        variant: "warning",
      };
    }
    if (isSyncing) {
      return { icon: "bi-arrow-repeat", label: m.sync_indicator_syncing(), variant: "info" };
    }
    if (outboxCount > 0) {
      return {
        icon: "bi-cloud-upload",
        label: m.sync_indicator_pending({ count: String(outboxCount) }),
        variant: "warning",
      };
    }
    if (lastSyncedAt) {
      return { icon: "bi-cloud-check", label: m.sync_indicator_synced(), variant: "success" };
    }
    return {
      icon: "bi-cloud",
      label: m.sync_never_synced(),
      variant: "muted",
    };
  }, [isAuthenticated, hasSyncError, conflictCount, isSyncing, outboxCount, lastSyncedAt]);

  const lastSyncedLabel = lastSyncedAt
    ? dayjs(lastSyncedAt).format("DD MMM YYYY HH:mm")
    : m.sync_never_synced();

  const retryInSeconds =
    retryAfter !== null ? Math.max(0, Math.ceil((retryAfter - Date.now()) / 1_000)) : null;

  const backupStatusLabel = useMemo(() => {
    if (backupEnabled === true) return m.sync_backup_status_enabled();
    if (backupEnabled === false) return m.sync_backup_status_disabled();
    return m.sync_backup_status_unknown();
  }, [backupEnabled]);

  return {
    backupStatusLabel,
    lastSyncedLabel,
    retryInSeconds,
    syncStatus,
  };
}
