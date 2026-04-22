import Button from "react-bootstrap/Button";
import ListGroup from "react-bootstrap/ListGroup";
import * as m from "@/paraglide/messages.js";

interface SyncStatusViewModel {
  icon: string;
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
    <div className="border-bottom">
      <div className="p-3">
        <h6 className="text-muted mb-3">
          <i className="bi bi-cloud-check me-2"></i>
          {m.sync_section_title()}
        </h6>
        <ListGroup variant="flush">
          {isAuthenticated ? (
            <ListGroup.Item>
              <div className="d-flex flex-column gap-3">
                <div className={`fw-medium text-${syncStatus.variant}`}>
                  <i
                    className={`bi ${syncStatus.icon}${isSyncing ? " sync-spin" : ""} me-2`}
                    aria-hidden="true"
                  ></i>
                  {syncStatus.label}
                </div>
                <div className="small text-muted d-flex flex-column gap-1">
                  <div>
                    <span className="fw-medium">{m.sync_last_synced_label()}:</span> {lastSyncedLabel}
                  </div>
                  <div>
                    <span className="fw-medium">{m.sync_pending_changes_label()}:</span> {outboxCount}
                  </div>
                  <div>
                    <span className="fw-medium">{m.sync_conflicts_label()}:</span> {conflictCount}
                  </div>
                  <div>
                    <span className="fw-medium">{m.sync_backup_status_label()}:</span> {backupStatusLabel}
                  </div>
                  {hasSyncError && retryInSeconds !== null ? (
                    <div>
                      <span className="fw-medium">{m.sync_retry_in_label()}:</span>{" "}
                      {m.sync_retry_in_seconds({ seconds: String(retryInSeconds) })}
                    </div>
                  ) : null}
                </div>
                <div className="d-flex gap-2 flex-wrap">
                  <Button variant="outline-primary" size="sm" onClick={onTriggerPull} disabled={isSyncing}>
                    <i className="bi bi-arrow-repeat me-1"></i>
                    {isSyncing ? m.sync_manual_pull_busy() : m.sync_manual_pull_btn()}
                  </Button>
                </div>
              </div>
            </ListGroup.Item>
          ) : (
            <ListGroup.Item>
              <small className="text-muted">{m.sync_signed_out_description()}</small>
            </ListGroup.Item>
          )}
        </ListGroup>
      </div>
    </div>
  );
}
