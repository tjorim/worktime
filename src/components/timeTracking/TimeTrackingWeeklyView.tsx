import { useMemo } from "react";
import Badge from "react-bootstrap/Badge";
import Card from "react-bootstrap/Card";
import ProgressBar from "react-bootstrap/ProgressBar";
import Table from "react-bootstrap/Table";
import { dayjs } from "../../utils/dateTimeUtils";
import { WeekNavigationButtonGroup } from "../shared/NavigationButtonGroup";
import { buildLabelNameMap, useDefaultLabelColor, type TimeTrackingLabel } from "./constants";
import type { StoredTimeTrackingTask } from "./types";
import { effectiveDurationHours } from "./timeUtils";
import { EmptyState } from "../shared/EmptyState";

type OverviewRow = {
  label: string;
  date: string;
  hours: number;
};

type Summary = Record<string, number>;

type TimeTrackingWeeklyViewProps = {
  tasks: StoredTimeTrackingTask[];
  labels: TimeTrackingLabel[];
  selectedDate: string;
  onSelectedDateChange: (date: string) => void;
  weeklyTargetHours?: number;
  onSwitchToDaily?: () => void;
};

function getWeekDateRange(year: number, week: number): [string, string] {
  // Jan 4 is always in ISO week 1 of its calendar year
  const start = dayjs(`${year}-01-04`).isoWeek(week).startOf("isoWeek");
  const end = start.endOf("isoWeek");
  return [start.format("YYYY-MM-DD"), end.format("YYYY-MM-DD")];
}

function buildWeekDays(startIso: string) {
  return Array.from({ length: 7 }, (_, idx) => {
    const date = dayjs(startIso).add(idx, "day");
    return {
      iso: date.format("YYYY-MM-DD"),
      label: date.format("dddd"),
    };
  });
}

