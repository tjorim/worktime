import { Globe as GlobeIcon, LayoutGrid as LayoutGridIcon } from "lucide-react";
import { CountrySelect } from "@/components/shared/CountrySelect";
import {
  SettingsHint,
  SettingsList,
  SettingsRow,
  SettingsSection,
  SettingsSwitchRow,
} from "@/components/settings/SettingsParts";
import type { CountryCode } from "@/types/countries";
import * as m from "@/paraglide/messages.js";

interface SettingsFeaturesSectionProps {
  enableTimeOff: boolean;
  enableTimeTracking: boolean;
  enableGantt: boolean;
  enableCrossBorderTracking: boolean;
  enableUnifiedCalendar: boolean;
  homeCountry: CountryCode | null;
  officeCountry: CountryCode | null;
  onToggleTimeOff: (checked: boolean) => void;
  onToggleTimeTracking: (checked: boolean) => void;
  onToggleGantt: (checked: boolean) => void;
  onToggleCrossBorderTracking: (checked: boolean) => void;
  onToggleUnifiedCalendar: (checked: boolean) => void;
  onUpdateHomeCountry: (country: CountryCode | null) => void;
  onUpdateOfficeCountry: (country: CountryCode | null) => void;
}

export function SettingsFeaturesSection({
  enableTimeOff,
  enableTimeTracking,
  enableGantt,
  enableCrossBorderTracking,
  enableUnifiedCalendar,
  homeCountry,
  officeCountry,
  onToggleTimeOff,
  onToggleTimeTracking,
  onToggleGantt,
  onToggleCrossBorderTracking,
  onToggleUnifiedCalendar,
  onUpdateHomeCountry,
  onUpdateOfficeCountry,
}: SettingsFeaturesSectionProps) {
  return (
    <>
      <SettingsSection icon={LayoutGridIcon} title={m.features_title()}>
        <SettingsList>
          <SettingsSwitchRow
            id="toggle-timeoff"
            title={m.time_off_label()}
            description={m.time_off_description()}
            checked={enableTimeOff}
            onCheckedChange={onToggleTimeOff}
          />
          <SettingsSwitchRow
            id="toggle-timetracking"
            title={m.time_tracking_label()}
            description={m.time_tracking_description()}
            checked={enableTimeTracking}
            onCheckedChange={onToggleTimeTracking}
          />
          <SettingsSwitchRow
            id="toggle-gantt"
            title={m.personal_gantt_label()}
            description={m.personal_gantt_description()}
            checked={enableGantt}
            onCheckedChange={onToggleGantt}
          />
          <SettingsSwitchRow
            id="toggle-crossborder"
            title={m.cross_border_tracking_label()}
            description={m.cross_border_tracking_description()}
            checked={enableCrossBorderTracking}
            onCheckedChange={onToggleCrossBorderTracking}
          />
          <SettingsSwitchRow
            id="toggle-unified-calendar"
            title={m.unified_calendar_label()}
            description={m.unified_calendar_description()}
            checked={enableUnifiedCalendar}
            onCheckedChange={onToggleUnifiedCalendar}
          />
        </SettingsList>
      </SettingsSection>

      {enableCrossBorderTracking && (
        <SettingsSection icon={GlobeIcon} title={m.cross_border_setup_label()}>
          <SettingsHint className="tw:mb-3">{m.cross_border_setup_description()}</SettingsHint>
          <SettingsList>
            <SettingsRow title={m.home_country_label()} description={m.home_country_description()}>
              <div className="tw:w-full tw:sm:w-48">
                <CountrySelect
                  value={homeCountry}
                  onChange={onUpdateHomeCountry}
                  ariaLabel={m.home_country_label()}
                />
              </div>
            </SettingsRow>
            <SettingsRow
              title={m.office_country_label()}
              description={m.office_country_description()}
            >
              <div className="tw:w-full tw:sm:w-48">
                <CountrySelect
                  value={officeCountry}
                  onChange={onUpdateOfficeCountry}
                  ariaLabel={m.office_country_label()}
                />
              </div>
            </SettingsRow>
          </SettingsList>
        </SettingsSection>
      )}
    </>
  );
}
