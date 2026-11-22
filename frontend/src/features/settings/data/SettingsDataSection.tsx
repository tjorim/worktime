import type { ReactNode } from "react";
import { useTimeOffExport } from "@/hooks/useTimeOffExport";
import {
  ChevronRightIcon,
  DownloadIcon,
  FileTextIcon,
  RotateCwIcon,
  TrashIcon,
  UploadIcon,
  ZapIcon,
} from "lucide-react";
import {
  SettingsActionRow,
  SettingsList,
  SettingsSection,
} from "@/features/settings/SettingsParts";
import * as m from "@/paraglide/messages.js";

interface SettingsDataSectionProps {
  accountExport: ReactNode;
  onShowBackupDialog: () => void;
  onRestoreBackup: () => void;
  isRestoringBackup: boolean;
  onResetSettings: () => void;
}

export function SettingsDataSection({
  accountExport,
  onShowBackupDialog,
  onRestoreBackup,
  isRestoringBackup,
  onResetSettings,
}: SettingsDataSectionProps) {
  const exportTimeOff = useTimeOffExport();

  return (
    <>
      <SettingsSection icon={DownloadIcon} title={m.settings_exports_title()}>
        <SettingsList>
          {accountExport}
          <SettingsActionRow
            icon={DownloadIcon}
            title={m.backup_app_data_label()}
            description={m.backup_app_data_description()}
            trailingIcon={ChevronRightIcon}
            onClick={onShowBackupDialog}
          />
          <SettingsActionRow
            icon={FileTextIcon}
            title={m.settings_time_off_export_title()}
            description={m.settings_time_off_export_description()}
            trailingIcon={DownloadIcon}
            onClick={exportTimeOff}
          />
        </SettingsList>
      </SettingsSection>
      <SettingsSection icon={ZapIcon} title={m.settings_restore_reset_title()}>
        <SettingsList>
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
            icon={TrashIcon}
            title={m.reset_settings_label()}
            description={m.reset_settings_description()}
            trailingIcon={RotateCwIcon}
            trailingIconClassName="text-danger-text"
            className="text-danger-text"
            onClick={onResetSettings}
          />
        </SettingsList>
      </SettingsSection>
    </>
  );
}
