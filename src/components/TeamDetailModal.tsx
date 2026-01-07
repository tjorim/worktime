import { useId, useMemo } from "react";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import ListGroup from "react-bootstrap/ListGroup";
import Modal from "react-bootstrap/Modal";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Row from "react-bootstrap/Row";
import Table from "react-bootstrap/Table";
import Tooltip from "react-bootstrap/Tooltip";
import { useSettings } from "../contexts/SettingsContext";
import { useToast } from "../contexts/ToastContext";
import { dayjs, getLocalizedShiftTime } from "../utils/dateTimeUtils";
import { shareTeamSchedule } from "../utils/share";
import { calculateShift, getCurrentShiftDay, getShiftByCode } from "../utils/shiftCalculations";

interface TeamDetailModalProps {
  show: boolean;
  onHide: () => void;
  teamNumber: number;
  onViewTransfers?: (team: number) => void;
}

/**
 * Render a modal showing a team's seven-day schedule, current status, statistics and quick actions.
 *
 * Displays the selected team's current shift and next shift, a day-by-day schedule with shift times,
 * weekly statistics (working/rest days and shift distribution), and quick actions including share and view transfers.
 *
 * @param teamNumber - Team number to display (1–5)
 * @param onViewTransfers - Optional callback invoked with the team number when "View Transfers" is activated
 * @returns The modal element for the specified team
 */
export function TeamDetailModal({
  show,
  onHide,
  teamNumber,
  onViewTransfers,
}: TeamDetailModalProps) {
  const calendarTooltipId = useId();
  const transfersDisabledTooltipId = useId();
  const transfersTooltipId = useId();

  // Current date key for daily recalculation
  const currentDateKey = dayjs().format("YYYY-MM-DD");

  // Generate 7-day schedule for the team
  const weekSchedule = useMemo(() => {
    const today = dayjs();
    const schedule = [];

    for (let i = 0; i < 7; i++) {
      const date = today.add(i, "day");
      const shiftDay = getCurrentShiftDay(date);
      const shift = calculateShift(shiftDay, teamNumber);

      schedule.push({
        date,
        shift,
        isToday: i === 0,
        isTomorrow: i === 1,
      });
    }

    return schedule;
  }, [teamNumber, currentDateKey]); // oxlint-disable-line react/exhaustive-deps -- currentDateKey forces daily recalculation even if modal stays open past midnight

  // Calculate team statistics
  const stats = useMemo(() => {
    const workingDays = weekSchedule.filter((day) => day.shift.code !== "O").length;
    const offDays = 7 - workingDays;
    const morningShifts = weekSchedule.filter((day) => day.shift.code === "M").length;
    const eveningShifts = weekSchedule.filter((day) => day.shift.code === "E").length;
    const nightShifts = weekSchedule.filter((day) => day.shift.code === "N").length;

    return {
      workingDays,
      offDays,
      morningShifts,
      eveningShifts,
      nightShifts,
    };
  }, [weekSchedule]);

  // Find current status
  const currentStatus = weekSchedule[0];
  const nextShift = weekSchedule.find((day) => day.shift.code !== "O" && !day.isToday);

  const toast = useToast();
  const { settings, myTeam } = useSettings();

  // Share handler for this team
  const handleShareSchedule = () => {
    const today = dayjs().format("YYYY-MM-DD");
    shareTeamSchedule(
      teamNumber,
      () => toast?.showSuccess("Share dialog opened or link copied!"),
      () => toast?.showError("Could not share. Try copying the link manually."),
      today,
    );
  };

  // Button state logic - only allow viewing transfers for other teams, not your own
  const isViewingOwnTeam = teamNumber === myTeam;
  const canViewTransfers = !isViewingOwnTeam;

  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>
          <i className="bi bi-people me-2 text-primary"></i>
          Team {teamNumber} Details
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
                  {currentStatus?.shift.code === "O" ? (
                    <Badge bg="secondary" pill>
                      <i className="bi bi-house me-1"></i>
                      Off Duty
                    </Badge>
                  ) : (
                    <Badge className={getShiftByCode(currentStatus?.shift.code).className} pill>
                      <i className="bi bi-briefcase me-1"></i>
                      {currentStatus?.shift.name || "Unknown"}
                    </Badge>
                  )}
                  <small className="text-muted">
                    {currentStatus?.date.format("dddd, MMM D") || "Unknown date"}
                  </small>
                </div>
              </div>
              {nextShift && (
                <div className="text-end">
                  <small className="text-muted d-block">Next Shift</small>
                  <Badge className={getShiftByCode(nextShift.shift.code).className} pill>
                    {nextShift.shift.name}
                  </Badge>
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
                        <Badge className={getShiftByCode(day.shift.code).className} pill>
                          {day.shift.name}
                        </Badge>
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

        {/* Quick Actions */}
        <Card>
          <Card.Body>
            <h6 className="mb-3">
              <i className="bi bi-lightning me-2"></i>
              Quick Actions
            </h6>
            <div className="d-grid gap-2 d-md-flex">
              <OverlayTrigger
                placement="top"
                delay={{ show: 0, hide: 0 }}
                overlay={<Tooltip id={calendarTooltipId}>Live calendar sync coming soon!</Tooltip>}
              >
                <span className="d-inline-block">
                  <Button
                    variant="outline-primary"
                    size="sm"
                    disabled
                    style={{ pointerEvents: "none" }}
                  >
                    <i className="bi bi-calendar-plus me-1"></i>
                    Add to Calendar
                  </Button>
                </span>
              </OverlayTrigger>
              <Button variant="outline-info" size="sm" onClick={handleShareSchedule}>
                <i className="bi bi-share me-1"></i>
                Share Schedule
              </Button>
              {/* View Transfers button with conditional disable and tooltip */}
              <OverlayTrigger
                placement="top"
                delay={{ show: 0, hide: 0 }}
                overlay={
                  isViewingOwnTeam ? (
                    <Tooltip id={transfersDisabledTooltipId}>
                      You are viewing your own team. Transfers are only shown for other teams.
                    </Tooltip>
                  ) : (
                    <Tooltip id={transfersTooltipId}>
                      View transfers between your team and this team
                    </Tooltip>
                  )
                }
              >
                <span className="d-inline-block">
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={() => onViewTransfers?.(teamNumber)}
                    disabled={!canViewTransfers}
                    style={isViewingOwnTeam ? { pointerEvents: "none" } : {}}
                  >
                    <i className="bi bi-arrow-left-right me-1"></i>
                    View Transfers
                  </Button>
                </span>
              </OverlayTrigger>
            </div>
          </Card.Body>
        </Card>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
