import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import Badge from "react-bootstrap/Badge";
import Card from "react-bootstrap/Card";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import ProgressBar from "react-bootstrap/ProgressBar";
import Table from "react-bootstrap/Table";
import Tooltip from "react-bootstrap/Tooltip";
import { WORK_LOCATION_ICON_CLASS } from "@/components/calendar/workLocationConstants";
import type { WorkLocationMap } from "@/types/workLocation";
import * as m from "@/paraglide/messages.js";
import type { LabelPercentage, WeekDay, WeeklySummary } from "./hooks/useWeeklyTimeTrackingSummary";
import { CopyableHoursCell, MetricCard } from "./WeeklyCells";

interface WeeklyDataViewProps {
  weekTotal: number;
  weeklyTargetHours?: number;
  weeklyProgressPercent: number;
  avgDailyHours: number;
  dailyHourTotals: number[];
  labelPercentages: LabelPercentage[];
  weekDays: WeekDay[];
  todayIso: string;
  targetDaily: number;
  crossBorderEnabled: boolean;
  workLocationMap: WorkLocationMap;
  onSwitchToDaily?: (date: string) => void;
  pluralRules: Intl.PluralRules;
  labelNames: string[];
  dailyTotals: Record<string, WeeklySummary>;
  copiedCellId: string | null;
  onCopyCell: (id: string, value: string) => void;
  summary: WeeklySummary;
}

