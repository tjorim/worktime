import { useMemo } from "react";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import ListGroup from "react-bootstrap/ListGroup";
import Modal from "react-bootstrap/Modal";
import Row from "react-bootstrap/Row";
import Table from "react-bootstrap/Table";
import clsx from "clsx";
import { ShiftBadge } from "../shared/ShiftBadge";
import type { ScheduleOption } from "../../data/rosters";
import { useSettings } from "../../contexts/SettingsContext";
import { getScheduleConfig } from "../../utils/scheduleUtils";
import { dayjs, getLocalizedShiftTime } from "../../utils/dateTimeUtils";

import { calculateShift } from "../../utils/shiftCalculations";

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
    const morningShifts = weekSchedule.filter((day) => day.shift.code === "M").length;
    const eveningShifts = weekSchedule.filter((day) => day.shift.code === "L").length;
    const nightShifts = weekSchedule.filter((day) => day.shift.code === "N").length;
    const dayShifts = weekSchedule.filter((day) => day.shift.code === "D").length;

    return {
      workingDays,
      offDays,
      morningShifts,
      eveningShifts,
      nightShifts,
      dayShifts,
    };
  }, [weekSchedule]);

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
          {hasTeams ? `Team ${teamNumber} Details` : "Schedule Details"}
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
                  Current Status
                </h6>
                <div className="d-flex align-items-center gap-2">
                  {currentStatus.shift.code === "O" ? (
                    <Badge bg="secondary" pill>
                      <i className="bi bi-house me-1"></i>
                      Off Duty
                    </Badge>
                  ) : (
                    <ShiftBadge shift={currentStatus.shift} showName pill showTooltip={false} />
                  )}
                  <small className="text-muted">{currentStatus.date.format("dddd, MMM D")}</small>
                </div>
              </div>
              {nextShift && (
                <div className="text-end">
                  <small className="text-muted d-block">Next Shift</small>
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
            7-Day Schedule
          </h6>
          <div className="table-responsive">
            <Table striped hover className="mb-0">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Day</th>
                  <th>Shift</th>
                  <th>Hours</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {weekSchedule.map((day) => (
                  <tr
                    key={day.date.format("YYYY-MM-DD")}
                    className={day.isToday ? "today-row" : ""}
                  >
                    <td>
                      <strong>{day.date.format("MMM D")}</strong>
                      {day.isToday && (
                        <Badge bg="primary" className="ms-2">
                          Today
                        </Badge>
                      )}
                      {day.isTomorrow && (
                        <Badge bg="info" className="ms-2">
                          Tomorrow
                        </Badge>
                      )}
                    </td>
                    <td>{day.date.format("ddd")}</td>
                    <td>
                      {day.shift.code === "O" ? (
                        <Badge bg="secondary" pill>
                          Off
                        </Badge>
                      ) : (
                        <ShiftBadge shift={day.shift} showName pill showTooltip={false} />
                      )}
                    </td>
                    <td>
                      <small className="text-muted">
                        {day.shift.code === "O"
                          ? "—"
                          : getLocalizedShiftTime(
                              day.shift.start,
                              day.shift.end,
                              settings.timeFormat,
                            )}
                      </small>
                    </td>
                    <td>
                      {day.shift.code === "O" ? (
                        <small className="text-muted">
                          <i className="bi bi-house me-1"></i>
                          Rest Day
                        </small>
                      ) : (
                        <small className="text-success">
                          <i className="bi bi-briefcase me-1"></i>
                          Working
                        </small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </div>

        {/* Team Statistics */}
        <Row className="mb-4">
          <Col md={6}>
            <Card>
              <Card.Body>
                <h6 className="mb-3">
                  <i className="bi bi-bar-chart me-2"></i>
                  Weekly Statistics
                </h6>
                <ListGroup variant="flush">
                  <ListGroup.Item className="px-0 py-2 d-flex justify-content-between">
                    <span>Working Days</span>
                    <Badge bg="success">{stats.workingDays}/7</Badge>
                  </ListGroup.Item>
                  <ListGroup.Item className="px-0 py-2 d-flex justify-content-between">
                    <span>Rest Days</span>
                    <Badge bg="secondary">{stats.offDays}/7</Badge>
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
                  Shift Distribution
                </h6>
                <ListGroup variant="flush">
                  <ListGroup.Item className="px-0 py-2 d-flex justify-content-between">
                    <span>
                      <i className="bi bi-sun me-1 text-warning"></i>
                      Morning Shifts
                    </span>
                    <Badge className="bg-warning">{stats.morningShifts}</Badge>
                  </ListGroup.Item>
                  <ListGroup.Item className="px-0 py-2 d-flex justify-content-between">
                    <span>
                      <i className="bi bi-sunset me-1 text-info"></i>
                      Evening Shifts
                    </span>
                    <Badge bg="info">{stats.eveningShifts}</Badge>
                  </ListGroup.Item>
                  <ListGroup.Item className="px-0 py-2 d-flex justify-content-between">
                    <span>
                      <i className="bi bi-brightness-high me-1 text-dark"></i>
                      Day Shifts
                    </span>
                    <Badge bg="light" text="dark">
                      {stats.dayShifts}
                    </Badge>
                  </ListGroup.Item>
                  <ListGroup.Item className="px-0 py-2 d-flex justify-content-between">
                    <span>
                      <i className="bi bi-moon me-1 text-primary"></i>
                      Night Shifts
                    </span>
                    <Badge bg="primary">{stats.nightShifts}</Badge>
                  </ListGroup.Item>
                </ListGroup>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
