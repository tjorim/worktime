import {
  Contrast as ContrastIcon,
  Moon as MoonIcon,
  SlidersHorizontal as SlidersHorizontalIcon,
  Sun as SunIcon,
} from "lucide-react";
import { ChoiceToggleGroup } from "@/components/shared/ChoiceToggleGroup";
import {
  SettingsList,
  SettingsRow,
  SettingsSection,
  SettingsSwitchRow,
} from "@/components/settings/SettingsParts";
import * as m from "@/paraglide/messages.js";

interface SettingsGeneralSectionProps {
  timeFormat: "12h" | "24h";
  theme: "light" | "dark" | "auto";
  locale: "en" | "nl";
  notificationsEnabled: boolean;
  onTimeFormatChange: (format: "12h" | "24h") => void;
  onThemeChange: (theme: "light" | "dark" | "auto") => void;
  onLocaleChange: (locale: "en" | "nl") => void;
  onNotificationsChange: (enabled: boolean) => void;
}

export function SettingsGeneralSection({
  timeFormat,
  theme,
  locale,
  notificationsEnabled,
  onTimeFormatChange,
  onThemeChange,
  onLocaleChange,
  onNotificationsChange,
}: SettingsGeneralSectionProps) {
  return (
    <SettingsSection icon={SlidersHorizontalIcon} title={m.preferences_title()}>
      <SettingsList>
        <SettingsRow title={m.time_format_label()} description={m.time_format_description()}>
          <ChoiceToggleGroup
            label={m.time_format_label()}
            value={timeFormat}
            onChange={onTimeFormatChange}
            options={[
              { value: "24h", label: "24h" },
              { value: "12h", label: "12h" },
            ]}
          />
        </SettingsRow>
        <SettingsRow title={m.theme_label()} description={m.theme_description()}>
          <ChoiceToggleGroup
            label={m.theme_label()}
            value={theme}
            onChange={onThemeChange}
            options={[
              { value: "auto", label: m.theme_auto(), icon: ContrastIcon },
              { value: "light", label: m.theme_light(), icon: SunIcon },
              { value: "dark", label: m.theme_dark(), icon: MoonIcon },
            ]}
          />
        </SettingsRow>
        <SettingsRow title={m.language_label()} description={m.language_description()}>
          <ChoiceToggleGroup
            label={m.language_label()}
            value={locale}
            onChange={onLocaleChange}
            options={[
              { value: "en", label: "EN" },
              { value: "nl", label: "NL" },
            ]}
          />
        </SettingsRow>
        <SettingsSwitchRow
          id="toggle-notifications"
          title={m.notifications_label()}
          description={m.notifications_description()}
          checked={notificationsEnabled}
          onCheckedChange={onNotificationsChange}
        />
      </SettingsList>
    </SettingsSection>
  );
}
