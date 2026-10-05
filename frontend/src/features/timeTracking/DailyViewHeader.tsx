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
      <div className="mb-2 flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center">
        <span className="font-semibold">
          <Icon icon={ClockIcon} className="mr-2" />
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
      <div className="flex flex-col items-start justify-between gap-2 md:flex-row md:items-center">
        <div className="text-sm text-muted-foreground">
          {dailyDate.format("dddd, MMMM D, YYYY")}
          {isDailyCurrent && (
            <Badge variant="success" className="ml-2" aria-label={m.today()}>
              {m.today()}
            </Badge>
          )}
        </div>
        {crossBorderEnabled && <WorkLocationDayHeader date={date} />}
      </div>
    </>
  );
}
