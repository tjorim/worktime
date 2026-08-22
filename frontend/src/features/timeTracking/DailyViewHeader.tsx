import Badge from "react-bootstrap/Badge";
import { DayNavigationButtonGroup } from "@/components/shared/NavigationButtonGroup";
import { dayjs } from "@/utils/dateTimeUtils";
import * as m from "@/paraglide/messages.js";
import { WorkLocationDayHeader } from "./WorkLocationDayHeader";

interface DailyViewHeaderProps {
  date: string;
  crossBorderEnabled: boolean;
  onSelectedDateChange: (date: string) => void;
}

export function DailyViewHeader({
  date,
  crossBorderEnabled,
  onSelectedDateChange,
}: DailyViewHeaderProps) {
  const dailyDate = dayjs(date);
  const isDailyCurrent = dailyDate.isSame(dayjs(), "day");

  return (
    <>
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-stretch align-items-sm-center gap-2 mb-2">
        <span className="fw-semibold">
          <i className="bi bi-clock me-2" aria-hidden="true"></i>
          {m.tt_daily_heading()}
        </span>
        <DayNavigationButtonGroup
          isCurrent={isDailyCurrent}
          onPrevious={() => onSelectedDateChange(dailyDate.subtract(1, "day").format("YYYY-MM-DD"))}
          onCurrent={() => onSelectedDateChange(dayjs().format("YYYY-MM-DD"))}
          onNext={() => onSelectedDateChange(dailyDate.add(1, "day").format("YYYY-MM-DD"))}
          selectorLabel={m.tt_jump_to_date()}
          selectorValue={date}
          onSelectorChange={onSelectedDateChange}
        />
      </div>
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2">
        <div className="text-muted small">
          {dailyDate.format("dddd, MMMM D, YYYY")}
          {isDailyCurrent && (
            <Badge bg="success" className="ms-2" aria-label={m.today()}>
              {m.today()}
            </Badge>
          )}
        </div>
        {crossBorderEnabled && <WorkLocationDayHeader date={date} />}
      </div>
    </>
  );
}
