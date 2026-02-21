import { useEffect, useId, useMemo, useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import Row from "react-bootstrap/Row";
import Accordion from "react-bootstrap/Accordion";
import Spinner from "react-bootstrap/Spinner";
import type { ScheduleOption } from "../data/rosters";
import { useSettings } from "../contexts/SettingsContext";
import { useTransferCalculations, type TransferInfo } from "../hooks/useTransferCalculations";
import { dayjs, formatDisplayDate, formatYYWWD } from "../utils/dateTimeUtils";
import { getShift } from "../utils/shiftCalculations";
import { EmptyState } from "./shared/EmptyState";
import { SetupActionButton } from "./shared/SetupActionButton";
import { ShiftBadge } from "./shared/ShiftBadge";
import { ErrorBoundary } from "./ErrorBoundary";

interface TransferViewProps {
  myTeam: number | null; // The user's team from onboarding
  initialOtherTeam?: number | null; // Initial other team (e.g., from Team Detail Modal)
  onChangeSchedule?: () => void;
  onChangeTeam?: () => void;
}

interface TransferItemsListProps {
  transfers: TransferInfo[];
  scheduleType: ScheduleOption;
  myTeam: number;
  emptyTitle?: string;
  emptyDescription?: string;
  isLoading?: boolean;
  error?: string | null;
}

function TransferItemsList({
  transfers,
  scheduleType,
  myTeam,
  emptyTitle = "No Transfers Found",
  emptyDescription = "No transfers available for this section.",
  isLoading = false,
  error = null,
}: TransferItemsListProps) {
  return isLoading ? (
    <div className="d-flex align-items-center gap-2 text-muted">
      <Spinner animation="border" size="sm" role="status" />
      Loading transfer history...
    </div>
  ) : error ? (
    <Alert variant="danger" className="mb-0 py-2">
      {error}
    </Alert>
  ) : transfers.length === 0 ? (
    <EmptyState icon="bi-calendar-x" title={emptyTitle} description={emptyDescription} />
  ) : (
    <ListGroup variant="flush">
      {transfers.map((transfer, index) => {
        const fromShift = getShift(transfer.fromShiftType, scheduleType);
        const toShift = getShift(transfer.toShiftType, scheduleType);
        const isLast = index === transfers.length - 1;

        return (
          <ListGroup.Item
            key={`${transfer.date.toISOString()}-${transfer.fromTeam}-${transfer.toTeam}-${transfer.fromShiftType}-${transfer.toShiftType}-${transfer.type}`}
            className={`px-0 py-2 border-0 border-bottom${isLast ? " border-bottom-0" : ""}`}
          >
            <Row className="g-2 align-items-center">
              <Col xs={4} md={3}>
                <div className="fw-semibold d-flex align-items-center gap-2">
                  <i
                    className={`bi ${transfer.type === "handover" ? "bi-arrow-right-circle text-success" : "bi-arrow-left-circle text-info"}`}
                    aria-hidden="true"
                  ></i>
                  {formatYYWWD(transfer.date)}
                </div>
                <small className="text-muted">{formatDisplayDate(transfer.date.toDate())}</small>
              </Col>
              <Col xs={8} md={4}>
                <small className="text-muted text-uppercase mb-1 d-none d-md-block">Teams</small>
                <div className="d-flex align-items-center gap-1 flex-nowrap">
                  <Badge
                    bg={transfer.fromTeam === myTeam ? "primary" : "secondary"}
                    className="text-nowrap"
                    pill
                  >
                    {transfer.fromTeam === myTeam ? (
                      <>
                        <span className="d-none d-md-inline">Your </span>
                        {`Team ${transfer.fromTeam}`}
                      </>
                    ) : (
                      `Team ${transfer.fromTeam}`
                    )}
                  </Badge>
                  <i className="bi bi-arrow-right text-muted" aria-hidden="true"></i>
                  <Badge
                    bg={transfer.toTeam === myTeam ? "primary" : "secondary"}
                    className="text-nowrap"
                    pill
                  >
                    {transfer.toTeam === myTeam ? (
                      <>
                        <span className="d-none d-md-inline">Your </span>
                        {`Team ${transfer.toTeam}`}
                      </>
                    ) : (
                      `Team ${transfer.toTeam}`
                    )}
                  </Badge>
                </div>
              </Col>
              <Col xs={4} md={2}>
                <div className="d-flex flex-column align-items-start align-items-md-center">
                  <small className="text-muted text-uppercase mb-1 d-none d-md-block">Type</small>
                  <Badge bg={transfer.type === "handover" ? "success" : "info"} pill>
                    {transfer.type === "handover" ? "Handover" : "Takeover"}
                  </Badge>
                </div>
              </Col>
              <Col xs={8} md={3}>
                <div className="d-flex flex-column align-items-start align-items-md-end">
                  <small className="text-muted text-uppercase mb-1 d-none d-md-block">Shift</small>
                  <div className="d-flex align-items-center gap-2 flex-nowrap justify-content-md-end">
                    <ShiftBadge
                      shift={fromShift}
                      showEmoji
                      showName
                      pill
                      size="sm"
                      showTooltip={false}
                    />
                    <i className="bi bi-arrow-right text-muted" aria-hidden="true"></i>
                    <ShiftBadge
                      shift={toShift}
                      showEmoji
                      showName
                      pill
                      size="sm"
                      showTooltip={false}
                    />
                  </div>
                </div>
              </Col>
            </Row>
          </ListGroup.Item>
        );
      })}
    </ListGroup>
  );
}

/**
 * Display transfer events between the user's team and a selected other team.
 *
 * Works with any multi-team schedule. For single-user schedules, this component
 * displays the schedule/team setup prompts instead of transfer results.
 *
 * Renders a card containing controls for choosing the other team, optionally filtering by a custom date range, and a paginated table of transfer records (or appropriate empty states).
 *
 * @param myTeam - The user's team number or `null`. Team validation is handled by the useTransferCalculations hook.
 * @param initialOtherTeam - Optional team number to preselect as the "other" team when the component mounts.
 * @param onChangeSchedule - Optional callback to open schedule selector.
 * @param onChangeTeam - Optional callback to open team selector.
 * @returns The rendered TransferView element.
 */
export function TransferView({
  myTeam: inputMyTeam,
  initialOtherTeam,
  onChangeSchedule,
  onChangeTeam,
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

  const { scheduleType } = useSettings();

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

  const transferStats = useMemo(() => {
    if (transfers.length === 0) {
      return null;
    }

    const handovers = transfers.filter((transfer) => transfer.type === "handover").length;
    const takeovers = transfers.length - handovers;
    const earliest = transfers[0]?.date;
    const latest = transfers.at(-1)?.date;

    return {
      handovers,
      takeovers,
      earliest,
      latest,
    };
  }, [transfers]);

  // Clear dates when custom range is disabled
  useEffect(() => {
    if (!useCustomRange) {
      setCustomStartDate("");
      setCustomEndDate("");
    }
  }, [useCustomRange]);

  const transferDateRange = useMemo(() => {
    if (!transferStats?.earliest || !transferStats?.latest) {
      return "-";
    }
    if (transferStats.earliest.isSame(transferStats.latest, "day")) {
      return formatDisplayDate(transferStats.earliest.toDate());
    }
    return (
      formatDisplayDate(transferStats.earliest.toDate()) +
      " to " +
      formatDisplayDate(transferStats.latest.toDate())
    );
  }, [transferStats]);

  const displayedDateRangeValue = useMemo(() => {
    if (!useCustomRange) {
      return transferDateRange;
    }
    if (!customStartDate && !customEndDate) {
      return "All dates";
    }
    if (customStartDate && customEndDate) {
      return (
        formatDisplayDate(dayjs(customStartDate).toDate()) +
        " to " +
        formatDisplayDate(dayjs(customEndDate).toDate())
      );
    }
    if (customStartDate) {
      return `From ${formatDisplayDate(dayjs(customStartDate).toDate())}`;
    }
    return `Until ${formatDisplayDate(dayjs(customEndDate).toDate())}`;
  }, [customEndDate, customStartDate, transferDateRange, useCustomRange]);

  const groupedTransfers = useMemo(() => {
    const todayStart = dayjs().startOf("day");
    const nextWeek: typeof transfers = [];
    const nextMonth: typeof transfers = [];
    const future: typeof transfers = [];
    const past: typeof transfers = [];

    transfers.forEach((transfer) => {
      const diffDays = transfer.date.startOf("day").diff(todayStart, "day");
      if (diffDays < 0) {
        past.push(transfer);
      } else if (diffDays < 7) {
        nextWeek.push(transfer);
      } else if (diffDays <= 30) {
        nextMonth.push(transfer);
      } else {
        future.push(transfer);
      }
    });

    return [
      { key: "next-7", title: "Next 7 Days", items: nextWeek },
      { key: "next-30", title: "Next 30 Days", items: nextMonth },
      { key: "further", title: "Further Ahead", items: future },
      { key: "past", title: "Past Transfers", items: past },
    ];
  }, [transfers]);

  const nonEmptyGroupedTransfers = useMemo(
    () => groupedTransfers.filter((group) => group.items.length > 0),
    [groupedTransfers],
  );

  return (
    <Card>
      <Card.Header className="d-flex justify-content-between align-items-center">
        <span className="fw-semibold">
          <i className="bi bi-arrow-left-right me-2" aria-hidden="true"></i>
          Team Transfers
        </span>
        {myTeam && (
          <Badge bg="primary" pill>
            <i className="bi bi-person-check me-1" aria-hidden="true"></i>
            Your Team: {myTeam}
          </Badge>
        )}
      </Card.Header>
      <Card.Body>
        {!scheduleType ? (
          <div className="text-center py-4">
            <i className="bi bi-calendar-plus text-muted mb-3 icon-lg" aria-hidden="true"></i>
            <p className="text-muted mb-3">
              Please select your schedule to see transfer information.
            </p>
            <SetupActionButton onChangeSchedule={onChangeSchedule} onChangeTeam={onChangeTeam} />
          </div>
        ) : !myTeam ? (
          <div className="text-center py-4">
            <i className="bi bi-person-plus-fill text-muted mb-3 icon-lg" aria-hidden="true"></i>
            <p className="text-muted mb-3">Please select your team to see transfer information.</p>
            <SetupActionButton
              onChangeSchedule={onChangeSchedule}
              onChangeTeam={onChangeTeam}
              mode="team"
            />
          </div>
        ) : availableOtherTeams.length === 0 ? (
          <EmptyState
            icon="bi-people"
            title="No Other Teams Available"
            description="No other teams available for transfer analysis."
          />
        ) : (
          <>
            {/* Controls */}
            <Row className="mb-3 gy-3">
              <Col md={4}>
                <Form.Label htmlFor={otherTeamSelectId} className="fw-semibold">
                  <i className="bi bi-people me-1" aria-hidden="true"></i>
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
                {transferStats && (
                  <div className="d-flex flex-wrap align-items-center gap-2 mt-3">
                    <span className="text-muted small text-uppercase">Transfer Flow</span>
                    <Badge bg="success" pill className="d-inline-flex align-items-center gap-1">
                      <i className="bi bi-arrow-right-circle" aria-hidden="true"></i>
                      Handovers: {transferStats.handovers}
                    </Badge>
                    <Badge bg="info" pill className="d-inline-flex align-items-center gap-1">
                      <i className="bi bi-arrow-left-circle" aria-hidden="true"></i>
                      Takeovers: {transferStats.takeovers}
                    </Badge>
                  </div>
                )}
              </Col>
              <Col md={8}>
                <Card className="h-100">
                  <Card.Body>
                    <div className="text-muted small text-uppercase mb-1">Displayed Date Range</div>
                    <div className="fw-semibold">{displayedDateRangeValue}</div>
                    <div className="text-muted" style={{ fontSize: "0.75em" }}>
                      Transfers between your team and the selected team.
                    </div>
                    {useCustomRange ? (
                      <div className="text-muted" style={{ fontSize: "0.75em" }}>
                        selected filter range
                      </div>
                    ) : hasMoreTransfers ? (
                      <div className="text-muted" style={{ fontSize: "0.75em" }}>
                        of visible transfers only
                      </div>
                    ) : null}
                    <hr className="my-3" />
                    <Form.Check
                      type="checkbox"
                      id={showPastCheckboxId}
                      label="Filter by custom date range"
                      checked={useCustomRange}
                      onChange={(e) => setUseCustomRange(e.target.checked)}
                    />
                    {useCustomRange && (
                      <>
                        <Row className="g-2 mt-1">
                          <Col md={5}>
                            <Form.Label htmlFor={startDateId} className="fw-semibold">
                              <i className="bi bi-calendar-range me-1" aria-hidden="true"></i>
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
                              <i className="bi bi-x-circle me-1" aria-hidden="true"></i>
                              Clear
                            </Button>
                          </Col>
                        </Row>
                      </>
                    )}
                  </Card.Body>
                </Card>
              </Col>
            </Row>

            {/* Transfer Results */}
            {transfers.length === 0 ? (
              <EmptyState
                icon="bi-calendar-x"
                title="No Transfers Found"
                description={`No transfers found between Team ${myTeam} and Team ${otherTeam}${useCustomRange && (customStartDate || customEndDate) ? " in the selected date range" : ""}.`}
              />
            ) : (
              <>
                <ErrorBoundary>
                  <Accordion
                    defaultActiveKey={nonEmptyGroupedTransfers.map((group) => group.key)}
                    alwaysOpen
                  >
                    {nonEmptyGroupedTransfers.map((group) => (
                      <Accordion.Item eventKey={group.key} key={group.key}>
                        <Accordion.Header>
                          {group.title}
                          <Badge bg="secondary" pill className="ms-2">
                            {group.items.length}
                          </Badge>
                        </Accordion.Header>
                        <Accordion.Body>
                          <TransferItemsList
                            transfers={group.items}
                            myTeam={myTeam}
                            emptyDescription={`No transfers in the ${group.title.toLowerCase()} bucket.`}
                            scheduleType={scheduleType}
                          />
                        </Accordion.Body>
                      </Accordion.Item>
                    ))}
                  </Accordion>
                </ErrorBoundary>

                <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-2 mt-3">
                  <small className="text-muted">
                    Showing {transfers.length} {transfers.length === 1 ? "transfer" : "transfers"}
                    {hasMoreTransfers && " (more available)"}
                  </small>
                  {hasMoreTransfers && (
                    <Button
                      variant="outline-primary"
                      size="sm"
                      onClick={() => setTransfersToShow((prev) => prev + 10)}
                    >
                      <i className="bi bi-plus-circle me-1" aria-hidden="true"></i>
                      Load More Transfers
                    </Button>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </Card.Body>
    </Card>
  );
}
