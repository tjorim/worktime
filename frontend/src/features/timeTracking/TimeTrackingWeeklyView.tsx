import { ChartColumn as ChartColumnIcon, CirclePlus as CirclePlusIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { WeekNavigationButtonGroup } from "@/components/shared/NavigationButtonGroup";
import { useSettings } from "@/contexts/SettingsContext";
import { useLiveTime } from "@/hooks/useLiveTime";
import { useWorkLocationStorage } from "@/hooks/useWorkLocationStorage";
import { dayjs } from "@/utils/dateTimeUtils";
import * as m from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { useDefaultLabelColor, type Label } from "@/lib/timeTracking/constants";
import type { StoredTimeTrackingTask } from "@/lib/timeTracking/types";
import { WeeklyDataView } from "./WeeklyDataView";
import {
  getWeekDateRange,
  useWeeklyTimeTrackingSummary,
} from "./hooks/useWeeklyTimeTrackingSummary";

type TimeTrackingWeeklyViewProps = {
  tasks: StoredTimeTrackingTask[];
  labels: Label[];
  selectedDate: string;
  onSelectedDateChange: (date: string) => void;
  weeklyTargetHours?: number;
  weeklyWorkingDays?: number;
  onSwitchToDaily?: (date: string) => void;
};

export function TimeTrackingWeeklyView({
  tasks,
  labels,
  selectedDate,
  onSelectedDateChange,
  weeklyTargetHours,
  weeklyWorkingDays,
  onSwitchToDaily,
}: TimeTrackingWeeklyViewProps) {
  const [copiedCellId, setCopiedCellId] = useState<string | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCopyCell = useCallback((id: string, value: string) => {
    navigator.clipboard.writeText(value).then(() => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      setCopiedCellId(id);
      copyTimeoutRef.current = setTimeout(() => setCopiedCellId(null), 1500);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const pluralRules = useMemo(() => new Intl.PluralRules(getLocale()), []);
  const { settings } = useSettings();
  const liveTime = useLiveTime({ precision: "minute" });
  const weeklyDate = dayjs(selectedDate);
  const weekStart = weeklyDate.startOf("isoWeek");
  const isWeeklyCurrent = weekStart.isSame(liveTime.startOf("isoWeek"), "day");
  const todayIso = liveTime.format("YYYY-MM-DD");
  const defaultLabelColor = useDefaultLabelColor();

  const year = weekStart.isoWeekYear();
  const { workLocationMap } = useWorkLocationStorage(year);
  const isoWeek = weekStart.isoWeek();
  const [start, end] = useMemo(() => getWeekDateRange(year, isoWeek), [year, isoWeek]);
  const targetWorkingDays = weeklyWorkingDays && weeklyWorkingDays > 0 ? weeklyWorkingDays : 5;

  const summary = useWeeklyTimeTrackingSummary({
    tasks,
    labels,
    liveTime,
    start,
    end,
    defaultLabelColor,
  });

  const targetDaily = weeklyTargetHours !== undefined ? weeklyTargetHours / targetWorkingDays : 8;
  const weeklyProgressPercent =
    weeklyTargetHours && weeklyTargetHours > 0
      ? Math.min((summary.weekTotal / weeklyTargetHours) * 100, 100)
      : 0;

  return (
    <Card className="tw:overflow-visible tw:shadow-sm">
      <CardHeader className="tw:border-b tw:border-border">
        <div className="tw:mb-2 tw:flex tw:flex-col tw:items-stretch tw:justify-between tw:gap-2 tw:sm:flex-row tw:sm:items-center">
          <span className="tw:font-semibold">
            <Icon icon={ChartColumnIcon} className="tw:mr-2" />
            {m.tt_weekly_heading()}
          </span>
          <WeekNavigationButtonGroup
            isCurrent={isWeeklyCurrent}
            onPrevious={() =>
              onSelectedDateChange(weekStart.subtract(1, "week").format("YYYY-MM-DD"))
            }
            onCurrent={() => onSelectedDateChange(dayjs().format("YYYY-MM-DD"))}
            onNext={() => onSelectedDateChange(weekStart.add(1, "week").format("YYYY-MM-DD"))}
            selectorLabel={m.tt_jump_to_date()}
            selectorValue={selectedDate}
            onSelectorChange={onSelectedDateChange}
          />
        </div>
        <div className="tw:flex tw:flex-col tw:items-start tw:justify-between tw:gap-2 tw:md:flex-row tw:md:items-center">
          <div className="tw:text-sm tw:text-muted-foreground">
            {m.week_label({ week: weekStart.isoWeek(), year: weekStart.isoWeekYear() })}
            {isWeeklyCurrent && (
              <Badge variant="success" className="tw:ml-2" aria-label={m.tt_current_week_aria()}>
                {m.this_week()}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {summary.rows.length === 0 && (
          <EmptyState
            icon={ChartColumnIcon}
            title={m.tt_no_weekly_data_title()}
            description={m.tt_no_weekly_data_desc()}
            ctaButton={
              onSwitchToDaily
                ? {
                    label: m.tt_go_to_daily_log(),
                    onClick: () => onSwitchToDaily(todayIso),
                    icon: CirclePlusIcon,
                  }
                : undefined
            }
          />
        )}

        {summary.rows.length > 0 && (
          <WeeklyDataView
            {...summary}
            weeklyTargetHours={weeklyTargetHours}
            weeklyProgressPercent={weeklyProgressPercent}
            todayIso={todayIso}
            targetDaily={targetDaily}
            crossBorderEnabled={settings.enableCrossBorderTracking}
            workLocationMap={workLocationMap}
            onSwitchToDaily={onSwitchToDaily}
            pluralRules={pluralRules}
            copiedCellId={copiedCellId}
            onCopyCell={handleCopyCell}
          />
        )}
      </CardContent>
    </Card>
  );
}
