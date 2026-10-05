import {
  CloudCheck as CloudCheckIcon,
  RefreshCw as RefreshCwIcon,
  type LucideIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { Button } from "@/components/ui/button";
import { SettingsHint, SettingsSection } from "@/components/settings/SettingsParts";
import { cn } from "@/lib/utils";
import * as m from "@/paraglide/messages.js";

const SYNC_STATUS_TEXT: Record<string, string> = {
  muted: "text-muted-foreground",
  danger: "text-danger-text",
  warning: "text-warning",
  info: "text-info",
  success: "text-success",
};

interface SyncStatusViewModel {
  icon: LucideIcon;
  label: string;
  variant: string;
}

interface SettingsSyncSectionProps {
  isAuthenticated: boolean;
  isSyncing: boolean;
  syncStatus: SyncStatusViewModel;
  lastSyncedLabel: string;
  outboxCount: number;
  conflictCount: number;
  backupStatusLabel: string;
  hasSyncError: boolean;
  retryInSeconds: number | null;
  onTriggerPull: () => void;
}

export function SettingsSyncSection({
  isAuthenticated,
  isSyncing,
  syncStatus,
  lastSyncedLabel,
  outboxCount,
  conflictCount,
  backupStatusLabel,
  hasSyncError,
  retryInSeconds,
  onTriggerPull,
}: SettingsSyncSectionProps) {
  return (
    <SettingsSection icon={CloudCheckIcon} title={m.sync_section_title()}>
      {isAuthenticated ? (
        <div className="flex flex-col gap-3">
          <div
            className={cn(
              "font-medium",
              SYNC_STATUS_TEXT[syncStatus.variant] ?? SYNC_STATUS_TEXT.muted,
            )}
          >
            <Icon
              icon={syncStatus.icon}
              className={cn("mr-2", isSyncing && "animate-spin motion-reduce:animate-none")}
            />
            {syncStatus.label}
          </div>
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            <div>
              <span className="font-medium">{m.sync_last_synced_label()}:</span> {lastSyncedLabel}
            </div>
            <div>
              <span className="font-medium">{m.sync_pending_changes_label()}:</span> {outboxCount}
            </div>
            <div>
              <span className="font-medium">{m.sync_conflicts_label()}:</span> {conflictCount}
            </div>
            <div>
              <span className="font-medium">{m.sync_backup_status_label()}:</span>{" "}
              {backupStatusLabel}
            </div>
            {hasSyncError && retryInSeconds !== null ? (
              <div>
                <span className="font-medium">{m.sync_retry_in_label()}:</span>{" "}
                {m.sync_retry_in_seconds({ seconds: String(retryInSeconds) })}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onTriggerPull} disabled={isSyncing}>
              <Icon icon={RefreshCwIcon} />
              {isSyncing ? m.sync_manual_pull_busy() : m.sync_manual_pull_btn()}
            </Button>
          </div>
        </div>
      ) : (
        <SettingsHint>{m.sync_signed_out_description()}</SettingsHint>
      )}
    </SettingsSection>
  );
}
