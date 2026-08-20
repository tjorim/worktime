import type { Dayjs } from "dayjs";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import Row from "react-bootstrap/Row";
import Accordion from "react-bootstrap/Accordion";
import { SCHEDULE_OPTIONS, type ScheduleOption } from "@/data/rosters";
import { useSettings } from "@/contexts/SettingsContext";
import { useEventStore } from "@/contexts/EventStoreContext";
import type { CalendarEvent } from "@/lib/events/types";
import { useTransferCalculations, type TransferInfo } from "@/hooks/useTransferCalculations";
import { dayjs, formatDisplayDate, formatTimeByPreference, formatYYWWD } from "@/utils/dateTimeUtils";
import {
  getShift,
  getWorkingShiftTypes,
  type ShiftType,
  type ShiftWindow,
} from "@/utils/shiftCalculations";
import { EmptyState } from "./shared/EmptyState";
import { SetupActionButton } from "./shared/SetupActionButton";
import { ShiftBadge } from "./shared/ShiftBadge";
import { ErrorBoundary } from "./ErrorBoundary";
import * as m from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

interface TransferViewProps {
  myTeam: number | null; // The user's team from onboarding
  initialOtherTeam?: number | null; // Initial other team (e.g., from Team Detail Modal)
  // Schedule to compare with. When it differs from the user's own schedule,
  // handover/takeover points aren't shown (the underlying shift-code
  // vocabulary isn't comparable across schedules) — only overlapping hours.
  otherScheduleType?: ScheduleOption | null;
  onChangeSchedule?: () => void;
  onChangeTeam?: () => void;
}

/** Human-readable label for a shift type on a given schedule, e.g. "🌆 Evening". */
function formatShiftTypeLabel(code: ShiftType, scheduleOption: ScheduleOption): string {
  const shift = getShift(code, scheduleOption);
  return `${shift.emoji} ${shift.name}`;
}

/** Find the current user's own time-off event covering the given date, if any. */
function findTimeOffOnDate(events: CalendarEvent[], date: Dayjs): CalendarEvent | undefined {
  const dateStr = date.format("YYYY-MM-DD");
  return events.find((event) => event.start <= dateStr && dateStr <= event.end);
}

/** Small pill flagging that the user has time off recorded on this date. */
function TimeOffIndicator({ event }: { event: CalendarEvent | undefined }) {
  if (!event || event.type !== "holiday") return null;
  const { color, textColor, typeLabel } = event.meta;
  const label = m.transfer_you_on_leave({ label: typeLabel });

  return (
    <span
      className="badge rounded-pill d-inline-flex align-items-center gap-1"
      style={{ backgroundColor: color, color: textColor }}
      title={label}
    >
      <i className="bi bi-airplane-fill" aria-hidden="true"></i>
      <span className="visually-hidden">{label}</span>
    </span>
  );
}