export function WeeklyDataView({
  weekTotal,
  weeklyTargetHours,
  weeklyProgressPercent,
  avgDailyHours,
  dailyHourTotals,
  labelPercentages,
  weekDays,
  todayIso,
  targetDaily,
  crossBorderEnabled,
  workLocationMap,
  onSwitchToDaily,
  pluralRules,
  labelNames,
  dailyTotals,
  copiedCellId,
  onCopyCell,
  summary,
}: WeeklyDataViewProps) {
  const createDayKeyDownHandler =
    (dayIso: string, preventEnterDefault: boolean) => (e: ReactKeyboardEvent<HTMLElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        if (e.key === " " || preventEnterDefault) {
          e.preventDefault();
        }
        onSwitchToDaily?.(dayIso);
      }
    };

  return (
    <>
      {weeklyTargetHours !== undefined && (
        <div className="mb-4">
          {weeklyTargetHours > 0 ? (
            <>
              <div className="d-flex justify-content-between align-items-center mb-2">
                <span className="fw-semibold">{m.tt_weekly_progress()}</span>
                <span className="text-muted">
                  {m.tt_hours_value({ hours: weekTotal.toFixed(1) })} /{" "}
                  {m.tt_hours_value({ hours: weeklyTargetHours.toFixed(1) })}
                  <Badge bg={weekTotal >= weeklyTargetHours ? "success" : "secondary"} className="ms-2">
                    {weekTotal >= weeklyTargetHours
                      ? m.tt_hours_delta({ hours: (weekTotal - weeklyTargetHours).toFixed(1) })
                      : m.tt_hours_remaining({
                          hours: (weeklyTargetHours - weekTotal).toFixed(1),
                        })}
                  </Badge>
                </span>
              </div>
              <ProgressBar
                now={weeklyProgressPercent}
                variant={weekTotal >= weeklyTargetHours ? "success" : "primary"}
                style={{ height: "1.5rem" }}
                label={`${weeklyProgressPercent.toFixed(0)}%`}
              />
            </>
          ) : (
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="fw-semibold">{m.tt_weekly_progress()}</span>
              <span className="text-muted">
                {m.tt_hours_value({ hours: weekTotal.toFixed(1) })} /{" "}
                {m.tt_hours_value({ hours: "0.0" })}
                <Badge bg="secondary" className="ms-2">
                  {m.tt_target_unavailable()}
                </Badge>
              </span>
            </div>
          )}
        </div>
      )}

      <div className="row g-3 mb-4">
        <MetricCard label={m.tt_total_hours()} value={m.tt_hours_value({ hours: weekTotal.toFixed(1) })} />
        <MetricCard
          label={m.tt_avg_daily_hours()}
          value={m.tt_hours_value({ hours: avgDailyHours.toFixed(1) })}
        />
        <MetricCard
          label={m.tt_days_tracked()}
          value={String(dailyHourTotals.filter((h) => h > 0).length)}
        />
        <MetricCard label={m.tt_top_category()} value={labelPercentages[0]?.label ?? "-"} truncate />
      </div>

      <div className="mb-4">
        <h6 className="text-uppercase text-muted mb-3">
          <i className="bi bi-calendar-week me-2" aria-hidden="true"></i>
          {m.tt_daily_breakdown()}
        </h6>
        <div className="row g-2">
          {weekDays.map((day, index) => {
            const dayTotal = dailyHourTotals[index] ?? 0;
            const isToday = day.iso === todayIso;
            const percentage = targetDaily > 0 ? Math.min((dayTotal / targetDaily) * 100, 100) : 0;
            const location = crossBorderEnabled ? (workLocationMap.get(day.iso) ?? null) : null;

            return (
              <div key={day.iso} className="col">
                <OverlayTrigger
                  trigger={onSwitchToDaily ? ["hover", "focus"] : []}
                  overlay={
                    <Tooltip id={`weekly-day-${day.iso}`}>
                      {m.tt_open_daily_log_title({ day: day.label })}
                    </Tooltip>
                  }
                >
                  <div
                    className={`text-center p-2 rounded ${isToday ? "bg-primary bg-opacity-10" : ""}${onSwitchToDaily ? " hover-highlight" : ""}`}
                    role={onSwitchToDaily ? "button" : undefined}
                    tabIndex={onSwitchToDaily ? 0 : undefined}
                    onClick={() => onSwitchToDaily?.(day.iso)}
                    onKeyDown={onSwitchToDaily ? createDayKeyDownHandler(day.iso, true) : undefined}
                    style={onSwitchToDaily ? { cursor: "pointer" } : undefined}
                  >
                    <div className={`small mb-1 ${isToday ? "fw-bold text-primary" : "text-muted"}`}>
                      {day.label.substring(0, 3)}
                      {isToday && (
                        <Badge bg="primary" className="ms-1">
                          {m.today()}
                        </Badge>
                      )}
                    </div>
                    <div className="mb-1">
                      <div
                        className="mx-auto"
                        role="img"
                        aria-label={
                          pluralRules.select(dayTotal) === "one"
                            ? m.tt_weekly_chart_aria_one({
                                day: day.label,
                                hours: dayTotal.toFixed(1),
                                percent: percentage.toFixed(0),
                              })
                            : m.tt_weekly_chart_aria({
                                day: day.label,
                                hours: dayTotal.toFixed(1),
                                percent: percentage.toFixed(0),
                              })
                        }
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
                    {location && (
                      <div className="text-muted mt-1" style={{ fontSize: "0.65rem" }}>
                        <i
                          className={`bi ${WORK_LOCATION_ICON_CLASS[location.location]}`}
                          aria-hidden="true"
                        />{" "}
                        {location.countryCode}
                      </div>
                    )}
                  </div>
                </OverlayTrigger>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mb-4">
        <h6 className="text-uppercase text-muted mb-3">
          <i className="bi bi-table me-2" aria-hidden="true"></i>
          {m.tt_detailed_breakdown()}
        </h6>
        <Table striped bordered hover responsive>
          <thead>
            <tr>
              <th scope="col">{m.tt_col_day()}</th>
              {labelNames.map((label) => (
                <th key={label} scope="col">
                  {label}
                </th>
              ))}
              <th scope="col">{m.tt_col_total_hours()}</th>
            </tr>
          </thead>
          <tbody>
            {weekDays.map((day, index) => {
              const daySummary = dailyTotals[day.iso] ?? {};
              const dayTotal = dailyHourTotals[index] ?? 0;
              const isToday = day.iso === todayIso;
              const location = crossBorderEnabled ? (workLocationMap.get(day.iso) ?? null) : null;
              return (
                <tr key={day.iso} className={isToday ? "table-primary" : ""}>
                  <th scope="row">
                    {onSwitchToDaily ? (
                      <button
                        type="button"
                        className="btn btn-link p-0 text-decoration-none text-reset fw-semibold"
                        onClick={() => onSwitchToDaily(day.iso)}
                        aria-label={m.tt_open_daily_log_title({ day: day.label })}
                      >
                        {day.label}
                      </button>
                    ) : (
                      day.label
                    )}
                    {isToday && (
                      <Badge bg="primary" className="ms-2" pill>
                        {m.today()}
                      </Badge>
                    )}
                    {location && (
                      <span className="ms-2 text-muted fw-normal" style={{ fontSize: "0.75rem" }}>
                        <i
                          className={`bi ${WORK_LOCATION_ICON_CLASS[location.location]}`}
                          aria-hidden="true"
                        />{" "}
                        {location.countryCode}
                      </span>
                    )}
                  </th>
                  {labelNames.map((label) => {
                    const hours = daySummary[label] ?? 0;
                    const cellId = `${day.iso}-${label}`;
                    const cellValue = hours > 0 ? hours.toFixed(2) : null;
                    return (
                      <CopyableHoursCell
                        key={cellId}
                        cellId={cellId}
                        cellValue={cellValue}
                        copiedCellId={copiedCellId}
                        onCopyCell={onCopyCell}
                      />
                    );
                  })}
                  <CopyableHoursCell
                    className="fw-semibold"
                    cellId={`${day.iso}-total`}
                    cellValue={dayTotal > 0 ? dayTotal.toFixed(2) : null}
                    copiedCellId={copiedCellId}
                    onCopyCell={onCopyCell}
                  />
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>

      {labelPercentages.length > 0 && (
        <div className="mb-4">
          <h6 className="text-uppercase text-muted mb-3">
            <i className="bi bi-pie-chart me-2" aria-hidden="true"></i>
            {m.tt_category_breakdown()}
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
                    <div className="h5 mb-2">
                      {item.hours.toFixed(1)} {m.tt_hours_unit()}
                    </div>
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

      <Card className="mt-4">
        <Card.Body>
          <h6 className="text-uppercase text-muted mb-3">
            <i className="bi bi-list-check me-2" aria-hidden="true"></i>
            {m.tt_weekly_summary_heading()}
          </h6>
          <div className="row">
            <div className="col-md-6">
              <ul className="list-unstyled mb-0">
                {Object.entries(summary).map(([label, hours]) => (
                  <li key={label} className="mb-2">
                    <span className="text-muted">{label}:</span>{" "}
                    <span className="fw-semibold">
                      {hours.toFixed(2)} {m.tt_hours_unit()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="col-md-6">
              <div className="h5 mb-0">
                {m.tt_total_label()}:{" "}
                <span className="text-primary">
                  {weekTotal.toFixed(2)} {m.tt_hours_unit()}
                </span>
              </div>
              {weeklyTargetHours !== undefined && (
                <div className="text-muted">
                  {m.tt_target_label()}: {weeklyTargetHours.toFixed(1)} {m.tt_hours_unit()}
                </div>
              )}
            </div>
          </div>
        </Card.Body>
      </Card>
    </>
  );
}
