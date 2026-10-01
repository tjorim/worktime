import { Clock as ClockIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { Badge } from "@/components/ui/badge";
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
      <div className="tw:mb-2 tw:flex tw:flex-col tw:items-stretch tw:justify-between tw:gap-2 tw:sm:flex-row tw:sm:items-center">
        <span className="tw:font-semibold">
          <Icon icon={ClockIcon} className="tw:mr-2" />
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
      <div className="tw:flex tw:flex-col tw:items-start tw:justify-between tw:gap-2 tw:md:flex-row tw:md:items-center">
        <div className="tw:text-sm tw:text-muted-foreground">
          {dailyDate.format("dddd, MMMM D, YYYY")}
          {isDailyCurrent && (
            <Badge variant="success" className="tw:ml-2" aria-label={m.today()}>
              {m.today()}
            </Badge>
          )}
        </div>
        {crossBorderEnabled && <WorkLocationDayHeader date={date} />}
      </div>
    </>
  );
}
