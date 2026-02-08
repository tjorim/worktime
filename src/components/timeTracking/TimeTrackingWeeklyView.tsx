import { useMemo } from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Card from "react-bootstrap/Card";
import Table from "react-bootstrap/Table";
import { dayjs } from "../../utils/dateTimeUtils";
import { WeekNavigationButtonGroup } from "../shared/NavigationButtonGroup";
import type { StoredTimeTrackingTask } from "./types";

type OverviewRow = {
  label: string;
  date: string;
  hours: number;
};

type Summary = Record<string, number>;

type TimeTrackingWeeklyViewProps = {
  tasks: StoredTimeTrackingTask[];
  selectedDate: string;
  onSelectedDateChange: (date: string) => void;
  weeklyTargetHours?: number;
};

function getWeekDateRange(year: number, week: number): [string, string] {
  const start = dayjs().year(year).isoWeek(week).startOf("isoWeek");
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
  selectedDate,
  onSelectedDateChange,
  weeklyTargetHours,
}: TimeTrackingWeeklyViewProps) {
  const weeklyDate = dayjs(selectedDate);
  const weekStart = weeklyDate.startOf("isoWeek");
  const isWeeklyCurrent = weekStart.isSame(dayjs().startOf("isoWeek"), "day");
  const [start, end] = useMemo(
    () => getWeekDateRange(weekStart.year(), weekStart.isoWeek()),
    [weekStart],
  );

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
          return {
            date: task.startTime.substring(0, 10),
            label: task.label,
            hours: Math.max(stopDayjs.diff(startDayjs, "hour", true), 0),
          };
        }),
    [tasks, start, end],
  );

  const { summary, dailyTotals, labels, weekTotal, lunchTotal, weekDays } = useMemo(() => {
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
    const lunch = totals["Lunch"] ?? 0;
    const weekSum = labelList
      .filter((label) => label !== "Lunch")
      .reduce((sum, label) => sum + (totals[label] ?? 0), 0);

    return {
      summary: totals,
      dailyTotals: dayTotals,
      labels: labelList,
      weekTotal: weekSum,
      lunchTotal: lunch,
      weekDays: days,
    };
  }, [rows, start]);

  return (
    <Card className="shadow-sm">
      <Card.Header>
        <div className="d-flex justify-content-between align-items-center mb-2">
          <h6 className="mb-0">Weekly Overview</h6>
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
            Week {weekStart.isoWeek()} ({weekStart.format("YYYY")})
            {isWeeklyCurrent && (
              <Badge bg="success" className="ms-2" aria-label="Current week">
                This Week
              </Badge>
            )}
          </div>
        </div>
      </Card.Header>
      <Card.Body>
        {rows.length === 0 && <Alert variant="secondary">No data for this week.</Alert>}

        {rows.length > 0 && (
          <Table striped bordered hover responsive>
            <thead>
              <tr>
                <th scope="col">Day</th>
                {labels
                  .filter((label) => label !== "Lunch")
                  .map((label) => (
                    <th key={label} scope="col">
                      {label}
                    </th>
                  ))}
                <th scope="col">Total Hours</th>
              </tr>
            </thead>
            <tbody>
              {weekDays.map((day) => {
                const daySummary = dailyTotals[day.iso] ?? {};
                const workLabels = labels.filter((label) => label !== "Lunch");
                const dayTotal = workLabels.reduce(
                  (sum, label) => sum + (daySummary[label] ?? 0),
                  0,
                );
                return (
                  <tr key={day.iso}>
                    <th scope="row">{day.label}</th>
                    {workLabels.map((label) => (
                      <td key={`${day.iso}-${label}`}>{(daySummary[label] ?? 0).toFixed(2)}</td>
                    ))}
                    <td className="fw-semibold">{dayTotal.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}

        {Object.keys(summary).length > 0 && (
          <div className="mt-4">
            <h6 className="text-uppercase text-muted">Weekly Summary</h6>
            <ul className="list-unstyled">
              {Object.entries(summary).map(([label, hours]) => (
                <li key={label}>
                  {label}: {hours.toFixed(2)} hours
                </li>
              ))}
            </ul>
            <div className="fw-semibold">
              Total for the week: {weekTotal.toFixed(2)}
              {weeklyTargetHours !== undefined ? ` / ${weeklyTargetHours.toFixed(1)}` : ""} hours
            </div>
            {lunchTotal > 0 && <div className="text-muted">Lunch: {lunchTotal.toFixed(2)} h</div>}
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
