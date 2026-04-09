import { useMemo } from "react";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import ListGroup from "react-bootstrap/ListGroup";
import Modal from "react-bootstrap/Modal";
import ProgressBar from "react-bootstrap/ProgressBar";
import Row from "react-bootstrap/Row";
import Table from "react-bootstrap/Table";
import clsx from "clsx";
import { ShiftBadge } from "@/components/shared/ShiftBadge";
import type { ScheduleOption, ShiftCode } from "@/data/rosters";
import { useSettings } from "@/contexts/SettingsContext";
import { getScheduleConfig } from "@/utils/scheduleUtils";
import { dayjs, getLocalizedShiftTime } from "@/utils/dateTimeUtils";
import * as m from "@/paraglide/messages.js";

import { calculateShift } from "@/utils/shiftCalculations";

// Icon size for small decorative icons (e.g., live indicator dot)
const SMALL_ICON_SIZE = "0.5rem";

// Display metadata for each working shift code — icons, colors, and variants only (labels are translated at render time).
// Any shift code present in a schedule's shiftTimes but absent here will receive a generic fallback.
const SHIFT_DISPLAY_META: Partial<
  Record<ShiftCode, { icon: string; iconClassName: string; variant: string }>
> = {
  M: {
    icon: "bi bi-sun",
    iconClassName: "text-warning",
    variant: "warning",
  },
  L: {
    icon: "bi bi-sunset",
    iconClassName: "text-info",
    variant: "info",
  },
  D: {
    icon: "bi bi-brightness-high",
    iconClassName: "text-primary",
    variant: "primary",
  },
  N: {
    icon: "bi bi-moon",
    iconClassName: "text-secondary",
    variant: "dark",
  },
};

function getShiftLabel(code: ShiftCode): string {
  switch (code) {
    case "M":
      return m.shift_morning_shifts();
    case "L":
      return m.shift_evening_shifts();
    case "D":
      return m.shift_day_shifts();
    case "N":
      return m.shift_night_shifts();
    default:
      return m.shift_generic_shifts({ code });
  }
}

interface ScheduleDetailModalProps {
  show: boolean;
  onHide: () => void;
  teamNumber: number;
  scheduleType: ScheduleOption;
}

/**
 * Render a modal showing schedule details - team schedule for multi-team schedules, or user schedule for single-user schedules.
 *
 * Works with any schedule type - automatically adapts to single-user or multi-team schedules.
 * Displays the current shift and next shift, a day-by-day schedule with shift times,
 * and weekly statistics (working/rest days and shift distribution).
 *
 * @param teamNumber - Team number to display (for multi-team schedules) or 1 (for single-user schedules)
 * @param scheduleType - Schedule type for cross-schedule viewing
 * @returns The modal element for the specified team or schedule
 */
