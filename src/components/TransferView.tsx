import { useEffect, useId, useRef, useState } from "react";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Row from "react-bootstrap/Row";
import Table from "react-bootstrap/Table";
import Tooltip from "react-bootstrap/Tooltip";
import classNames from "classnames";
import { useTransferCalculations } from "../hooks/useTransferCalculations";
import { formatDisplayDate } from "../utils/dateTimeUtils";
import { getShiftByCode, getShiftDisplayName } from "../utils/shiftCalculations";

interface TransferViewProps {
  myTeam: number | null; // The user's team from onboarding
  initialOtherTeam?: number | null; // Initial other team (e.g., from Team Detail Modal)
  onOpenSettings?: () => void;
}

/**
 * Display transfer events between the user's team and a selected other team.
 *
 * Works with any multi-team schedule. For single-user schedules, this component should
 * not be rendered (MainTabs hides the Transfer tab via scheduleConfig.showsTeamSelection).
 *
 * Renders a card containing controls for choosing the other team, optionally filtering by a custom date range, and a paginated table of transfer records (or appropriate empty states).
 *
 * @param myTeam - The user's team number or `null`. Team validation is handled by the useTransferCalculations hook.
 * @param initialOtherTeam - Optional team number to preselect as the "other" team when the component mounts.
 * @param onOpenSettings - Optional callback to open settings dialog.
 * @returns The rendered TransferView element.
 */
