import {
  ChevronRight as ChevronRightIcon,
  CircleCheck as CircleCheckIcon,
  CircleHelp as CircleHelpIcon,
  Info as InfoIcon,
  Keyboard as KeyboardIcon,
  Share as ShareIcon,
  Smartphone as SmartphoneIcon,
  Sparkles as SparklesIcon,
} from "lucide-react";
import * as m from "@/paraglide/messages.js";
import { SettingsBackendStatus } from "@/components/settings/SettingsBackendStatus";
import {
  SettingsActionRow,
  SettingsList,
  SettingsSection,
} from "@/components/settings/SettingsParts";

interface SettingsAboutSectionProps {
  onShareApp: () => void;
  canInstallApp: boolean;
  isAppInstalled: boolean;
  onInstallApp: () => void;
  onShowChangelog: () => void;
  onShowAboutHelp: () => void;
  onShowShortcuts: () => void;
}

export function SettingsAboutSection({
  onShareApp,
  canInstallApp,
  isAppInstalled,
  onInstallApp,
  onShowChangelog,
  onShowAboutHelp,
  onShowShortcuts,
}: SettingsAboutSectionProps) {
  return (
    <SettingsSection icon={InfoIcon} title={m.information_title()}>
      <SettingsList>
        <SettingsActionRow
          icon={SparklesIcon}
          title={m.whats_new_label()}
          description={m.whats_new_description()}
          trailingIcon={ChevronRightIcon}
          onClick={onShowChangelog}
        />
        <SettingsActionRow
          icon={CircleHelpIcon}
          title={m.about_help_label()}
          description={m.about_help_description()}
          trailingIcon={ChevronRightIcon}
          onClick={onShowAboutHelp}
        />
        <SettingsActionRow
          icon={KeyboardIcon}
          title={m.keyboard_shortcuts_label()}
          description={m.keyboard_shortcuts_description()}
          trailingIcon={ChevronRightIcon}
          onClick={onShowShortcuts}
        />
        <SettingsActionRow
          icon={ShareIcon}
          title={m.share_app_label()}
          description={m.share_app_description()}
          trailingIcon={ShareIcon}
          onClick={onShareApp}
        />
        <SettingsActionRow
          icon={SmartphoneIcon}
          title={isAppInstalled ? m.pwa_install_installed_label() : m.pwa_install_app_label()}
          description={
            isAppInstalled
              ? m.pwa_install_installed_description()
              : canInstallApp
                ? m.pwa_install_app_description()
                : m.pwa_install_unavailable_description()
          }
          trailingIcon={isAppInstalled ? CircleCheckIcon : ChevronRightIcon}
          trailingIconClassName={isAppInstalled ? "tw:text-success" : undefined}
          onClick={onInstallApp}
          disabled={!canInstallApp}
        />
        <SettingsBackendStatus />
      </SettingsList>
    </SettingsSection>
  );
}
