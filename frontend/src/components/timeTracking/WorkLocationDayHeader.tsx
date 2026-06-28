import { useId, useState } from "react";
import Button from "react-bootstrap/Button";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
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
      <div className="d-flex align-items-center gap-2 flex-wrap">
        {settings.homeCountry && (
          <Button
            size="sm"
            variant={stored?.location === "home" ? "primary" : "outline-secondary"}
            onClick={handleHome}
            aria-pressed={stored?.location === "home"}
          >
            <i className="bi bi-house me-1" aria-hidden="true"></i>
            {m.work_location_home()}
          </Button>
        )}
        {settings.officeCountry && (
          <Button
            size="sm"
            variant={stored?.location === "office" ? "primary" : "outline-secondary"}
            onClick={handleOffice}
            aria-pressed={stored?.location === "office"}
          >
            <i className="bi bi-building me-1" aria-hidden="true"></i>
            {m.work_location_office()}
          </Button>
        )}
        <Button
          size="sm"
          variant={stored?.location === "other" ? "primary" : "outline-secondary"}
          onClick={() => setShowOtherModal(true)}
          aria-pressed={stored?.location === "other"}
        >
          <i className="bi bi-geo-alt me-1" aria-hidden="true"></i>
          {m.tt_other_location()}
        </Button>
        {stored && (
          <OverlayTrigger
            placement="top"
            overlay={<Tooltip id={clearTooltipId}>{m.tt_clear_work_location()}</Tooltip>}
          >
            <IconButton
              size="sm"
              variant="outline-danger"
              onClick={handleClear}
              icon="bi-x"
              label={m.tt_clear_work_location()}
            />
          </OverlayTrigger>
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
