import {
  ChevronRight as ChevronRightIcon,
  Download as DownloadIcon,
  RotateCw as RotateCwIcon,
  Trash2 as Trash2Icon,
  Upload as UploadIcon,
  Zap as ZapIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import ListGroup from "react-bootstrap/ListGroup";
import * as m from "@/paraglide/messages.js";

interface SettingsDataSectionProps {
  onShowBackupDialog: () => void;
  onRestoreBackup: () => void;
  isRestoringBackup: boolean;
  onResetSettings: () => void;
}

export function SettingsDataSection({
  onShowBackupDialog,
  onRestoreBackup,
  isRestoringBackup,
  onResetSettings,
}: SettingsDataSectionProps) {
  return (
    <div>
      <div className="p-3">
        <h6 className="text-muted mb-3">
          <Icon icon={ZapIcon} className="me-2" />
          {m.quick_actions_title()}
        </h6>
        <ListGroup variant="flush">
          <ListGroup.Item action onClick={onShowBackupDialog}>
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div className="fw-medium">
                  <Icon icon={DownloadIcon} className="me-2" />
                  {m.backup_app_data_label()}
                </div>
                <small className="text-muted">{m.backup_app_data_description()}</small>
              </div>
              <Icon icon={ChevronRightIcon} className="text-muted" />
            </div>
          </ListGroup.Item>
          <ListGroup.Item
            action
            onClick={onRestoreBackup}
            disabled={isRestoringBackup}
            aria-busy={isRestoringBackup}
          >
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div className="fw-medium">
                  <Icon icon={UploadIcon} className="me-2" />
                  {isRestoringBackup ? m.restore_backup_busy() : m.restore_backup_label()}
                </div>
                <small className="text-muted">{m.restore_backup_description()}</small>
              </div>
              <Icon icon={ChevronRightIcon} className="text-muted" />
            </div>
          </ListGroup.Item>
          <ListGroup.Item action onClick={onResetSettings} className="text-danger">
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div className="fw-medium">
                  <Icon icon={Trash2Icon} className="me-2" />
                  {m.reset_settings_label()}
                </div>
                <small className="text-muted">{m.reset_settings_description()}</small>
              </div>
              <Icon icon={RotateCwIcon} className="text-danger" />
            </div>
          </ListGroup.Item>
        </ListGroup>
      </div>
    </div>
  );
}
