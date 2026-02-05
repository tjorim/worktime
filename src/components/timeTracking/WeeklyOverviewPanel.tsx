import { useMemo, useState } from "react";
import { Alert, Button, Card, Form, Table } from "react-bootstrap";
import type { StoredTimeTrackingTask } from "./types";
import { calculateDurationHours } from "./timeUtils";

type OverviewRow = {
  tag: string;
  start: string;
  stop: string;
  date: string;
};

type Summary = Record<string, number>;

type WeeklyOverviewPanelProps = {
  tasks: StoredTimeTrackingTask[];
};

function getIsoWeek(date: Date) {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}

function getWeekDateRange(year: number, week: number): [string, string] {
  const jan4 = new Date(year, 0, 4);
  const dayNr = (jan4.getDay() + 6) % 7;
  const weekStart = new Date(jan4);
  weekStart.setDate(jan4.getDate() - dayNr + (week - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return [weekStart.toISOString().slice(0, 10), weekEnd.toISOString().slice(0, 10)];
}

function buildWeekDays(startIso: string) {
  const base = new Date(startIso);
  return Array.from({ length: 7 }, (_, idx) => {
    const date = new Date(base);
    date.setDate(base.getDate() + idx);
    return {
      iso: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString(undefined, { weekday: "long" }),
    };
  });
}

export function WeeklyOverviewPanel({ tasks }: WeeklyOverviewPanelProps) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [week, setWeek] = useState(getIsoWeek(today));

  const [start, end] = useMemo(() => getWeekDateRange(year, week), [year, week]);

  const rows = useMemo<OverviewRow[]>(
    () =>
      tasks
        .filter((task) => task.date >= start && task.date <= end)
        .map((task) => ({
          date: task.date,
          tag: task.tag,
          start: task.start,
          stop: task.stop,
        })),
    [tasks, start, end],
  );

  const { summary, dailyTotals, tags, weekTotal, lunchTotal } = useMemo(() => {
    const totals = rows.reduce<Summary>((acc, row) => {
      acc[row.tag] = (acc[row.tag] ?? 0) + calculateDurationHours(row.start, row.stop);
      return acc;
    }, {});
    const days = buildWeekDays(start);
    const dayTotals = days.reduce<Record<string, Summary>>((acc, day) => {
      acc[day.iso] = {};
      return acc;
    }, {});

    rows.forEach((row) => {
      const bucket = dayTotals[row.date] ?? {};
      bucket[row.tag] = (bucket[row.tag] ?? 0) + calculateDurationHours(row.start, row.stop);
      dayTotals[row.date] = bucket;
    });

    const tagList = Object.keys(totals).sort();
    const lunch = totals["Lunch"] ?? 0;
    const weekSum = tagList
      .filter((tag) => tag !== "Lunch")
      .reduce((sum, tag) => sum + totals[tag], 0);

    return {
      summary: totals,
      dailyTotals: dayTotals,
      tags: tagList,
      weekTotal: weekSum,
      lunchTotal: lunch,
    };
  }, [rows, start]);

  const weekDays = useMemo(() => buildWeekDays(start), [start]);

  return (
    <Card className="shadow-sm">
      <Card.Body>
        <Card.Title>Weekly Overview</Card.Title>
        <div className="d-flex flex-wrap gap-3 my-3">
          <Form.Group>
            <Form.Label>Year</Form.Label>
            <Form.Control
              type="number"
              value={year}
              min={2000}
              max={2100}
              onChange={(event) => setYear(Number(event.target.value))}
            />
          </Form.Group>
          <Form.Group>
            <Form.Label>Week</Form.Label>
            <Form.Control
              type="number"
              value={week}
              min={1}
              max={53}
              onChange={(event) => setWeek(Number(event.target.value))}
            />
          </Form.Group>
          <div className="align-self-end">
            <Button
              variant="outline-primary"
              onClick={() => {
                const now = new Date();
                setYear(now.getFullYear());
                setWeek(getIsoWeek(now));
              }}
            >
              This Week
            </Button>
          </div>
        </div>

        {rows.length === 0 && <Alert variant="secondary">No data for this week.</Alert>}

        {rows.length > 0 && (
          <Table striped bordered hover responsive>
            <thead>
              <tr>
                <th>Day</th>
                {tags
                  .filter((tag) => tag !== "Lunch")
                  .map((tag) => (
                    <th key={tag}>{tag}</th>
                  ))}
                <th>Total Hours</th>
              </tr>
            </thead>
            <tbody>
              {weekDays.map((day) => {
                const daySummary = dailyTotals[day.iso] ?? {};
                let dayTotal = 0;
                return (
                  <tr key={day.iso}>
                    <td>{day.label}</td>
                    {tags
                      .filter((tag) => tag !== "Lunch")
                      .map((tag) => {
                        const val = daySummary[tag] ?? 0;
                        dayTotal += val;
                        return <td key={`${day.iso}-${tag}`}>{val.toFixed(2)}</td>;
                      })}
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
              {Object.entries(summary).map(([tag, hours]) => (
                <li key={tag}>
                  {tag}: {hours.toFixed(2)} hours
                </li>
              ))}
            </ul>
            <div className="fw-semibold">
              Total for the week: {weekTotal.toFixed(2)} / 40.0 hours
            </div>
            {lunchTotal > 0 && <div className="text-muted">Lunch: {lunchTotal.toFixed(2)} h</div>}
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
