import { TrendingUp as TrendingUpIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { getEventColorUtilities } from "@/lib/hday/presentation";
import type { TimeOffEntry } from "@/lib/timeOff/types";
import { dayjs } from "@/utils/dateTimeUtils";
import {
  EVENT_TYPE_ICONS,
  calculateVacationStats,
  formatVacationValue,
  getAvailableYears,
} from "@/utils/vacationCalculations";
import * as m from "@/paraglide/messages.js";

interface TimeOffStatsViewProps {
  entries: TimeOffEntry[];
}

export function TimeOffStatsView({ entries }: TimeOffStatsViewProps) {
  const years = useMemo(() => getAvailableYears(entries, dayjs().year()), [entries]);
  const [selectedYear, setSelectedYear] = useState(() => years[0] ?? dayjs().year());

  // Clamp the selection back to an available year the moment `years` changes
  // out from under it, as a same-render response rather than a follow-up effect.
  const [prevYears, setPrevYears] = useState(years);
  if (prevYears !== years) {
    setPrevYears(years);
    if (!years.includes(selectedYear)) {
      setSelectedYear(years[0] ?? dayjs().year());
    }
  }

  const stats = useMemo(
    () => calculateVacationStats(entries, selectedYear),
    [entries, selectedYear],
  );

  const filteredTypes = useMemo(() => stats.byType.filter((type) => type.days > 0), [stats.byType]);

  return (
    <Card className="tw:mb-3">
      <CardHeader className="tw:border-b tw:border-border">
        <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2">
          <span className="tw:font-semibold">
            <Icon icon={TrendingUpIcon} className="tw:mr-2" />
            {m.timeoff_vacation_stats()}
          </span>
          <div className="tw:flex tw:items-center tw:gap-2">
            <small className="tw:text-muted-foreground">{m.timeoff_year_label()}</small>
            <NativeSelect
              aria-label={m.timeoff_select_year_aria()}
              value={selectedYear}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="tw:mb-4 tw:flex tw:items-baseline tw:gap-2">
          <span className="tw:text-2xl tw:font-bold">{formatVacationValue(stats.totalDays)}</span>
          <span className="tw:text-sm tw:text-muted-foreground">
            {m.timeoff_days_logged_in({ year: selectedYear })}
          </span>
        </div>

        {filteredTypes.length === 0 ? (
          <p className="tw:m-0 tw:text-center tw:text-muted-foreground">
            {m.timeoff_no_time_off_year({ year: selectedYear })}
          </p>
        ) : (
          <div className="tw:flex tw:flex-col tw:gap-2">
            {filteredTypes.map((type) => {
              const colors = getEventColorUtilities([type.key]);
              return (
                <div key={type.key} className="tw:flex tw:items-center tw:justify-between">
                  <div className="tw:flex tw:items-center tw:gap-2">
                    <span
                      className={`tw:inline-flex tw:size-6 tw:items-center tw:justify-center tw:rounded-full ${colors}`}
                    >
                      <Icon icon={EVENT_TYPE_ICONS[type.key]} />
                    </span>
                    <span>{type.label}</span>
                  </div>
                  <Badge className={colors}>
                    {formatVacationValue(type.days)} {m.timeoff_days_unit()}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
