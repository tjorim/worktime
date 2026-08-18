import ListGroup from "react-bootstrap/ListGroup";
import * as m from "@/paraglide/messages.js";

interface SettingsDataSectionProps {
  onShareApp: () => void;
  onShowBackupDialog: () => void;
  onRestoreBackup: () => void;
  isRestoringBackup: boolean;
  onResetSettings: () => void;
}

export function SettingsDataSection({
  onShareApp,
  onShowBackupDialog,
  onRestoreBackup,
  isRestoringBackup,
  onResetSettings,
}: SettingsDataSectionProps) {
  return (
    <div>
      <div className="p-3">
        <h6 className="text-muted mb-3">
          <i className="bi bi-lightning me-2"></i>
          {m.quick_actions_title()}
        </h6>
        <ListGroup variant="flush">
          <ListGroup.Item action onClick={onShareApp}>
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div className="fw-medium">
                  <i className="bi bi-share me-2"></i>
                  {m.share_app_label()}
                </div>
                <small className="text-muted">{m.share_app_description()}</small>
              </div>
              <i className="bi bi-share text-muted"></i>
            </div>
          </ListGroup.Item>
          <ListGroup.Item action onClick={onShowBackupDialog}>
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div className="fw-medium">
                  <i className="bi bi-download me-2"></i>
                  {m.backup_app_data_label()}
                </div>
                <small className="text-muted">{m.backup_app_data_description()}</small>
              </div>
              <i className="bi bi-chevron-right text-muted"></i>
            </div>
          </ListGroup.Item>
          <ListGroup.Item action onClick={onRestoreBackup} disabled={isRestoringBackup}>
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div className="fw-medium">
                  <i className="bi bi-upload me-2"></i>
                  {isRestoringBackup ? m.restore_backup_busy() : m.restore_backup_label()}
                </div>
                <small className="text-muted">{m.restore_backup_description()}</small>
              </div>
              <i className="bi bi-chevron-right text-muted"></i>
            </div>
          </ListGroup.Item>
          <ListGroup.Item action onClick={onResetSettings} className="text-danger">
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div className="fw-medium">
                  <i className="bi bi-trash me-2"></i>
                  {m.reset_settings_label()}
                </div>
                <small className="text-muted">{m.reset_settings_description()}</small>
              </div>
              <i className="bi bi-arrow-clockwise text-danger"></i>
            </div>
          </ListGroup.Item>
        </ListGroup>
      </div>
    </div>
  );
}