function formatOverlapDuration(overlap: ShiftWindow): string {
  const totalMinutes = overlap.end.diff(overlap.start, "minute");
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

interface TransferItemsListProps {
  transfers: TransferInfo[];
  scheduleType: ScheduleOption;
  myTeam: number;
  timeOffEvents: CalendarEvent[];
}

function TransferItemsList({ transfers, scheduleType, myTeam, timeOffEvents }: TransferItemsListProps) {
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
                <small className="text-muted d-flex align-items-center gap-1">
                  {formatDisplayDate(transfer.date.toDate())}
                  <TimeOffIndicator event={findTimeOffOnDate(timeOffEvents, transfer.date)} />
                </small>
              </Col>
              <Col xs={8} md={4}>
                <small className="text-muted text-uppercase mb-1 d-none d-md-block">
                  {m.transfer_teams_column()}
                </small>
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
                  <small className="text-muted text-uppercase mb-1 d-none d-md-block">
                    {m.transfer_type_column()}
                  </small>
                  <Badge bg={transfer.type === "handover" ? "success" : "info"} pill>
                    {transfer.type === "handover" ? m.transfer_handover() : m.transfer_takeover()}
                  </Badge>
                </div>
              </Col>
              <Col xs={8} md={3}>
                <div className="d-flex flex-column align-items-start align-items-md-end">
                  <small className="text-muted text-uppercase mb-1 d-none d-md-block">
                    {m.transfer_shift_column()}
                  </small>
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

interface OverlapItemsListProps {
  overlaps: ShiftWindow[];
  myLabel: string;
  otherLabel: string;
  timeFormat: "12h" | "24h";
  timeOffEvents: CalendarEvent[];
}

function OverlapItemsList({
  overlaps,
  myLabel,
  otherLabel,
  timeFormat,
  timeOffEvents,
}: OverlapItemsListProps) {
  return (
    <ListGroup variant="flush">
      {overlaps.map((overlap, index) => {
        const isLast = index === overlaps.length - 1;

        return (
          <ListGroup.Item
            key={`${overlap.start.toISOString()}-${overlap.end.toISOString()}-${index}`}
            className={`px-0 py-2 border-0 border-bottom${isLast ? " border-bottom-0" : ""}`}
          >
            <Row className="g-2 align-items-center">
              <Col xs={5} md={3}>
                <div className="fw-semibold d-flex align-items-center gap-2">
                  <i className="bi bi-people-fill text-primary" aria-hidden="true"></i>
                  {formatYYWWD(overlap.start)}
                </div>
                <small className="text-muted d-flex align-items-center gap-1">
                  {formatDisplayDate(overlap.start.toDate())}
                  <TimeOffIndicator event={findTimeOffOnDate(timeOffEvents, overlap.start)} />
                </small>
              </Col>
              <Col xs={7} md={4}>
                <small className="text-muted text-uppercase mb-1 d-none d-md-block">
                  {m.transfer_teams_column()}
                </small>
                <div className="d-flex align-items-center gap-1 flex-wrap">
                  <Badge bg="primary" className="text-nowrap" pill>
                    <span className="d-none d-md-inline">{m.transfer_your_prefix()}</span>
                    {myLabel}
                  </Badge>
                  <i className="bi bi-arrow-left-right text-muted" aria-hidden="true"></i>
                  <Badge bg="secondary" className="text-nowrap" pill>
                    {otherLabel}
                  </Badge>
                </div>
              </Col>
              <Col xs={12} md={5}>
                <div className="d-flex flex-column align-items-start align-items-md-end">
                  <small className="text-muted text-uppercase mb-1 d-none d-md-block">
                    {m.transfer_shift_column()}
                  </small>
                  <div className="d-flex align-items-center gap-2 flex-nowrap">
                    <span className="fw-semibold">
                      {formatTimeByPreference(overlap.start, timeFormat)}–
                      {formatTimeByPreference(overlap.end, timeFormat)}
                    </span>
                    <Badge bg="light" text="dark" pill>
                      {formatOverlapDuration(overlap)}
                    </Badge>
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
  otherScheduleType,
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
  // "Teamless" lookup for the other side only — the user is always
  // represented by their own real team; the other person may be identified
  // by shift type instead ("whoever's on Evening") when their exact team
  // isn't known.
  const [otherMode, setOtherMode] = useState<"team" | "shiftType">("team");
  const [otherShiftType, setOtherShiftType] = useState<ShiftType | null>(null);

  const { scheduleType, settings } = useSettings();
  const { timeFormat } = settings;
  const { getEventsInRange } = useEventStore();
  const locale = getLocale();
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
    overlaps,
    hasMoreOverlaps,
    availableOtherTeams,
    otherTeam,
    setOtherTeam,
    hasMoreTransfers,
    validatedMyTeam,
    otherScheduleType: effectiveOtherScheduleType,
  } = useTransferCalculations({
    myTeam: inputMyTeam,
    limit: transfersToShow,
    customStartDate: useCustomRange && !isDateRangeInvalid ? customStartDate : undefined,
    customEndDate: useCustomRange && !isDateRangeInvalid ? customEndDate : undefined,
    otherScheduleType,
    otherShiftType: otherMode === "shiftType" ? otherShiftType : null,
  });

  // Same-schedule, team-only comparisons show handover/takeover points;
  // everything else (cross-schedule, or the other side matched by shift type
  // instead of a fixed team) only shows overlapping hours.
  const sameSchedule = effectiveOtherScheduleType === scheduleType;
  const usingShiftTypeMode = otherMode === "shiftType";
  const otherScheduleTitle = sameSchedule
    ? null
    : (SCHEDULE_OPTIONS.find((option) => option.value === effectiveOtherScheduleType)?.title ??
      effectiveOtherScheduleType);

  // Use validated team for display
  const myTeam = validatedMyTeam;
  // Handover/takeover points require a fixed team identity on both sides.
  const showTransfers = Boolean(myTeam) && sameSchedule && !usingShiftTypeMode;

  const otherWorkingShiftTypes = useMemo(
    () => getWorkingShiftTypes(effectiveOtherScheduleType),
    [effectiveOtherScheduleType],
  );

  // Keep the selected shift type valid as the underlying schedule changes.
  useEffect(() => {
    if (
      otherMode === "shiftType" &&
      (!otherShiftType || !otherWorkingShiftTypes.includes(otherShiftType))
    ) {
      setOtherShiftType(otherWorkingShiftTypes[0] ?? null);
    }
  }, [otherMode, otherShiftType, otherWorkingShiftTypes]);

  const myOverlapLabel = useMemo(
    () => (myTeam ? m.team_label({ team: String(myTeam) }) : ""),
    [myTeam],
  );

  const otherOverlapLabel = useMemo(() => {
    const prefix = otherScheduleTitle ? `${otherScheduleTitle} ` : "";
    if (otherMode === "shiftType" && otherShiftType) {
      return `${prefix}${formatShiftTypeLabel(otherShiftType, effectiveOtherScheduleType ?? "5-shift")}`;
    }
    return `${prefix}${m.team_label({ team: String(otherTeam) })}`;
  }, [otherMode, otherShiftType, otherScheduleTitle, effectiveOtherScheduleType, otherTeam]);

  // Reset pagination when filters change
  useEffect(() => {
    setTransfersToShow(10);
  }, [
    otherTeam,
    useCustomRange,
    customStartDate,
    customEndDate,
    effectiveOtherScheduleType,
    otherMode,
    otherShiftType,
  ]);

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

  const overlapStats = useMemo(() => {
    const firstOverlap = overlaps[0];
    if (!firstOverlap) {
      return null;
    }

    const { earliest, latest } = overlaps.reduce(
      (acc, overlap) => ({
        earliest: overlap.start.isBefore(acc.earliest) ? overlap.start : acc.earliest,
        latest: overlap.end.isAfter(acc.latest) ? overlap.end : acc.latest,
      }),
      { earliest: firstOverlap.start, latest: firstOverlap.end },
    );

    return { earliest, latest };
  }, [overlaps]);

  // Current user's own time off covering the visible transfers/overlaps —
  // used to flag handovers or overlaps that fall on a day the user is away.
  const timeOffRange = useMemo(() => {
    const dates = [...transfers.map((t) => t.date), ...overlaps.map((o) => o.start)];
    const firstDate = dates[0];
    if (!firstDate) return null;
    const earliest = dates.reduce((min, d) => (d.isBefore(min) ? d : min), firstDate);
    const latest = dates.reduce((max, d) => (d.isAfter(max) ? d : max), firstDate);
    return { start: earliest.toDate(), end: latest.toDate() };
  }, [transfers, overlaps]);

  const timeOffEvents = useMemo(
    () => (timeOffRange ? getEventsInRange(timeOffRange.start, timeOffRange.end) : []),
    [getEventsInRange, timeOffRange],
  );

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
    const stats = showTransfers ? transferStats : overlapStats;
    if (!stats?.earliest || !stats?.latest) {
      return "-";
    }
    if (stats.earliest.isSame(stats.latest, "day")) {
      return formatDisplayDate(stats.earliest.toDate());
    }
    return (
      formatDisplayDate(stats.earliest.toDate()) +
      m.transfer_range_to() +
      formatDisplayDate(stats.latest.toDate())
    );
  }, [showTransfers, transferStats, overlapStats]);

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
    () => new Intl.PluralRules(locale).select(transfers.length),
    [transfers.length, locale],
  );

  const groupedOverlaps = useMemo(() => {
    const todayStart = currentDay.startOf("day");
    const nextWeek: typeof overlaps = [];
    const nextMonth: typeof overlaps = [];
    const future: typeof overlaps = [];
    const past: typeof overlaps = [];

    overlaps.forEach((overlap) => {
      const diffDays = overlap.start.startOf("day").diff(todayStart, "day");
      if (diffDays < 0) {
        past.push(overlap);
      } else if (diffDays < 7) {
        nextWeek.push(overlap);
      } else if (diffDays <= 30) {
        nextMonth.push(overlap);
      } else {
        future.push(overlap);
      }
    });

    return [
      { key: "next-7", title: m.transfer_next_7_days(), items: nextWeek },
      { key: "next-30", title: m.transfer_next_30_days(), items: nextMonth },
      { key: "further", title: m.transfer_further_ahead(), items: future },
      { key: "past", title: m.transfer_past(), items: past },
    ];
  }, [currentDay, overlaps]);

  const nonEmptyGroupedOverlaps = useMemo(
    () => groupedOverlaps.filter((group) => group.items.length > 0),
    [groupedOverlaps],
  );
  const overlapCountCategory = useMemo(
    () => new Intl.PluralRules(locale).select(overlaps.length),
    [overlaps.length, locale],
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
            <p className="text-muted mb-3">{m.transfer_select_schedule_prompt()}</p>
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
        ) : availableOtherTeams.length === 0 && otherMode !== "shiftType" ? (
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
                  {otherMode === "shiftType"
                    ? m.transfer_view_overlaps_with_shift_label()
                    : sameSchedule
                      ? m.transfer_view_with_team_label()
                      : m.transfer_view_overlaps_with_team_label()}
                </Form.Label>
                {otherMode === "team" ? (
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
                ) : (
                  <Form.Select
                    id={otherTeamSelectId}
                    value={otherShiftType ?? ""}
                    onChange={(e) => {
                      const next = otherWorkingShiftTypes.find((code) => code === e.target.value);
                      setOtherShiftType(next ?? null);
                    }}
                    aria-label={m.transfer_select_shift_aria()}
                  >
                    <option value="" disabled>
                      {m.transfer_select_shift_placeholder()}
                    </option>
                    {otherWorkingShiftTypes.map((code) => (
                      <option key={code} value={code}>
                        {formatShiftTypeLabel(code, effectiveOtherScheduleType ?? "5-shift")}
                      </option>
                    ))}
                  </Form.Select>
                )}
                <ButtonGroup size="sm" className="mt-2">
                  <Button
                    variant={otherMode === "team" ? "primary" : "outline-primary"}
                    disabled={availableOtherTeams.length === 0}
                    onClick={() => setOtherMode("team")}
                  >
                    {m.transfer_mode_team()}
                  </Button>
                  <Button
                    variant={otherMode === "shiftType" ? "primary" : "outline-primary"}
                    onClick={() => setOtherMode("shiftType")}
                  >
                    {m.transfer_mode_shift_type()}
                  </Button>
                </ButtonGroup>

                {myTeam && sameSchedule && !usingShiftTypeMode && transferStats && (
                  <div className="d-flex flex-wrap align-items-center gap-2 mt-3">
                    <span className="text-muted small text-uppercase">
                      {m.transfer_flow_label()}
                    </span>
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
                {!(myTeam && sameSchedule && !usingShiftTypeMode) && (
                  <div className="d-flex flex-wrap align-items-center gap-2 mt-3">
                    <span className="text-muted small text-uppercase">
                      {m.transfer_overlaps_section_title()}
                    </span>
                    <Badge bg="primary" pill className="d-inline-flex align-items-center gap-1">
                      <i className="bi bi-people-fill" aria-hidden="true"></i>
                      {overlaps.length}
                    </Badge>
                  </div>
                )}
              </Col>
              <Col md={8}>
                <Card className="h-100">
                  <Card.Body>
                    <div className="text-muted small text-uppercase mb-1">
                      {m.transfer_displayed_date_range()}
                    </div>
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

            {!showTransfers && (
              <Alert variant="secondary" className="d-flex align-items-center gap-2 py-2 mb-3">
                <i className="bi bi-info-circle" aria-hidden="true"></i>
                {!sameSchedule && otherScheduleTitle
                  ? m.transfer_comparing_schedule_note({ scheduleTitle: otherScheduleTitle })
                  : m.transfer_comparing_shift_type_note()}
              </Alert>
            )}

            {/* Results */}
            {isDateRangeInvalid ? (
              <Alert variant="warning" className="mb-0">
                {m.transfer_date_range_invalid()}
              </Alert>
            ) : myTeam && showTransfers ? (
              transfers.length === 0 ? (
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
                              timeOffEvents={timeOffEvents}
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
              )
            ) : overlaps.length === 0 ? (
              <EmptyState
                icon="bi-calendar-x"
                title={m.transfer_no_overlaps_title()}
                description={
                  otherMode === "shiftType"
                    ? m.transfer_no_overlaps_shift_desc({ label: otherOverlapLabel })
                    : m.transfer_no_overlaps_desc({ otherTeam: String(otherTeam) })
                }
              />
            ) : (
              <>
                <p className="text-muted small">{m.transfer_overlaps_help()}</p>
                <ErrorBoundary>
                  <Accordion
                    defaultActiveKey={nonEmptyGroupedOverlaps.map((group) => group.key)}
                    alwaysOpen
                  >
                    {nonEmptyGroupedOverlaps.map((group) => (
                      <Accordion.Item eventKey={group.key} key={group.key}>
                        <Accordion.Header>
                          {group.title}
                          <Badge bg="secondary" pill className="ms-2">
                            {group.items.length}
                          </Badge>
                        </Accordion.Header>
                        <Accordion.Body>
                          <OverlapItemsList
                            overlaps={group.items}
                            myLabel={myOverlapLabel}
                            otherLabel={otherOverlapLabel}
                            timeFormat={timeFormat}
                            timeOffEvents={timeOffEvents}
                          />
                        </Accordion.Body>
                      </Accordion.Item>
                    ))}
                  </Accordion>
                </ErrorBoundary>

                <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-2 mt-3">
                  <small className="text-muted">
                    {overlapCountCategory === "one"
                      ? m.transfer_showing_overlap_count_one({ count: String(overlaps.length) })
                      : m.transfer_showing_overlap_count_other({ count: String(overlaps.length) })}
                    {hasMoreOverlaps && ` ${m.transfer_more_available()}`}
                  </small>
                  {hasMoreOverlaps && (
                    <Button
                      variant="outline-primary"
                      size="sm"
                      onClick={() => setTransfersToShow((prev) => prev + 10)}
                    >
                      <i className="bi bi-plus-circle me-1" aria-hidden="true"></i>
                      {m.transfer_load_more_overlaps()}
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
