import {
  ChevronRight as ChevronRightIcon,
  Download as DownloadIcon,
  RotateCw as RotateCwIcon,
  Trash2 as Trash2Icon,
  Upload as UploadIcon,
  Zap as ZapIcon,
} from "lucide-react";
import {
  SettingsActionRow,
  SettingsList,
  SettingsSection,
} from "@/components/settings/SettingsParts";
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
    <SettingsSection icon={ZapIcon} title={m.quick_actions_title()}>
      <SettingsList>
        <SettingsActionRow
          icon={DownloadIcon}
          title={m.backup_app_data_label()}
          description={m.backup_app_data_description()}
          trailingIcon={ChevronRightIcon}
          onClick={onShowBackupDialog}
        />
        <SettingsActionRow
          icon={UploadIcon}
          title={isRestoringBackup ? m.restore_backup_busy() : m.restore_backup_label()}
          description={m.restore_backup_description()}
          trailingIcon={ChevronRightIcon}
          onClick={onRestoreBackup}
          disabled={isRestoringBackup}
          aria-busy={isRestoringBackup}
        />
        <SettingsActionRow
          icon={Trash2Icon}
          title={m.reset_settings_label()}
          description={m.reset_settings_description()}
          trailingIcon={RotateCwIcon}
          trailingIconClassName="text-danger-text"
          className="text-danger-text"
          onClick={onResetSettings}
        />
      </SettingsList>
    </SettingsSection>
  );
}
