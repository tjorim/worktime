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
import type { ScheduleOption } from "../data/rosters";
import { useSettings } from "../contexts/SettingsContext";
import { useTransferCalculations, type TransferInfo } from "../hooks/useTransferCalculations";
import { dayjs, formatDisplayDate, formatYYWWD } from "../utils/dateTimeUtils";
import { getShift } from "../utils/shiftCalculations";
import { EmptyState } from "./shared/EmptyState";
import { SetupActionButton } from "./shared/SetupActionButton";
import { ShiftBadge } from "./shared/ShiftBadge";
import { ErrorBoundary } from "./ErrorBoundary";
import * as m from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";

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
}

function TransferItemsList({ transfers, scheduleType, myTeam }: TransferItemsListProps) {
  return (
    <ListGroup variant="flush">
      {transfers.map((transfer, index) => {
        const fromShift = getShift(transfer.fromShiftType, scheduleType);
        const toShift = getShift(transfer.toShiftType, scheduleType);
        const isLast = index === transfers.length - 1;

        return (
          <ListGroup.Item
            key={`${transfer.date.toISOString()}-${transfer.fromTeam}-${transfer.toTeam}-${transfer.fromShiftType}-${transfer.toShiftType}-${transfer.type}-${index}`}
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
                <small className="text-muted text-uppercase mb-1 d-none d-md-block">{m.transfer_teams_column()}</small>
                <div className="d-flex align-items-center gap-1 flex-nowrap">
                  <Badge
                    bg={transfer.fromTeam === myTeam ? "primary" : "secondary"}
                    className="text-nowrap"
                    pill
                  >
                    {transfer.fromTeam === myTeam ? (
                      <>
                        <span className="d-none d-md-inline">{m.transfer_your_prefix()}</span>
                        {m.team_label({ team: String(transfer.fromTeam) })}
                      </>
                    ) : (
                      m.team_label({ team: String(transfer.fromTeam) })
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
                        <span className="d-none d-md-inline">{m.transfer_your_prefix()}</span>
                        {m.team_label({ team: String(transfer.toTeam) })}
                      </>
                    ) : (
                      m.team_label({ team: String(transfer.toTeam) })
                    )}
                  </Badge>
                </div>
              </Col>
              <Col xs={4} md={2}>
                <div className="d-flex flex-column align-items-start align-items-md-center">
                  <small className="text-muted text-uppercase mb-1 d-none d-md-block">{m.transfer_type_column()}</small>
                  <Badge bg={transfer.type === "handover" ? "success" : "info"} pill>
                    {transfer.type === "handover" ? m.transfer_handover() : m.transfer_takeover()}
                  </Badge>
                </div>
              </Col>
              <Col xs={8} md={3}>
                <div className="d-flex flex-column align-items-start align-items-md-end">
                  <small className="text-muted text-uppercase mb-1 d-none d-md-block">{m.transfer_shift_column()}</small>
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
  const [currentDay, setCurrentDay] = useState(() => dayjs().startOf("day"));

  const { scheduleType } = useSettings();
  const isDateRangeInvalid = useMemo(
    () =>
      useCustomRange &&
      Boolean(customStartDate) &&
      Boolean(customEndDate) &&
      dayjs(customStartDate).isAfter(dayjs(customEndDate), "day"),
    [customEndDate, customStartDate, useCustomRange],
  );

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
    customStartDate: useCustomRange && !isDateRangeInvalid ? customStartDate : undefined,
    customEndDate: useCustomRange && !isDateRangeInvalid ? customEndDate : undefined,
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
    const firstTransfer = transfers[0];
    if (!firstTransfer) {
      return null;
    }

    const handovers = transfers.filter((transfer) => transfer.type === "handover").length;
    const takeovers = transfers.length - handovers;
    const { earliest, latest } = transfers.reduce(
      (acc, transfer) => ({
        earliest: transfer.date.isBefore(acc.earliest) ? transfer.date : acc.earliest,
        latest: transfer.date.isAfter(acc.latest) ? transfer.date : acc.latest,
      }),
      { earliest: firstTransfer.date, latest: firstTransfer.date },
    );

    return {
      handovers,
      takeovers,
      earliest,
      latest,
    };
  }, [transfers]);

  // {m.timeoff_clear_selection_btn()} dates when custom range is disabled
  useEffect(() => {
    if (!useCustomRange) {
      setCustomStartDate("");
      setCustomEndDate("");
    }
  }, [useCustomRange]);

  // Keep day-bucket grouping in sync when the calendar day rolls over.
  useEffect(() => {
    const now = dayjs();
    const nextMidnight = now.add(1, "day").startOf("day");
    const timeoutId = window.setTimeout(
      () => setCurrentDay(dayjs().startOf("day")),
      nextMidnight.diff(now),
    );
    return () => window.clearTimeout(timeoutId);
  }, [currentDay]);

  const transferDateRange = useMemo(() => {
    if (!transferStats?.earliest || !transferStats?.latest) {
      return "-";
    }
    if (transferStats.earliest.isSame(transferStats.latest, "day")) {
      return formatDisplayDate(transferStats.earliest.toDate());
    }
    return (
      formatDisplayDate(transferStats.earliest.toDate()) +
      m.transfer_range_to() +
      formatDisplayDate(transferStats.latest.toDate())
    );
  }, [transferStats]);

  const displayedDateRangeValue = useMemo(() => {
    if (!useCustomRange) {
      return transferDateRange;
    }
    if (!customStartDate && !customEndDate) {
      return m.transfer_all_dates();
    }
    if (customStartDate && customEndDate) {
      return (
        formatDisplayDate(dayjs(customStartDate).toDate()) +
        m.transfer_range_to() +
        formatDisplayDate(dayjs(customEndDate).toDate())
      );
    }
    if (customStartDate) {
      return m.transfer_from_date({ date: formatDisplayDate(dayjs(customStartDate).toDate()) });
    }
    return m.transfer_until_date({ date: formatDisplayDate(dayjs(customEndDate).toDate()) });
  }, [customEndDate, customStartDate, transferDateRange, useCustomRange]);

  const groupedTransfers = useMemo(() => {
    const todayStart = currentDay.startOf("day");
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
      { key: "next-7", title: m.transfer_next_7_days(), items: nextWeek },
      { key: "next-30", title: m.transfer_next_30_days(), items: nextMonth },
      { key: "further", title: m.transfer_further_ahead(), items: future },
      { key: "past", title: m.transfer_past(), items: past },
    ];
  }, [currentDay, transfers]);

  const nonEmptyGroupedTransfers = useMemo(
    () => groupedTransfers.filter((group) => group.items.length > 0),
    [groupedTransfers],
  );
  const transferCountCategory = useMemo(
    () => new Intl.PluralRules(getLocale()).select(transfers.length),
    [transfers.length],
  );

  return (
    <Card>
      <Card.Header className="d-flex justify-content-between align-items-center">
        <span className="fw-semibold">
          <i className="bi bi-arrow-left-right me-2" aria-hidden="true"></i>
          {m.transfer_team_transfers()}
        </span>
        {myTeam && (
          <Badge bg="primary" pill>
            <i className="bi bi-person-check me-1" aria-hidden="true"></i>
            {m.transfer_your_team({ team: String(myTeam) })}
          </Badge>
        )}
      </Card.Header>
      <Card.Body>
        {!scheduleType ? (
          <div className="text-center py-4">
            <i className="bi bi-calendar-plus text-muted mb-3 icon-lg" aria-hidden="true"></i>
            <p className="text-muted mb-3">
              {m.transfer_select_schedule_prompt()}
            </p>
            <SetupActionButton onChangeSchedule={onChangeSchedule} onChangeTeam={onChangeTeam} />
          </div>
        ) : !myTeam ? (
          <div className="text-center py-4">
            <i className="bi bi-person-plus-fill text-muted mb-3 icon-lg" aria-hidden="true"></i>
            <p className="text-muted mb-3">{m.transfer_select_team_prompt()}</p>
            <SetupActionButton
              onChangeSchedule={onChangeSchedule}
              onChangeTeam={onChangeTeam}
              mode="team"
            />
          </div>
        ) : availableOtherTeams.length === 0 ? (
          <EmptyState
            icon="bi-people"
            title={m.transfer_no_teams_title()}
            description={m.transfer_no_teams_desc()}
          />
        ) : (
          <>
            {/* Controls */}
            <Row className="mb-3 gy-3">
              <Col md={4}>
                <Form.Label htmlFor={otherTeamSelectId} className="fw-semibold">
                  <i className="bi bi-people me-1" aria-hidden="true"></i>
                  {m.transfer_view_with_team_label()}
                </Form.Label>
                <Form.Select
                  id={otherTeamSelectId}
                  value={otherTeam}
                  onChange={(e) => setOtherTeam(parseInt(e.target.value, 10))}
                  aria-label={m.transfer_select_team_aria()}
                >
                  {availableOtherTeams.map((teamNumber) => (
                    <option key={teamNumber} value={teamNumber}>
                      {m.team_label({ team: String(teamNumber) })}
                    </option>
                  ))}
                </Form.Select>
                {transferStats && (
                  <div className="d-flex flex-wrap align-items-center gap-2 mt-3">
                    <span className="text-muted small text-uppercase">{m.transfer_flow_label()}</span>
                    <Badge bg="success" pill className="d-inline-flex align-items-center gap-1">
                      <i className="bi bi-arrow-right-circle" aria-hidden="true"></i>
                      {m.transfer_handovers_count({ count: String(transferStats.handovers) })}
                    </Badge>
                    <Badge bg="info" pill className="d-inline-flex align-items-center gap-1">
                      <i className="bi bi-arrow-left-circle" aria-hidden="true"></i>
                      {m.transfer_takeovers_count({ count: String(transferStats.takeovers) })}
                    </Badge>
                  </div>
                )}
              </Col>
              <Col md={8}>
                <Card className="h-100">
                  <Card.Body>
                    <div className="text-muted small text-uppercase mb-1">{m.transfer_displayed_date_range()}</div>
                    <div className="fw-semibold">{displayedDateRangeValue}</div>
                    <div className="text-muted" style={{ fontSize: "0.75em" }}>
                      {m.transfer_displayed_range_help()}
                    </div>
                    {useCustomRange ? (
                      <div className="text-muted" style={{ fontSize: "0.75em" }}>
                        {m.transfer_selected_filter_range()}
                      </div>
                    ) : hasMoreTransfers ? (
                      <div className="text-muted" style={{ fontSize: "0.75em" }}>
                        {m.transfer_visible_only()}
                      </div>
                    ) : null}
                    <hr className="my-3" />
                    <Form.Check
                      type="checkbox"
                      id={showPastCheckboxId}
                      label={m.transfer_filter_label()}
                      checked={useCustomRange}
                      onChange={(e) => setUseCustomRange(e.target.checked)}
                    />
                    {useCustomRange && (
                      <>
                        <Row className="g-2 mt-1">
                          <Col md={5}>
                            <Form.Label htmlFor={startDateId} className="fw-semibold">
                              <i className="bi bi-calendar-range me-1" aria-hidden="true"></i>
                              {m.transfer_start_date_label()}
                            </Form.Label>
                            <Form.Control
                              type="date"
                              id={startDateId}
                              value={customStartDate}
                              onChange={(e) => setCustomStartDate(e.target.value)}
                              isInvalid={isDateRangeInvalid}
                            />
                            <Form.Control.Feedback type="invalid">
                              {m.transfer_start_date_invalid()}
                            </Form.Control.Feedback>
                          </Col>
                          <Col md={5}>
                            <Form.Label htmlFor={endDateId} className="fw-semibold">
                              {m.transfer_end_date_label()}
                            </Form.Label>
                            <Form.Control
                              type="date"
                              id={endDateId}
                              value={customEndDate}
                              onChange={(e) => setCustomEndDate(e.target.value)}
                              isInvalid={isDateRangeInvalid}
                            />
                            <Form.Control.Feedback type="invalid">
                              {m.transfer_end_date_invalid()}
                            </Form.Control.Feedback>
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
                              {m.timeoff_clear_selection_btn()}
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
            {isDateRangeInvalid ? (
              <Alert variant="warning" className="mb-0">
                {m.transfer_date_range_invalid()}
              </Alert>
            ) : transfers.length === 0 ? (
              <EmptyState
                icon="bi-calendar-x"
                title={m.transfer_no_results_title()}
                description={
                  useCustomRange && (customStartDate || customEndDate)
                    ? m.transfer_no_results_range({
                        myTeam: String(myTeam),
                        otherTeam: String(otherTeam),
                      })
                    : m.transfer_no_results_between({
                        myTeam: String(myTeam),
                        otherTeam: String(otherTeam),
                      })
                }
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
                            scheduleType={scheduleType}
                          />
                        </Accordion.Body>
                      </Accordion.Item>
                    ))}
                  </Accordion>
                </ErrorBoundary>

                <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-2 mt-3">
                  <small className="text-muted">
                    {transferCountCategory === "one"
                      ? m.transfer_showing_count_one({ count: String(transfers.length) })
                      : m.transfer_showing_count_other({ count: String(transfers.length) })}
                    {hasMoreTransfers && ` ${m.transfer_more_available()}`}
                  </small>
                  {hasMoreTransfers && (
                    <Button
                      variant="outline-primary"
                      size="sm"
                      onClick={() => setTransfersToShow((prev) => prev + 10)}
                    >
                      <i className="bi bi-plus-circle me-1" aria-hidden="true"></i>
                      {m.transfer_load_more()}
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
