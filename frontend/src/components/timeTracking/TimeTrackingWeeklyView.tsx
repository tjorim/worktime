import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Badge from "react-bootstrap/Badge";
import Card from "react-bootstrap/Card";
import { EmptyState } from "@/components/shared/EmptyState";
import { WeekNavigationButtonGroup } from "@/components/shared/NavigationButtonGroup";
import { useSettings } from "@/contexts/SettingsContext";
import { useLiveTime } from "@/hooks/useLiveTime";
import { useWorkLocationStorage } from "@/hooks/useWorkLocationStorage";
import { dayjs } from "@/utils/dateTimeUtils";
import * as m from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { useDefaultLabelColor, type Label } from "./constants";
import type { StoredTimeTrackingTask } from "./types";
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
    <Card className="shadow-sm">
      <Card.Header>
        <div className="d-flex flex-column flex-sm-row justify-content-between align-items-stretch align-items-sm-center gap-2 mb-2">
          <span className="fw-semibold">
            <i className="bi bi-bar-chart me-2" aria-hidden="true"></i>
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
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2">
          <div className="text-muted small">
            {m.week_label({ week: weekStart.isoWeek(), year: weekStart.isoWeekYear() })}
            {isWeeklyCurrent && (
              <Badge bg="success" className="ms-2" aria-label={m.tt_current_week_aria()}>
                {m.this_week()}
              </Badge>
            )}
          </div>
        </div>
      </Card.Header>
      <Card.Body>
        {summary.rows.length === 0 && (
          <EmptyState
            icon="bi-bar-chart"
            title={m.tt_no_weekly_data_title()}
            description={m.tt_no_weekly_data_desc()}
            ctaButton={
              onSwitchToDaily
                ? {
                    label: m.tt_go_to_daily_log(),
                    onClick: () => onSwitchToDaily(todayIso),
                    icon: "bi-plus-circle",
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
      </Card.Body>
    </Card>
  );
}
