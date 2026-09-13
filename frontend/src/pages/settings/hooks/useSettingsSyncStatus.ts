import { useEffect, useMemo, useState } from "react";
import { dayjs } from "@/utils/dateTimeUtils";
import * as m from "@/paraglide/messages.js";

interface UseSettingsSyncStatusParams {
  isAuthenticated: boolean;
  hasSyncError: boolean;
  conflictCount: number;
  isSyncing: boolean;
  outboxCount: number;
  lastSyncedAt: string | number | null;
  retryAfter: number | null;
  backupEnabled: boolean | null | undefined;
}

export function useSettingsSyncStatus({
  isAuthenticated,
  hasSyncError,
  conflictCount,
  isSyncing,
  outboxCount,
  lastSyncedAt,
  retryAfter,
  backupEnabled,
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

  // Tick every second while a back-off window is active so the countdown stays
  // accurate. Storing the actual timestamp (rather than calling Date.now()
  // directly in the memo below) keeps render pure.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (retryAfter === null || Date.now() >= retryAfter) return;
    const id = setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);
      if (currentTime >= retryAfter) {
        clearInterval(id);
      }
    }, 1_000);
    return () => clearInterval(id);
  }, [retryAfter]);

  const { retryInSeconds, lastSyncedLabel, backupStatusLabel } = useMemo(
    () => ({
      retryInSeconds: retryAfter !== null ? Math.max(0, Math.ceil((retryAfter - now) / 1_000)) : null,
      lastSyncedLabel: lastSyncedAt
        ? dayjs(lastSyncedAt).format("DD MMM YYYY HH:mm")
        : m.sync_never_synced(),
      backupStatusLabel:
        backupEnabled === true
          ? m.sync_backup_status_enabled()
          : backupEnabled === false
            ? m.sync_backup_status_disabled()
            : m.sync_backup_status_unknown(),
    }),
    [retryAfter, now, lastSyncedAt, backupEnabled],
  );

  return {
    syncStatus,
    retryInSeconds,
    lastSyncedLabel,
    backupStatusLabel,
  };
}
