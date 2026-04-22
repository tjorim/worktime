import { useEffect, useMemo, useState } from "react";
import Badge from "react-bootstrap/Badge";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import type { TimeOffEntry } from "@/lib/timeOff/types";
import { dayjs } from "@/utils/dateTimeUtils";
import {
  EVENT_TYPE_COLORS,
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

  useEffect(() => {
    if (!years.includes(selectedYear)) {
      setSelectedYear(years[0] ?? dayjs().year());
    }
  }, [selectedYear, years]);

  const stats = useMemo(
    () => calculateVacationStats(entries, selectedYear),
    [entries, selectedYear],
  );

  const filteredTypes = useMemo(
    () => stats.byType.filter((type) => type.days > 0),
    [stats.byType],
  );

  return (
    <Card className="mb-3 shadow-sm">
      <Card.Header>
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
          <span className="fw-semibold">
            <i className="bi bi-graph-up-arrow me-2" aria-hidden="true"></i>
            {m.timeoff_vacation_stats()}
          </span>
          <div className="d-flex align-items-center gap-2">
            <small className="text-muted">{m.timeoff_year_label()}</small>
            <Form.Select
              size="sm"
              aria-label={m.timeoff_select_year_aria()}
              value={selectedYear}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
              className="w-auto"
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </Form.Select>
          </div>
        </div>
      </Card.Header>
      <Card.Body>
        <div className="d-flex align-items-baseline gap-2 mb-4">
          <span className="fs-3 fw-bold">{formatVacationValue(stats.totalDays)}</span>
          <span className="text-muted small">
            {m.timeoff_days_logged_in({ year: selectedYear })}
          </span>
        </div>

        {filteredTypes.length === 0 ? (
          <p className="text-muted text-center mb-0">
            {m.timeoff_no_time_off_year({ year: selectedYear })}
          </p>
        ) : (
          <div className="d-flex flex-column gap-2">
            {filteredTypes.map((type) => (
              <div key={type.key} className="d-flex justify-content-between align-items-center">
                <div className="d-flex align-items-center gap-2">
                  <i
                    className={`bi ${EVENT_TYPE_ICONS[type.key]} text-${EVENT_TYPE_COLORS[type.key]}`}
                    aria-hidden="true"
                  />
                  <span>{type.label}</span>
                </div>
                <Badge bg={EVENT_TYPE_COLORS[type.key]} pill>
                  {formatVacationValue(type.days)} {m.timeoff_days_unit()}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
