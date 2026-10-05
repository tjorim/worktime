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
    <Card className="mb-3">
      <CardHeader className="border-b border-border">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold">
            <Icon icon={TrendingUpIcon} className="mr-2" />
            {m.timeoff_vacation_stats()}
          </span>
          <div className="flex items-center gap-2">
            <small className="text-muted-foreground">{m.timeoff_year_label()}</small>
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
        <div className="mb-4 flex items-baseline gap-2">
          <span className="text-2xl font-bold">{formatVacationValue(stats.totalDays)}</span>
          <span className="text-sm text-muted-foreground">
            {m.timeoff_days_logged_in({ year: selectedYear })}
          </span>
        </div>

        {filteredTypes.length === 0 ? (
          <p className="m-0 text-center text-muted-foreground">
            {m.timeoff_no_time_off_year({ year: selectedYear })}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredTypes.map((type) => {
              const colors = getEventColorUtilities([type.key]);
              return (
                <div key={type.key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex size-6 items-center justify-center rounded-full ${colors}`}
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
