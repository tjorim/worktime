import {
  Contrast as ContrastIcon,
  Moon as MoonIcon,
  SlidersHorizontal as SlidersHorizontalIcon,
  Sun as SunIcon,
  type LucideIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { Button } from "@/components/ui/button";
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
          <ChoiceGroup
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
          <ChoiceGroup
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
          <ChoiceGroup
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

interface ChoiceGroupProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; icon?: LucideIcon }>;
}

/** Row of toggle buttons where exactly one option is pressed. */
function ChoiceGroup<T extends string>({ label, value, onChange, options }: ChoiceGroupProps<T>) {
  return (
    <div role="group" className="tw:flex tw:flex-wrap tw:gap-1" aria-label={label}>
      {options.map((option) => (
        <Button
          key={option.value}
          size="sm"
          variant={value === option.value ? "default" : "outline"}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.icon ? <Icon icon={option.icon} className="tw:mr-1" /> : null}
          {option.label}
        </Button>
      ))}
    </div>
  );
}
