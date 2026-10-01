import {
  Building as BuildingIcon,
  House as HouseIcon,
  MapPin as MapPinIcon,
  X as XIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";
import { OtherLocationModal } from "@/components/calendar/OtherLocationModal";
import { IconButton } from "@/components/shared/IconButton";
import { useSettings } from "@/contexts/SettingsContext";
import { useToast } from "@/contexts/ToastContext";
import { useWorkLocationStorage } from "@/hooks/useWorkLocationStorage";
import { dayjs } from "@/utils/dateTimeUtils";
import * as m from "@/paraglide/messages.js";

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
      <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
        {settings.homeCountry && (
          <Button
            size="sm"
            variant={stored?.location === "home" ? "default" : "outline"}
            onClick={handleHome}
            aria-pressed={stored?.location === "home"}
          >
            <Icon icon={HouseIcon} className="tw:mr-1" />
            {m.work_location_home()}
          </Button>
        )}
        {settings.officeCountry && (
          <Button
            size="sm"
            variant={stored?.location === "office" ? "default" : "outline"}
            onClick={handleOffice}
            aria-pressed={stored?.location === "office"}
          >
            <Icon icon={BuildingIcon} className="tw:mr-1" />
            {m.work_location_office()}
          </Button>
        )}
        <Button
          size="sm"
          variant={stored?.location === "other" ? "default" : "outline"}
          onClick={() => setShowOtherModal(true)}
          aria-pressed={stored?.location === "other"}
        >
          <Icon icon={MapPinIcon} className="tw:mr-1" />
          {m.tt_other_location()}
        </Button>
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
      <OtherLocationModal
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
    </>
  );
}