export function ScheduleDetailModal({
  show,
  onHide,
  teamNumber,
  scheduleType,
}: ScheduleDetailModalProps) {
  const { settings } = useSettings();
  const scheduleConfig = getScheduleConfig(scheduleType);
  const teamCount = scheduleConfig.shiftConfig.teamCount;
  const hasTeams = teamCount > 1;
  const isValidTeamNumber = hasTeams
    ? teamNumber >= 1 && teamNumber <= teamCount
    : teamNumber === 1;
  if (!isValidTeamNumber) {
    throw new Error(
      `Invalid team number: ${teamNumber}. Expected ${hasTeams ? `1-${teamCount}` : "1"}`,
    );
  }

  // Current date key for daily recalculation
  const currentDateKey = dayjs().format("YYYY-MM-DD");

  // Generate 7-day schedule for the team
  const weekSchedule = useMemo(() => {
    const today = dayjs();
    const schedule = [];

    for (let i = 0; i < 7; i++) {
      const date = today.add(i, "day");
      // Use calendar date directly for schedule display, not shift day
      // This ensures the schedule shows the correct day even before 7 AM
      const shift = calculateShift(date, teamNumber, scheduleType);

      schedule.push({
        date,
        shift,
        isToday: i === 0,
        isTomorrow: i === 1,
      });
    }

    return schedule;
  }, [teamNumber, currentDateKey, scheduleType]); // oxlint-disable-line react/exhaustive-deps -- currentDateKey forces daily recalculation even if modal stays open past midnight

  // Calculate team statistics
  const stats = useMemo(() => {
    const workingDays = weekSchedule.filter((day) => day.shift.code !== "O").length;
    const offDays = 7 - workingDays;
    const totalWeeklyHours = weekSchedule.reduce((sum, day) => {
      if (day.shift.start === null || day.shift.end === null) {
        return sum;
      }

      const duration =
        day.shift.end > day.shift.start
          ? day.shift.end - day.shift.start
          : 24 - day.shift.start + day.shift.end;

      return sum + duration;
    }, 0);

    const shiftDistribution = (Object.keys(scheduleConfig.shiftConfig.shiftTimes) as ShiftCode[])
      .filter((code) => code !== "O")
      .map((code) => {
        const count = weekSchedule.filter((day) => day.shift.code === code).length;
        const meta = SHIFT_DISPLAY_META[code] ?? {
          icon: "bi bi-circle",
          iconClassName: "text-muted",
          variant: "secondary",
        };
        return { key: code, ...meta, count };
      });

    return {
      workingDays,
      offDays,
      totalWeeklyHours,
      shiftDistribution,
    };
  }, [weekSchedule, scheduleConfig.shiftConfig.shiftTimes]);

  // Find current status (weekSchedule always has 7 elements)
  const currentStatus = weekSchedule[0]!;
  const nextShift = weekSchedule.find((day) => day.shift.code !== "O" && !day.isToday);

  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>
          <i
            className={clsx(
              "bi",
              hasTeams ? "bi-people" : "bi-calendar-week",
              "me-2",
              "text-primary",
            )}
          ></i>
          {hasTeams
            ? m.schedule_detail_title_team({ team: String(teamNumber) })
            : m.schedule_detail_title_schedule()}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {/* Current Status Card */}
        <Card className="mb-4">
          <Card.Body>
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <h6 className="mb-1">
                  <i className="bi bi-clock me-2"></i>
                  {m.schedule_current_status()}
                </h6>
                <div className="d-flex align-items-center gap-2">
                  {currentStatus.shift.code === "O" ? (
                    <Badge bg="secondary" pill>
                      <i className="bi bi-house me-1"></i>
                      {m.schedule_off_duty()}
                    </Badge>
                  ) : (
                    <ShiftBadge shift={currentStatus.shift} showName pill showTooltip={false} />
                  )}
                  <small className="text-muted">{currentStatus.date.format("dddd, MMM D")}</small>
                </div>
              </div>
              {nextShift && (
                <div className="text-end">
                  <small className="text-muted d-block">{m.schedule_next_shift()}</small>
                  <ShiftBadge shift={nextShift.shift} showName pill showTooltip={false} />
                  <small className="text-muted d-block">{nextShift.date.format("MMM D")}</small>
                </div>
              )}
            </div>
          </Card.Body>
        </Card>

        {/* 7-Day Schedule */}
        <div className="mb-4">
          <h6 className="mb-3">
            <i className="bi bi-calendar-week me-2"></i>
            {m.schedule_7day_heading()}
          </h6>

          {/* Desktop table view */}
          <div className="d-none d-md-block">
            <div className="table-responsive">
              <Table
                className="mb-0 schedule-detail-table"
                aria-label={
                  hasTeams
                    ? m.schedule_7day_aria_team({ team: String(teamNumber) })
                    : m.schedule_7day_aria_personal()
                }
              >
                <thead>
                  <tr>
                    <th>{m.schedule_col_date()}</th>
                    <th>{m.schedule_col_day()}</th>
                    <th>{m.schedule_col_shift()}</th>
                    <th>{m.schedule_col_hours()}</th>
                    <th>{m.schedule_col_status()}</th>
                  </tr>
                </thead>
                <tbody>
                  {weekSchedule.map((day) => (
                    <tr
                      key={day.date.format("YYYY-MM-DD")}
                      className={clsx(day.isToday && "today-row")}
                    >
                      <td>
                        <strong>{day.date.format("MMM D")}</strong>
                        {day.isToday && (
                          <Badge bg="primary" className="ms-2">
                            <i
                              className="bi bi-circle-fill me-1"
                              style={{ fontSize: SMALL_ICON_SIZE }}
                              aria-hidden="true"
                            ></i>
                            {m.today()}
                          </Badge>
                        )}
                        {day.isTomorrow && (
                          <Badge bg="info" className="ms-2">
                            {m.schedule_tomorrow()}
                          </Badge>
                        )}
                      </td>
                      <td>{day.date.format("ddd")}</td>
                      <td>
                        {day.shift.code === "O" ? (
                          <Badge bg="secondary" pill>
                            {m.schedule_off()}
                          </Badge>
                        ) : (
                          <ShiftBadge shift={day.shift} showName pill showTooltip={false} />
                        )}
                      </td>
                      <td>
                        <small className="text-muted">
                          {day.shift.code === "O"
                            ? "—"
                            : (getLocalizedShiftTime(
                                day.shift.start,
                                day.shift.end,
                                settings.timeFormat,
                              ) ?? "—")}
                        </small>
                      </td>
                      <td>
                        {day.shift.code === "O" ? (
                          <small className="text-muted">
                            <i className="bi bi-house me-1" aria-hidden="true"></i>
                            {m.schedule_rest_day()}
                          </small>
                        ) : (
                          <small className="text-success">
                            <i className="bi bi-briefcase me-1" aria-hidden="true"></i>
                            {m.schedule_working()}
                          </small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </div>

          {/* Mobile card view */}
          <div className="d-md-none">
            {weekSchedule.map((day) => (
              <Card
                key={day.date.format("YYYY-MM-DD")}
                className={clsx("mb-3", day.isToday && "border-primary shadow-sm today-card")}
              >
                <Card.Body className="py-3">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <div>
                      <h6 className="mb-1">
                        {day.date.format("dddd")}
                        {day.isToday && (
                          <Badge bg="primary" className="ms-2">
                            <i
                              className="bi bi-circle-fill me-1"
                              style={{ fontSize: SMALL_ICON_SIZE }}
                              aria-hidden="true"
                            ></i>
                            {m.today()}
                          </Badge>
                        )}
                        {day.isTomorrow && (
                          <Badge bg="info" className="ms-2">
                            {m.schedule_tomorrow()}
                          </Badge>
                        )}
                      </h6>
                      <small className="text-muted">{day.date.format("MMMM D, YYYY")}</small>
                    </div>
                    <div>
                      {day.shift.code === "O" ? (
                        <Badge bg="secondary" pill>
                          {m.schedule_off()}
                        </Badge>
                      ) : (
                        <ShiftBadge shift={day.shift} showName pill showTooltip={false} />
                      )}
                    </div>
                  </div>
                  <div className="d-flex justify-content-between align-items-center pt-2 border-top">
                    <div>
                      <small className="text-muted d-block">
                        <i className="bi bi-clock me-1" aria-hidden="true"></i>
                        {m.schedule_col_hours()}
                      </small>
                      <span className="text-body">
                        {day.shift.code === "O"
                          ? "—"
                          : (getLocalizedShiftTime(
                              day.shift.start,
                              day.shift.end,
                              settings.timeFormat,
                            ) ?? "—")}
                      </span>
                    </div>
                    <div className="text-end">
                      <small className="text-muted d-block">{m.schedule_col_status()}</small>
                      {day.shift.code === "O" ? (
                        <span className="text-muted">
                          <i className="bi bi-house me-1" aria-hidden="true"></i>
                          {m.schedule_rest_day()}
                        </span>
                      ) : (
                        <span className="text-success">
                          <i className="bi bi-briefcase me-1" aria-hidden="true"></i>
                          {m.schedule_working()}
                        </span>
                      )}
                    </div>
                  </div>
                </Card.Body>
              </Card>
            ))}
          </div>
        </div>

        {/* Team Statistics */}
        <Row className="mb-4">
          <Col md={6}>
            <Card>
              <Card.Body>
                <h6 className="mb-3">
                  <i className="bi bi-bar-chart me-2"></i>
                  {m.schedule_weekly_stats()}
                </h6>
                <div className="mb-3">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="fw-semibold">{m.schedule_working_vs_rest()}</span>
                    <small className="text-muted">
                      {m.schedule_stats_summary({
                        working: String(stats.workingDays),
                        rest: String(stats.offDays),
                      })}
                    </small>
                  </div>
                  <ProgressBar aria-label={m.schedule_working_vs_rest()}>
                    <ProgressBar
                      now={(stats.workingDays / 7) * 100}
                      variant="success"
                      key="working"
                      label={m.schedule_working_label({ count: String(stats.workingDays) })}
                    />
                    <ProgressBar
                      now={(stats.offDays / 7) * 100}
                      variant="secondary"
                      key="rest"
                      label={m.schedule_rest_label({ count: String(stats.offDays) })}
                    />
                  </ProgressBar>
                </div>
                <ListGroup variant="flush">
                  <ListGroup.Item className="px-0 py-2 d-flex justify-content-between">
                    <span>
                      <i className="bi bi-clock me-1" aria-hidden="true"></i>
                      {m.schedule_total_weekly_hours()}
                    </span>
                    <Badge bg="primary">
                      {Number.isInteger(stats.totalWeeklyHours)
                        ? `${stats.totalWeeklyHours}h`
                        : `${stats.totalWeeklyHours.toFixed(1)}h`}
                    </Badge>
                  </ListGroup.Item>
                </ListGroup>
              </Card.Body>
            </Card>
          </Col>
          <Col md={6}>
            <Card>
              <Card.Body>
                <h6 className="mb-3">
                  <i className="bi bi-pie-chart me-2"></i>
                  {m.schedule_shift_distribution()}
                </h6>
                <ProgressBar className="mb-3" aria-label={m.schedule_shift_distribution()}>
                  {stats.shiftDistribution
                    .filter((item) => item.count > 0)
                    .map((item) => (
                      <ProgressBar
                        key={item.key}
                        now={(item.count / 7) * 100}
                        variant={item.variant}
                        label={
                          item.count >= 2 ? `${Math.round((item.count / 7) * 100)}%` : undefined
                        }
                      />
                    ))}
                </ProgressBar>
                <ListGroup variant="flush">
                  {stats.shiftDistribution.map((item) => (
                    <ListGroup.Item
                      key={item.key}
                      className="px-0 py-2 d-flex justify-content-between"
                    >
                      <span>
                        <i
                          className={clsx(item.icon, "me-1", item.iconClassName)}
                          aria-hidden="true"
                        ></i>
                        {getShiftLabel(item.key)}
                      </span>
                      <Badge bg={item.variant}>
                        {item.count}/7 ({Math.round((item.count / 7) * 100)}%)
                      </Badge>
                    </ListGroup.Item>
                  ))}
                </ListGroup>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          {m.close()}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
