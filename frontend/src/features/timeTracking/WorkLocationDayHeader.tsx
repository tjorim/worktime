import { BuildingIcon, HouseIcon, MapPinIcon, XIcon } from "lucide-react";
import { lazy, Suspense, useId, useState } from "react";
import { ChoiceToggleGroup } from "@/components/shared/ChoiceToggleGroup";
import { Hint } from "@/components/ui/tooltip";
import { IconButton } from "@/components/shared/IconButton";
import { useSettings } from "@/contexts/SettingsContext";
import { useToast } from "@/contexts/ToastContext";
import { useWorkLocationStorage } from "@/hooks/useWorkLocationStorage";
import { dayjs } from "@/utils/dateTimeUtils";
import * as m from "@/paraglide/messages.js";

// Loaded on first open: it pulls in the country combobox, which would otherwise
// land in the initial bundle.
const OtherLocationModal = lazy(() =>
  import("@/components/calendar/OtherLocationModal").then((module) => ({
    default: module.OtherLocationModal,
  })),
);

interface WorkLocationDayHeaderProps {
  date: string;
}

export function WorkLocationDayHeader({ date }: WorkLocationDayHeaderProps) {
  const clearTooltipId = useId();
  const { settings } = useSettings();
  const year = dayjs(date).year();
  const { workLocationMap, setLocationForDate, clearLocationForDate } =
    useWorkLocationStorage(year);
  const toast = useToast();
  const [showOtherModal, setShowOtherModal] = useState(false);
  // Stay mounted after the first open so the dialog can animate closed.
  const [otherModalOpened, setOtherModalOpened] = useState(false);

  const dayjsDate = dayjs(date);
  const dateKey = dayjsDate.format("YYYY-MM-DD");
  const stored = workLocationMap.get(dateKey);

  const handleHome = () => {
    const ok = setLocationForDate(dayjsDate, "home");
    if (!ok) toast.showError(m.tt_configure_home_country());
  };

  const handleOffice = () => {
    const ok = setLocationForDate(dayjsDate, "office");
    if (!ok) toast.showError(m.tt_configure_office_country());
  };

  const handleClear = () => {
    clearLocationForDate(dayjsDate);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <ChoiceToggleGroup
          label={m.tt_work_location_aria()}
          value={stored?.location}
          onChange={(location) => {
            if (location === "home") handleHome();
            else if (location === "office") handleOffice();
            else {
              setOtherModalOpened(true);
              setShowOtherModal(true);
            }
          }}
          options={[
            ...(settings.homeCountry
              ? [{ value: "home" as const, label: m.work_location_home(), icon: HouseIcon }]
              : []),
            ...(settings.officeCountry
              ? [{ value: "office" as const, label: m.work_location_office(), icon: BuildingIcon }]
              : []),
            { value: "other" as const, label: m.tt_other_location(), icon: MapPinIcon },
          ]}
        />
        {stored && (
          <Hint
            placement="top"
            content={<div id={clearTooltipId}>{m.tt_clear_work_location()}</div>}
          >
            <IconButton
              size="sm"
              variant="destructive"
              onClick={handleClear}
              icon={XIcon}
              label={m.tt_clear_work_location()}
            />
          </Hint>
        )}
      </div>
      {(!settings.homeCountry || !settings.officeCountry) && (
        <p className="text-sm">
          <a href="/settings?section=features">{m.work_location_setup_prompt()}</a>
        </p>
      )}
      {otherModalOpened && (
        <Suspense fallback={null}>
          <OtherLocationModal
            showSetupHint={!settings.homeCountry || !settings.officeCountry}
            show={showOtherModal}
            date={dayjsDate}
            existing={stored}
            onHide={() => setShowOtherModal(false)}
            onConfirm={(countryCode, label) => {
              const ok = setLocationForDate(dayjsDate, "other", { countryCode, label });
              if (ok) {
                setShowOtherModal(false);
              } else {
                toast.showError(m.tt_could_not_save_location());
              }
            }}
          />
        </Suspense>
      )}
    </>
  );
}