export function TransferView({
  myTeam: inputMyTeam,
  initialOtherTeam,
  onOpenSettings,
}: TransferViewProps) {
  // Generate unique IDs for form elements
  const otherTeamSelectId = useId();
  const showPastCheckboxId = useId();
  const startDateId = useId();
  const endDateId = useId();

  // Local state
  const [transfersToShow, setTransfersToShow] = useState(10);
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  // Use the transfer calculations hook - it validates the team number
  const {
    transfers,
    availableOtherTeams,
    otherTeam,
    setOtherTeam,
    hasMoreTransfers,
    validatedMyTeam,
  } = useTransferCalculations({
    myTeam: inputMyTeam,
    limit: transfersToShow,
    customStartDate: useCustomRange ? customStartDate : undefined,
    customEndDate: useCustomRange ? customEndDate : undefined,
  });

  // Use validated team for display
  const myTeam = validatedMyTeam;

  // Reset pagination when filters change
  useEffect(() => {
    setTransfersToShow(10);
  }, [otherTeam, useCustomRange, customStartDate, customEndDate]);

  // Set initial other team if provided (e.g., when coming from Team Detail Modal)
  const initialSetRef = useRef(false);
  useEffect(() => {
    if (
      !initialSetRef.current &&
      initialOtherTeam &&
      availableOtherTeams.includes(initialOtherTeam)
    ) {
      setOtherTeam(initialOtherTeam);
      initialSetRef.current = true;
    }
  }, [initialOtherTeam, availableOtherTeams, setOtherTeam]);

  // Clear dates when custom range is disabled
  useEffect(() => {
    if (!useCustomRange) {
      setCustomStartDate("");
      setCustomEndDate("");
    }
  }, [useCustomRange]);

  return (
    <Card>
      <Card.Header className="d-flex justify-content-between align-items-center">
        <h6 className="mb-0">
          <i className="bi bi-arrow-left-right me-2"></i>
          Team Transfers
        </h6>
        {myTeam && (
          <Badge bg="primary" pill>
            <i className="bi bi-person-check me-1"></i>
            Your Team: {myTeam}
          </Badge>
        )}
      </Card.Header>
      <Card.Body>
        {!myTeam ? (
          <div className="text-center py-4">
            <i className="bi bi-person-plus-fill text-muted mb-3 icon-lg"></i>
            <p className="text-muted mb-0">Please select your team to see transfer information.</p>
            {onOpenSettings && (
              <div className="mt-3">
                <Button variant="primary" onClick={onOpenSettings}>
                  <i className="bi bi-gear me-2" aria-hidden="true"></i>
                  Choose Schedule
                </Button>
              </div>
            )}
          </div>
        ) : availableOtherTeams.length === 0 ? (
          <div className="text-center py-4">
            <i className="bi bi-people text-muted mb-3 icon-lg"></i>
            <h6 className="text-muted">No Other Teams Available</h6>
            <p className="text-muted mb-0">No other teams available for transfer analysis.</p>
          </div>
        ) : (
          <>
            {/* Controls */}
            <Row className="mb-3">
              <Col md={4}>
                <Form.Label htmlFor={otherTeamSelectId} className="fw-semibold">
                  <i className="bi bi-people me-1"></i>
                  View transfers with Team:
                </Form.Label>
                <Form.Select
                  id={otherTeamSelectId}
                  value={otherTeam}
                  onChange={(e) => setOtherTeam(parseInt(e.target.value, 10))}
                  aria-label="Select team to view transfers with"
                >
                  {availableOtherTeams.map((teamNumber) => (
                    <option key={teamNumber} value={teamNumber}>
                      Team {teamNumber}
                    </option>
                  ))}
                </Form.Select>
              </Col>
              <Col md={8}>
                <Form.Check
                  type="checkbox"
                  id={showPastCheckboxId}
                  label="Filter by custom date range"
                  checked={useCustomRange}
                  onChange={(e) => setUseCustomRange(e.target.checked)}
                  className="mb-3"
                />
              </Col>
            </Row>

            {useCustomRange && (
              <Row className="mb-3">
                <Col md={5}>
                  <Form.Label htmlFor={startDateId} className="fw-semibold">
                    <i className="bi bi-calendar-range me-1"></i>
                    Start Date:
                  </Form.Label>
                  <Form.Control
                    type="date"
                    id={startDateId}
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                  />
                </Col>
                <Col md={5}>
                  <Form.Label htmlFor={endDateId} className="fw-semibold">
                    End Date:
                  </Form.Label>
                  <Form.Control
                    type="date"
                    id={endDateId}
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                  />
                </Col>
                <Col md={2} className="d-flex align-items-end">
                  <Button
                    variant="outline-danger"
                    size="sm"
                    className="w-100"
                    style={{ minHeight: "38px" }}
                    onClick={() => {
                      setCustomStartDate("");
                      setCustomEndDate("");
                    }}
                    disabled={!customStartDate && !customEndDate}
                  >
                    <i className="bi bi-x-circle me-1"></i>
                    Clear
                  </Button>
                </Col>
              </Row>
            )}

            <Row className="mb-3">
              <Col>
                <Form.Text className="text-muted">
                  <i className="bi bi-info-circle me-1"></i>
                  Shows transfers between your team and the selected team
                  {useCustomRange
                    ? " within the specified date range"
                    : ". Check the box above to filter by date range"}
                  .
                </Form.Text>
              </Col>
            </Row>

            {/* Transfer Results */}
            {transfers.length === 0 ? (
              <div className="text-center py-4">
                <i className="bi bi-calendar-x text-muted mb-3 icon-lg"></i>
                <h6 className="text-muted">No Transfers Found</h6>
                <p className="text-muted mb-0">
                  No transfers found between Team {myTeam} and Team {otherTeam}
                  {useCustomRange &&
                    (customStartDate || customEndDate) &&
                    " in the selected date range"}
                  .
                </p>
              </div>
            ) : (
              <>
                <div className="d-flex justify-content-end mb-2">
                  <small className="text-muted">
                    Showing {transfers.length} {transfers.length === 1 ? "transfer" : "transfers"}
                    {hasMoreTransfers && " (more available)"}
                  </small>
                </div>

                <div className="table-responsive">
                  <Table hover className="align-middle mb-0">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Teams</th>
                        <th>Transfer Type</th>
                        <th>Shift Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transfers.map((transfer) => (
                        <tr
                          key={`${transfer.date.toISOString()}-${transfer.fromTeam}-${transfer.toTeam}`}
                        >
                          <td>
                            <div className="d-flex align-items-center">
                              <i
                                className={classNames("bi", "me-2", {
                                  "bi-arrow-right-circle text-success":
                                    transfer.type === "handover",
                                  "bi-arrow-left-circle text-info": transfer.type !== "handover",
                                })}
                              ></i>
                              <strong>{formatDisplayDate(transfer.date.toDate())}</strong>
                            </div>
                          </td>
                          <td>
                            <div className="d-flex align-items-center gap-1">
                              <Badge
                                bg={transfer.fromTeam === myTeam ? "primary" : "secondary"}
                                className="text-nowrap"
                              >
                                {transfer.fromTeam === myTeam ? "Your " : ""}
                                Team {transfer.fromTeam}
                              </Badge>
                              <i className="bi bi-arrow-right text-muted"></i>
                              <Badge
                                bg={transfer.toTeam === myTeam ? "primary" : "secondary"}
                                className="text-nowrap"
                              >
                                {transfer.toTeam === myTeam ? "Your " : ""}
                                Team {transfer.toTeam}
                              </Badge>
                            </div>
                          </td>
                          <td>
                            <OverlayTrigger
                              placement="top"
                              overlay={
                                <Tooltip
                                  id={`tooltip-${transfer.date.toISOString()}-${transfer.fromTeam}-${transfer.toTeam}`}
                                >
                                  {transfer.type === "handover"
                                    ? "Your team transfers to them"
                                    : "They transfer to your team"}
                                </Tooltip>
                              }
                            >
                              <Badge
                                bg={transfer.type === "handover" ? "success" : "info"}
                                pill
                                style={{
                                  cursor: "help",
                                }}
                              >
                                {transfer.type === "handover" ? "Handover" : "Takeover"}
                              </Badge>
                            </OverlayTrigger>
                          </td>
                          <td>
                            <div className="d-flex align-items-center gap-2">
                              <Badge
                                className={getShiftByCode(transfer.fromShiftType).className}
                                pill
                              >
                                {getShiftDisplayName(getShiftByCode(transfer.fromShiftType))}
                              </Badge>
                              <i className="bi bi-arrow-right text-muted"></i>
                              <Badge
                                className={getShiftByCode(transfer.toShiftType).className}
                                pill
                              >
                                {getShiftDisplayName(getShiftByCode(transfer.toShiftType))}
                              </Badge>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>

                {hasMoreTransfers && (
                  <div className="text-center mt-3">
                    <Button
                      variant="outline-primary"
                      size="sm"
                      onClick={() => setTransfersToShow((prev) => prev + 10)}
                    >
                      <i className="bi bi-plus-circle me-1"></i>
                      Load More Transfers
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </Card.Body>
    </Card>
  );
}