export function TimeTrackingWeeklyView({
  tasks,
  labels,
  selectedDate,
  onSelectedDateChange,
  weeklyTargetHours,
  onSwitchToDaily,
}: TimeTrackingWeeklyViewProps) {
  const weeklyDate = dayjs(selectedDate);
  const weekStart = weeklyDate.startOf("isoWeek");
  const isWeeklyCurrent = weekStart.isSame(dayjs().startOf("isoWeek"), "day");
  const todayIso = dayjs().format("YYYY-MM-DD");
  const defaultLabelColor = useDefaultLabelColor();

  // Extract primitives for stable useMemo dependencies
  const year = weekStart.isoWeekYear();
  const isoWeek = weekStart.isoWeek();
  const [start, end] = useMemo(() => getWeekDateRange(year, isoWeek), [year, isoWeek]);

  const labelNameById = useMemo(() => buildLabelNameMap(labels), [labels]);
  // Build label name to color map for efficient lookup
  const labelNameToColor = useMemo(() => {
    const map: Record<string, string> = {};
    labels.forEach((label) => {
      map[label.name] = label.color;
    });
    return map;
  }, [labels]);

  const rows = useMemo<OverviewRow[]>(
    () =>
      tasks
        .filter((task) => {
          const taskDate = task.startTime.substring(0, 10);
          return taskDate >= start && taskDate <= end;
        })
        .map((task) => {
          const startDayjs = dayjs(task.startTime);
          const stopDayjs = task.stopTime ? dayjs(task.stopTime) : dayjs();
          const rawHours = Math.max(stopDayjs.diff(startDayjs, "hour", true), 0);
          const labelName = labelNameById[task.label] ?? "Unknown label";
          return {
            date: task.startTime.substring(0, 10),
            label: labelName,
            hours: effectiveDurationHours(rawHours, task.includesBreak),
          };
        }),
    [tasks, start, end, labelNameById],
  );

  const { summary, dailyTotals, labelNames, weekTotal, weekDays } = useMemo(() => {
    const totals = rows.reduce<Summary>((acc, row) => {
      acc[row.label] = (acc[row.label] ?? 0) + row.hours;
      return acc;
    }, {});
    const days = buildWeekDays(start);
    const dayTotals = days.reduce<Record<string, Summary>>((acc, day) => {
      acc[day.iso] = {};
      return acc;
    }, {});

    rows.forEach((row) => {
      const bucket = dayTotals[row.date] ?? {};
      bucket[row.label] = (bucket[row.label] ?? 0) + row.hours;
      dayTotals[row.date] = bucket;
    });

    const labelList = Object.keys(totals).sort();
    const weekSum = labelList.reduce((sum, label) => sum + (totals[label] ?? 0), 0);

    return {
      summary: totals,
      dailyTotals: dayTotals,
      labelNames: labelList,
      weekTotal: weekSum,
      weekDays: days,
    };
  }, [rows, start]);

  // Calculate daily totals for each day
  const dailyHourTotals = useMemo(() => {
    return weekDays.map((day) => {
      const daySummary = dailyTotals[day.iso] ?? {};
      return labelNames.reduce((sum, label) => sum + (daySummary[label] ?? 0), 0);
    });
  }, [weekDays, dailyTotals, labelNames]);

  // Calculate average daily hours (only for days with data)
  const avgDailyHours = useMemo(() => {
    const daysWithData = dailyHourTotals.filter((total) => total > 0).length;
    return daysWithData > 0 ? weekTotal / daysWithData : 0;
  }, [dailyHourTotals, weekTotal]);

  // Calculate label percentages
  const labelPercentages = useMemo(() => {
    if (weekTotal === 0) return [];
    return Object.entries(summary)
      .map(([label, hours]) => ({
        label,
        hours,
        percentage: (hours / weekTotal) * 100,
        color: labelNameToColor[label] ?? defaultLabelColor,
      }))
      .sort((a, b) => b.hours - a.hours);
  }, [summary, weekTotal, labelNameToColor, defaultLabelColor]);

  return (
    <Card className="shadow-sm">
      <Card.Header>
        <div className="d-flex justify-content-between align-items-center mb-2">
          <span className="fw-semibold">
            <i className="bi bi-bar-chart me-2" aria-hidden="true"></i>
            Weekly Overview
          </span>
          <WeekNavigationButtonGroup
            isCurrent={isWeeklyCurrent}
            onPrevious={() =>
              onSelectedDateChange(weekStart.subtract(1, "week").format("YYYY-MM-DD"))
            }
            onCurrent={() => onSelectedDateChange(dayjs().format("YYYY-MM-DD"))}
            onNext={() => onSelectedDateChange(weekStart.add(1, "week").format("YYYY-MM-DD"))}
            selectorLabel="Jump to date:"
            selectorValue={selectedDate}
            onSelectorChange={onSelectedDateChange}
          />
        </div>
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2">
          <div className="text-muted small">
            Week {weekStart.isoWeek()} ({weekStart.isoWeekYear()})
            {isWeeklyCurrent && (
              <Badge bg="success" className="ms-2" aria-label="Current week">
                This Week
              </Badge>
            )}
          </div>
        </div>
      </Card.Header>
      <Card.Body>
        {/* Empty State */}
        {rows.length === 0 && (
          <EmptyState
            icon="bi-bar-chart"
            title="No Time Tracking Data Yet"
            description="Start tracking your time in the Daily Log to see your weekly breakdown here."
            ctaButton={
              onSwitchToDaily
                ? { label: "Go to Daily Log", onClick: onSwitchToDaily, icon: "bi-plus-circle" }
                : undefined
            }
          />
        )}

        {/* Enhanced Data View */}
        {rows.length > 0 && (
          <>
            {/* Week Progress Indicator */}
            {weeklyTargetHours !== undefined && (
              <div className="mb-4">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="fw-semibold">Weekly Progress</span>
                  <span className="text-muted">
                    {weekTotal.toFixed(1)}h / {weeklyTargetHours.toFixed(1)}h
                    <Badge
                      bg={weekTotal >= weeklyTargetHours ? "success" : "secondary"}
                      className="ms-2"
                    >
                      {weekTotal >= weeklyTargetHours
                        ? `+${(weekTotal - weeklyTargetHours).toFixed(1)}h`
                        : `${(weeklyTargetHours - weekTotal).toFixed(1)}h remaining`}
                    </Badge>
                  </span>
                </div>
                <ProgressBar
                  now={Math.min((weekTotal / weeklyTargetHours) * 100, 100)}
                  variant={weekTotal >= weeklyTargetHours ? "success" : "primary"}
                  style={{ height: "1.5rem" }}
                  label={`${((weekTotal / weeklyTargetHours) * 100).toFixed(0)}%`}
                />
              </div>
            )}

            {/* Key Metrics Cards */}
            <div className="row g-3 mb-4">
              <div className="col-sm-6 col-lg-3">
                <Card className="text-center h-100">
                  <Card.Body>
                    <div className="text-muted small text-uppercase mb-1">Total Hours</div>
                    <div className="h4 mb-0">{weekTotal.toFixed(1)}h</div>
                  </Card.Body>
                </Card>
              </div>
              <div className="col-sm-6 col-lg-3">
                <Card className="text-center h-100">
                  <Card.Body>
                    <div className="text-muted small text-uppercase mb-1">Avg. Daily Hours</div>
                    <div className="h4 mb-0">{avgDailyHours.toFixed(1)}h</div>
                  </Card.Body>
                </Card>
              </div>
              <div className="col-sm-6 col-lg-3">
                <Card className="text-center h-100">
                  <Card.Body>
                    <div className="text-muted small text-uppercase mb-1">Days Tracked</div>
                    <div className="h4 mb-0">{dailyHourTotals.filter((h) => h > 0).length}</div>
                  </Card.Body>
                </Card>
              </div>
              <div className="col-sm-6 col-lg-3">
                <Card className="text-center h-100">
                  <Card.Body>
                    <div className="text-muted small text-uppercase mb-1">Top Category</div>
                    <div className="h4 mb-0 text-truncate">{labelPercentages[0]?.label ?? "-"}</div>
                  </Card.Body>
                </Card>
              </div>
            </div>

            {/* Daily Breakdown Chart */}
            <div className="mb-4">
              <h6 className="text-uppercase text-muted mb-3">
                <i className="bi bi-calendar-week me-2" aria-hidden="true"></i>
                Daily Breakdown
              </h6>
              <div className="row g-2">
                {weekDays.map((day, index) => {
                  const dayTotal = dailyHourTotals[index] ?? 0;
                  const isToday = day.iso === todayIso;
                  // Divide by 5 working days instead of 7 to show realistic daily targets
                  const targetDaily = weeklyTargetHours !== undefined ? weeklyTargetHours / 5 : 8;
                  const percentage = Math.min((dayTotal / targetDaily) * 100, 100);

                  return (
                    <div key={day.iso} className="col">
                      <div
                        className={`text-center p-2 rounded ${isToday ? "bg-primary bg-opacity-10" : ""}`}
                      >
                        <div
                          className={`small mb-1 ${isToday ? "fw-bold text-primary" : "text-muted"}`}
                        >
                          {day.label.substring(0, 3)}
                          {isToday && (
                            <Badge bg="primary" className="ms-1">
                              Today
                            </Badge>
                          )}
                        </div>
                        <div className="mb-1">
                          <div
                            className="mx-auto"
                            role="img"
                            aria-label={`${day.label}: ${dayTotal.toFixed(1)} hours, ${percentage.toFixed(0)}% of daily target`}
                            style={{
                              width: "40px",
                              height: "40px",
                              borderRadius: "50%",
                              background: `conic-gradient(
                                ${percentage >= 100 ? "var(--bs-success)" : "var(--bs-primary)"} ${percentage}%,
                                var(--bs-secondary-bg) ${percentage}%
                              )`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <div
                              className="bg-body rounded-circle d-flex align-items-center justify-content-center"
                              style={{ width: "32px", height: "32px" }}
                              aria-hidden="true"
                            >
                              <small className="fw-semibold">{dayTotal.toFixed(1)}</small>
                            </div>
                          </div>
                        </div>
                        <div className="text-muted" style={{ fontSize: "0.7rem" }}>
                          {percentage.toFixed(0)}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Detailed Table */}
            <div className="mb-4">
              <h6 className="text-uppercase text-muted mb-3">
                <i className="bi bi-table me-2" aria-hidden="true"></i>
                Detailed Breakdown
              </h6>
              <Table striped bordered hover responsive>
                <thead>
                  <tr>
                    <th scope="col">Day</th>
                    {labelNames.map((label) => (
                      <th key={label} scope="col">
                        {label}
                      </th>
                    ))}
                    <th scope="col">Total Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {weekDays.map((day, index) => {
                    const daySummary = dailyTotals[day.iso] ?? {};
                    const dayTotal = dailyHourTotals[index] ?? 0;
                    const isToday = day.iso === todayIso;
                    return (
                      <tr key={day.iso} className={isToday ? "table-primary" : ""}>
                        <th scope="row">
                          {day.label}
                          {isToday && (
                            <Badge bg="primary" className="ms-2" pill>
                              Today
                            </Badge>
                          )}
                        </th>
                        {labelNames.map((label) => {
                          const hours = daySummary[label] ?? 0;
                          return (
                            <td key={`${day.iso}-${label}`}>
                              {hours > 0 ? hours.toFixed(2) : "-"}
                            </td>
                          );
                        })}
                        <td className="fw-semibold">{dayTotal > 0 ? dayTotal.toFixed(2) : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>

            {/* Category Breakdown */}
            {labelPercentages.length > 0 && (
              <div className="mb-4">
                <h6 className="text-uppercase text-muted mb-3">
                  <i className="bi bi-pie-chart me-2" aria-hidden="true"></i>
                  Category Breakdown
                </h6>
                <div className="row g-3">
                  {labelPercentages.map((item) => (
                    <div key={item.label} className="col-12 col-md-6 col-lg-4">
                      <Card className="h-100">
                        <Card.Body>
                          <div className="d-flex justify-content-between align-items-start mb-2">
                            <div className="d-flex align-items-center">
                              <div
                                style={{
                                  width: "12px",
                                  height: "12px",
                                  backgroundColor: item.color,
                                  borderRadius: "2px",
                                  marginRight: "8px",
                                }}
                              ></div>
                              <span className="fw-semibold">{item.label}</span>
                            </div>
                            <Badge bg="secondary">{item.percentage.toFixed(0)}%</Badge>
                          </div>
                          <div className="h5 mb-2">{item.hours.toFixed(1)} hours</div>
                          <ProgressBar
                            now={item.percentage}
                            style={{ height: "8px", backgroundColor: item.color, opacity: 0.3 }}
                          />
                        </Card.Body>
                      </Card>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Weekly Summary */}
            <Card className="mt-4">
              <Card.Body>
                <h6 className="text-uppercase text-muted mb-3">
                  <i className="bi bi-list-check me-2" aria-hidden="true"></i>
                  Weekly Summary
                </h6>
                <div className="row">
                  <div className="col-md-6">
                    <ul className="list-unstyled mb-0">
                      {Object.entries(summary).map(([label, hours]) => (
                        <li key={label} className="mb-2">
                          <span className="text-muted">{label}:</span>{" "}
                          <span className="fw-semibold">{hours.toFixed(2)} hours</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="col-md-6">
                    <div className="h5 mb-0">
                      Total: <span className="text-primary">{weekTotal.toFixed(2)} hours</span>
                    </div>
                    {weeklyTargetHours !== undefined && (
                      <div className="text-muted">Target: {weeklyTargetHours.toFixed(1)} hours</div>
                    )}
                  </div>
                </div>
              </Card.Body>
            </Card>
          </>
        )}
      </Card.Body>
    </Card>
  );
}
