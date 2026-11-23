import { TrendingUpIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { getEventColorUtilities } from "@/lib/hday/presentation";
import type { TimeOffEntry } from "@/lib/time-off/types";
import { dayjs } from "@/lib/dates/dateTimeUtils";
import {
  EVENT_TYPE_ICONS,
  calculateVacationStats,
  type VacationTypeTotals,
  getAvailableYears,
} from "@/features/time-off/vacationCalculations";
import * as m from "@/paraglide/messages.js";

import { HolidayStatusNotice } from "@/components/HolidayStatusNotice";
import { useStatisticsWorkingDays } from "@/hooks/useStatisticsWorkingDays";

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

  const workingDays = useStatisticsWorkingDays(selectedYear);
  const stats = useMemo(
    () => calculateVacationStats(entries, selectedYear, workingDays),
    [entries, selectedYear, workingDays],
  );

  return (
    <Card className="mb-3">
      <CardHeader className="border-b border-border">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold">
            <Icon icon={TrendingUpIcon} className="mr-2" />
            {m.timeoff_stats()}
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
        <p className="text-sm text-muted-foreground">{m.timeoff_statistics_counting_note()}</p>
        <HolidayStatusNotice status={workingDays.holidayStatus} />
        <p className="mb-4 text-2xl font-bold">
          {m.timeoff_leave_days_in_year({ count: stats.totalDays, year: selectedYear })}
        </p>

        {stats.byType.length === 0 && stats.otherByType.length === 0 ? (
          <p className="m-0 text-center text-muted-foreground">
            {m.timeoff_no_entries_year({ year: selectedYear })}
          </p>
        ) : (
          <>
            <TypeBreakdown types={stats.byType} />
            {stats.otherByType.length > 0 && (
              <section className="mt-4 border-t border-border pt-3">
                <h3 className="mb-2 text-sm font-semibold">{m.timeoff_other_entries()}</h3>
                <TypeBreakdown types={stats.otherByType} />
              </section>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TypeBreakdown({ types }: { types: VacationTypeTotals[] }) {
  if (types.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {types.map((type) => {
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
            <Badge className={colors}>{m.timeoff_day_count({ count: type.days })}</Badge>
          </div>
        );
      })}
    </div>
  );
}
