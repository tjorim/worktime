import {
  ArrowLeftRight as ArrowLeftRightIcon,
  ArrowRight as ArrowRightIcon,
  CalendarPlus as CalendarPlusIcon,
  CalendarRange as CalendarRangeIcon,
  CalendarX as CalendarXIcon,
  CircleArrowLeft as CircleArrowLeftIcon,
  CircleArrowRight as CircleArrowRightIcon,
  CirclePlus as CirclePlusIcon,
  CircleX as CircleXIcon,
  ClipboardList as ClipboardListIcon,
  Info as InfoIcon,
  Plane as PlaneIcon,
  UserCheck as UserCheckIcon,
  UserPlus as UserPlusIcon,
  Users as UsersIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import type { Dayjs } from "dayjs";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Grid, GridItem } from "@/components/ui/grid";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { SCHEDULE_OPTIONS, type ScheduleOption } from "@/data/rosters";
import { useSettings } from "@/contexts/SettingsContext";
import { useEventStore } from "@/contexts/EventStoreContext";
import type { CalendarEvent } from "@/lib/events/types";
import { resolveEventPaletteVars } from "@/lib/hday/presentation";
import { useTransferCalculations, type TransferInfo } from "@/hooks/useTransferCalculations";
import {
  dayjs,
  formatDisplayDate,
  formatTimeByPreference,
  formatYYWWD,
} from "@/utils/dateTimeUtils";
import { getTeamCountForOption, isValidScheduleType } from "@/utils/scheduleUtils";
import { getShift, type ShiftWindow } from "@/utils/shiftCalculations";
import { EmptyState } from "./shared/EmptyState";
import { SetupActionButton } from "./shared/SetupActionButton";
import { ShiftBadge } from "./shared/ShiftBadge";
import { TeamSelector } from "./shared/TeamSelector";
import { ErrorBoundary } from "./ErrorBoundary";
import * as m from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

// Pre-compute available schedules since SCHEDULE_OPTIONS is static
const availableSchedules = SCHEDULE_OPTIONS.filter((s) => s.isAvailable);

interface TransferViewProps {
  myTeam: number | null; // The user's team from onboarding
  initialOtherTeam?: number | null; // Initial other team (e.g., from Team Detail Modal)
  // Schedule to compare with. When it differs from the user's own schedule,
  // handover/takeover points aren't shown (the underlying shift-code
  // vocabulary isn't comparable across schedules) — only overlapping hours.
  otherScheduleType?: ScheduleOption | null;
  onOtherScheduleTypeChange?: (next: ScheduleOption | null) => void;
  onChangeSchedule?: () => void;
  onChangeTeam?: () => void;
}

/** Find the current user's own time-off event covering the given date, if any. */
function findTimeOffOnDate(events: CalendarEvent[], date: Dayjs): CalendarEvent | undefined {
  const dateStr = date.format("YYYY-MM-DD");
  return events.find(
    (event) => event.type === "holiday" && event.start <= dateStr && dateStr <= event.end,
  );
}

/** Small pill flagging that the user has time off recorded on this date. */
function TimeOffIndicator({ event }: { event: CalendarEvent | undefined }) {
  if (!event || event.type !== "holiday") return null;
  const { color, textColor, typeLabel } = event.meta;
  const { background, foreground } = resolveEventPaletteVars(color, textColor);
  const label = m.transfer_you_on_leave({ label: typeLabel });

  return (
    <Badge
      className="bg-event text-event-foreground"
      style={{ "--event-bg": background, "--event-fg": foreground } as CSSProperties}
      title={label}
    >
      <Icon icon={PlaneIcon} />
      <span className="sr-only">{label}</span>
    </Badge>
  );
}

/** Bucket items into next-7-days/next-30-days/further-ahead/past groups, keyed and titled for display. */
function groupByDayBucket<T>(items: T[], getDate: (item: T) => Dayjs, todayStart: Dayjs) {
  const nextWeek: T[] = [];
  const nextMonth: T[] = [];
  const future: T[] = [];
  const past: T[] = [];

  items.forEach((item) => {
    const diffDays = getDate(item).startOf("day").diff(todayStart, "day");
    if (diffDays < 0) {
      past.push(item);
    } else if (diffDays < 7) {
      nextWeek.push(item);
    } else if (diffDays <= 30) {
      nextMonth.push(item);
    } else {
      future.push(item);
    }
  });

  return [
    { key: "next-7", title: m.transfer_next_7_days(), items: nextWeek },
    { key: "next-30", title: m.transfer_next_30_days(), items: nextMonth },
    { key: "further", title: m.transfer_further_ahead(), items: future },
    { key: "past", title: m.transfer_past(), items: past },
  ];
}

function formatOverlapDuration(overlap: ShiftWindow): string {
  const totalMinutes = overlap.end.diff(overlap.start, "minute");
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0
    ? m.transfer_overlap_duration_hm({ hours: String(hours), minutes: String(minutes) })
    : m.transfer_overlap_duration_h({ hours: String(hours) });
}

/** Muted caption above a column; only shown from the desktop breakpoint, where the grid has columns. */
const COLUMN_HEADING = "mb-1 hidden text-muted-foreground uppercase md:block";

const LOAD_MORE_ROW =
  "mt-3 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center";

interface TransferItemsListProps {
  transfers: TransferInfo[];
  scheduleType: ScheduleOption;
  myTeam: number;
  timeOffEvents: CalendarEvent[];
}

function TransferItemsList({
  transfers,
  scheduleType,
  myTeam,
  timeOffEvents,
}: TransferItemsListProps) {
  return (
    <ul className="m-0 list-none divide-y divide-border p-0">
      {transfers.map((transfer, index) => {
        const fromShift = getShift(transfer.fromShiftType, scheduleType);
        const toShift = getShift(transfer.toShiftType, scheduleType);

        return (
          <li
            key={`${transfer.date.toISOString()}-${transfer.fromTeam}-${transfer.toTeam}-${transfer.fromShiftType}-${transfer.toShiftType}-${transfer.type}-${index}`}
            className="py-2"
          >
            <Grid className="items-center gap-2">
              <GridItem span={4} desktopSpan={3}>
                <div className="flex items-center gap-2 font-semibold">
                  <Icon
                    icon={transfer.type === "handover" ? CircleArrowRightIcon : CircleArrowLeftIcon}
                    className={transfer.type === "handover" ? "text-success" : "text-info"}
                  />
                  {formatYYWWD(transfer.date)}
                </div>
                <small className="flex items-center gap-1 text-muted-foreground">
                  {formatDisplayDate(transfer.date.toDate())}
                  <TimeOffIndicator event={findTimeOffOnDate(timeOffEvents, transfer.date)} />
                </small>
              </GridItem>
              <GridItem span={8} desktopSpan={4}>
                <small className={COLUMN_HEADING}>{m.transfer_teams_column()}</small>
                <div className="flex flex-nowrap items-center gap-1">
                  <Badge variant={transfer.fromTeam === myTeam ? "default" : "secondary"}>
                    {transfer.fromTeam === myTeam ? (
                      <>
                        <span className="hidden md:inline">{m.transfer_your_prefix()}</span>
                        {m.team_label({ team: String(transfer.fromTeam) })}
                      </>
                    ) : (
                      m.team_label({ team: String(transfer.fromTeam) })
                    )}
                  </Badge>
                  <Icon icon={ArrowRightIcon} className="text-muted-foreground" />
                  <Badge variant={transfer.toTeam === myTeam ? "default" : "secondary"}>
                    {transfer.toTeam === myTeam ? (
                      <>
                        <span className="hidden md:inline">{m.transfer_your_prefix()}</span>
                        {m.team_label({ team: String(transfer.toTeam) })}
                      </>
                    ) : (
                      m.team_label({ team: String(transfer.toTeam) })
                    )}
                  </Badge>
                </div>
              </GridItem>
              <GridItem span={4} desktopSpan={2}>
                <div className="flex flex-col items-start md:items-center">
                  <small className={COLUMN_HEADING}>{m.transfer_type_column()}</small>
                  <Badge variant={transfer.type === "handover" ? "success" : "info"}>
                    {transfer.type === "handover" ? m.transfer_handover() : m.transfer_takeover()}
                  </Badge>
                </div>
              </GridItem>
              <GridItem span={8} desktopSpan={3}>
                <div className="flex flex-col items-start md:items-end">
                  <small className={COLUMN_HEADING}>{m.transfer_shift_column()}</small>
                  <div className="flex flex-nowrap items-center gap-2 md:justify-end">
                    <ShiftBadge
                      shift={fromShift}
                      showEmoji
                      showName
                      pill
                      size="sm"
                      showTooltip={false}
                    />
                    <Icon icon={ArrowRightIcon} className="text-muted-foreground" />
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
              </GridItem>
            </Grid>
          </li>
        );
      })}
    </ul>
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
    <ul className="m-0 list-none divide-y divide-border p-0">
      {overlaps.map((overlap, index) => (
        <li
          key={`${overlap.start.toISOString()}-${overlap.end.toISOString()}-${index}`}
          className="py-2"
        >
          <Grid className="items-center gap-2">
            <GridItem span={5} desktopSpan={3}>
              <div className="flex items-center gap-2 font-semibold">
                <Icon icon={UsersIcon} className="text-primary" />
                {formatYYWWD(overlap.start)}
              </div>
              <small className="flex items-center gap-1 text-muted-foreground">
                {formatDisplayDate(overlap.start.toDate())}
                <TimeOffIndicator event={findTimeOffOnDate(timeOffEvents, overlap.start)} />
              </small>
            </GridItem>
            <GridItem span={7} desktopSpan={4}>
              <small className={COLUMN_HEADING}>{m.transfer_teams_column()}</small>
              <div className="flex flex-wrap items-center gap-1">
                <Badge>
                  <span className="hidden md:inline">{m.transfer_your_prefix()}</span>
                  {myLabel}
                </Badge>
                <Icon icon={ArrowLeftRightIcon} className="text-muted-foreground" />
                <Badge variant="secondary">{otherLabel}</Badge>
              </div>
            </GridItem>
            <GridItem span={12} desktopSpan={5}>
              <div className="flex flex-col items-start md:items-end">
                <small className={COLUMN_HEADING}>{m.transfer_shift_column()}</small>
                <div className="flex flex-nowrap items-center gap-2">
                  <span className="font-semibold">
                    {formatTimeByPreference(overlap.start, timeFormat)}–
                    {formatTimeByPreference(overlap.end, timeFormat)}
                  </span>
                  <Badge variant="outline">{formatOverlapDuration(overlap)}</Badge>
                </div>
              </div>
            </GridItem>
          </Grid>
        </li>
      ))}
    </ul>
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
  onOtherScheduleTypeChange,
  onChangeSchedule,
  onChangeTeam,
}: TransferViewProps) {
  // Generate unique IDs for form elements
  const compareScheduleSelectId = useId();
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
  });

  // Same-schedule comparisons show handover/takeover points (plus overlaps,
  // when there happen to be any); cross-schedule comparisons only ever show
  // overlapping hours, since the M/L/N handover vocabulary isn't comparable
  // across different schedule types.
  const sameSchedule = effectiveOtherScheduleType === scheduleType;
  const myScheduleTeamCount = getTeamCountForOption(scheduleType);
  const otherScheduleTeamCount = getTeamCountForOption(effectiveOtherScheduleType);
  const otherScheduleTitle = sameSchedule
    ? null
    : (SCHEDULE_OPTIONS.find((option) => option.value === effectiveOtherScheduleType)?.title ??
      effectiveOtherScheduleType);

  // Use validated team for display
  const myTeam = validatedMyTeam;
  const showTransfers = Boolean(myTeam) && sameSchedule;
  // Overlaps are shown whenever they have content; in the same-schedule case
  // that's rare (well-formed rotations hand over rather than overlap), so an
  // empty overlaps section is only worth calling out with its own empty
  // state when it's the sole result — i.e. cross-schedule.
  const showOverlapsList = overlaps.length > 0;
  const showOverlapsEmptyState = !sameSchedule && overlaps.length === 0;

  const myOverlapLabel = useMemo(() => {
    if (!myTeam) return "";
    if (myScheduleTeamCount > 1) return m.team_label({ team: String(myTeam) });
    return SCHEDULE_OPTIONS.find((option) => option.value === scheduleType)?.title ?? "";
  }, [myScheduleTeamCount, myTeam, scheduleType]);

  const otherOverlapLabel = useMemo(() => {
    if (otherScheduleTeamCount === 1 && otherScheduleTitle) return otherScheduleTitle;
    const prefix = otherScheduleTitle ? `${otherScheduleTitle} ` : "";
    return `${prefix}${m.team_label({ team: String(otherTeam) })}`;
  }, [otherScheduleTeamCount, otherScheduleTitle, otherTeam]);

  // Reset pagination when filters change, as a same-render response rather
  // than a follow-up effect.
  const [prevPaginationFilters, setPrevPaginationFilters] = useState([
    otherTeam,
    useCustomRange,
    customStartDate,
    customEndDate,
    effectiveOtherScheduleType,
  ]);
  const paginationFilters = [
    otherTeam,
    useCustomRange,
    customStartDate,
    customEndDate,
    effectiveOtherScheduleType,
  ];
  if (paginationFilters.some((value, index) => value !== prevPaginationFilters[index])) {
    setPrevPaginationFilters(paginationFilters);
    setTransfersToShow(10);
  }

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

  // {m.timeoff_clear_selection_btn()} dates when custom range is disabled, as
  // a same-render response rather than a follow-up effect.
  const [prevUseCustomRange, setPrevUseCustomRange] = useState(useCustomRange);
  if (prevUseCustomRange !== useCustomRange) {
    setPrevUseCustomRange(useCustomRange);
    if (!useCustomRange) {
      setCustomStartDate("");
      setCustomEndDate("");
    }
  }

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

  const comparisonScheduleSelector = onOtherScheduleTypeChange && (
    <Field className="mb-3">
      <FieldLabel htmlFor={compareScheduleSelectId} className="font-semibold">
        <Icon icon={ClipboardListIcon} className="mr-1" />
        {m.schedule_compare_label()}
      </FieldLabel>
      <NativeSelect
        id={compareScheduleSelectId}
        className="w-full"
        value={otherScheduleType || ""}
        onChange={(e) => {
          const value = e.target.value;
          onOtherScheduleTypeChange(isValidScheduleType(value) ? value : null);
        }}
      >
        <option value="" disabled>
          {m.schedule_select_placeholder()}
        </option>
        {availableSchedules.map((schedule) => (
          <option key={schedule.value} value={schedule.value}>
            {schedule.title}
            {schedule.value === scheduleType ? ` ${m.schedule_your_schedule_suffix()}` : ""}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );

  const groupedTransfers = useMemo(
    () => groupByDayBucket(transfers, (transfer) => transfer.date, currentDay.startOf("day")),
    [currentDay, transfers],
  );

  const nonEmptyGroupedTransfers = useMemo(
    () => groupedTransfers.filter((group) => group.items.length > 0),
    [groupedTransfers],
  );
  const transferCountCategory = useMemo(
    () => new Intl.PluralRules(locale).select(transfers.length),
    [transfers.length, locale],
  );

  const groupedOverlaps = useMemo(
    () => groupByDayBucket(overlaps, (overlap) => overlap.start, currentDay.startOf("day")),
    [currentDay, overlaps],
  );

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
      <CardHeader className="flex items-center justify-between border-b border-border">
        <span className="font-semibold">
          <Icon icon={ArrowLeftRightIcon} className="mr-2" />
          {m.transfer_team_transfers()}
        </span>
        {myTeam && myScheduleTeamCount > 1 && (
          <Badge>
            <Icon icon={UserCheckIcon} />
            {m.transfer_your_team({ team: String(myTeam) })}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {!scheduleType ? (
          <div className="py-4 text-center">
            <Icon icon={CalendarPlusIcon} className="mb-3 text-3xl text-muted-foreground" />
            <p className="mb-3 text-muted-foreground">{m.transfer_select_schedule_prompt()}</p>
            <SetupActionButton onChangeSchedule={onChangeSchedule} onChangeTeam={onChangeTeam} />
          </div>
        ) : !myTeam ? (
          <div className="py-4 text-center">
            <Icon icon={UserPlusIcon} className="mb-3 text-3xl text-muted-foreground" />
            <p className="mb-3 text-muted-foreground">{m.transfer_select_team_prompt()}</p>
            <SetupActionButton
              onChangeSchedule={onChangeSchedule}
              onChangeTeam={onChangeTeam}
              mode="team"
            />
          </div>
        ) : availableOtherTeams.length === 0 ? (
          <>
            {comparisonScheduleSelector && (
              <Grid className="mb-3">
                <GridItem span={12} desktopSpan={4}>
                  {comparisonScheduleSelector}
                </GridItem>
              </Grid>
            )}
            <EmptyState
              icon={UsersIcon}
              title={m.transfer_no_teams_title()}
              description={m.transfer_no_teams_desc()}
            />
          </>
        ) : (
          <>
            {/* Controls */}
            <Grid className="mb-3">
              <GridItem span={12} desktopSpan={4}>
                {comparisonScheduleSelector}

                {otherScheduleTeamCount > 1 && effectiveOtherScheduleType && (
                  <TeamSelector
                    inputId={otherTeamSelectId}
                    scheduleType={effectiveOtherScheduleType}
                    selectedTeam={otherTeam}
                    availableTeams={availableOtherTeams}
                    onChange={setOtherTeam}
                    ariaLabel={m.transfer_select_team_aria()}
                    label={
                      <>
                        <Icon icon={UsersIcon} className="mr-1" />
                        {sameSchedule
                          ? m.transfer_view_with_team_label()
                          : m.transfer_view_overlaps_with_team_label()}
                      </>
                    }
                  />
                )}

                {showTransfers && transferStats && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-sm text-muted-foreground uppercase">
                      {m.transfer_flow_label()}
                    </span>
                    <Badge variant="success">
                      <Icon icon={CircleArrowRightIcon} />
                      {m.transfer_handovers_count({ count: String(transferStats.handovers) })}
                    </Badge>
                    <Badge variant="info">
                      <Icon icon={CircleArrowLeftIcon} />
                      {m.transfer_takeovers_count({ count: String(transferStats.takeovers) })}
                    </Badge>
                  </div>
                )}
                {(showOverlapsList || showOverlapsEmptyState) && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-sm text-muted-foreground uppercase">
                      {m.transfer_overlaps_section_title()}
                    </span>
                    <Badge>
                      <Icon icon={UsersIcon} />
                      {overlaps.length}
                    </Badge>
                  </div>
                )}
              </GridItem>
              <GridItem span={12} desktopSpan={8}>
                <Card className="h-full">
                  <CardContent>
                    <div className="mb-1 text-sm text-muted-foreground uppercase">
                      {m.transfer_displayed_date_range()}
                    </div>
                    <div className="font-semibold">{displayedDateRangeValue}</div>
                    <div className="text-xs text-muted-foreground">
                      {m.transfer_displayed_range_help()}
                    </div>
                    {useCustomRange ? (
                      <div className="text-xs text-muted-foreground">
                        {m.transfer_selected_filter_range()}
                      </div>
                    ) : hasMoreTransfers ? (
                      <div className="text-xs text-muted-foreground">
                        {m.transfer_visible_only()}
                      </div>
                    ) : null}
                    <Separator className="my-3" />
                    <Field orientation="horizontal">
                      <Checkbox
                        id={showPastCheckboxId}
                        checked={useCustomRange}
                        onCheckedChange={setUseCustomRange}
                      />
                      <FieldLabel htmlFor={showPastCheckboxId} className="font-normal">
                        {m.transfer_filter_label()}
                      </FieldLabel>
                    </Field>
                    {useCustomRange && (
                      <Grid className="mt-1 gap-2">
                        <GridItem span={12} desktopSpan={5}>
                          <Field data-invalid={isDateRangeInvalid}>
                            <FieldLabel htmlFor={startDateId} className="font-semibold">
                              <Icon icon={CalendarRangeIcon} className="mr-1" />
                              {m.transfer_start_date_label()}
                            </FieldLabel>
                            <Input
                              type="date"
                              id={startDateId}
                              value={customStartDate}
                              onChange={(e) => setCustomStartDate(e.target.value)}
                              aria-invalid={isDateRangeInvalid}
                            />
                            {isDateRangeInvalid && (
                              <FieldError>{m.transfer_start_date_invalid()}</FieldError>
                            )}
                          </Field>
                        </GridItem>
                        <GridItem span={12} desktopSpan={5}>
                          <Field data-invalid={isDateRangeInvalid}>
                            <FieldLabel htmlFor={endDateId} className="font-semibold">
                              {m.transfer_end_date_label()}
                            </FieldLabel>
                            <Input
                              type="date"
                              id={endDateId}
                              value={customEndDate}
                              onChange={(e) => setCustomEndDate(e.target.value)}
                              aria-invalid={isDateRangeInvalid}
                            />
                            {isDateRangeInvalid && (
                              <FieldError>{m.transfer_end_date_invalid()}</FieldError>
                            )}
                          </Field>
                        </GridItem>
                        <GridItem span={12} desktopSpan={2} className="flex items-end">
                          <Button
                            variant="destructive"
                            className="w-full"
                            onClick={() => {
                              setCustomStartDate("");
                              setCustomEndDate("");
                            }}
                            disabled={!customStartDate && !customEndDate}
                          >
                            <Icon icon={CircleXIcon} className="mr-1" />
                            {m.timeoff_clear_selection_btn()}
                          </Button>
                        </GridItem>
                      </Grid>
                    )}
                  </CardContent>
                </Card>
              </GridItem>
            </Grid>

            {!sameSchedule && otherScheduleTitle && (
              <Alert className="mb-3 flex items-center gap-2">
                <Icon icon={InfoIcon} />
                {m.transfer_comparing_schedule_note({ scheduleTitle: otherScheduleTitle })}
              </Alert>
            )}

            {/* Results */}
            {isDateRangeInvalid ? (
              <Alert variant="warning">{m.transfer_date_range_invalid()}</Alert>
            ) : (
              <>
                {showTransfers && myTeam && (
                  <>
                    {transfers.length === 0 ? (
                      <EmptyState
                        icon={CalendarXIcon}
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
                            defaultValue={nonEmptyGroupedTransfers.map((group) => group.key)}
                            multiple
                          >
                            {nonEmptyGroupedTransfers.map((group) => (
                              <AccordionItem value={group.key} key={group.key}>
                                <AccordionTrigger>
                                  {group.title}
                                  <Badge variant="secondary" className="ml-2">
                                    {group.items.length}
                                  </Badge>
                                </AccordionTrigger>
                                <AccordionContent>
                                  <TransferItemsList
                                    transfers={group.items}
                                    myTeam={myTeam}
                                    scheduleType={scheduleType}
                                    timeOffEvents={timeOffEvents}
                                  />
                                </AccordionContent>
                              </AccordionItem>
                            ))}
                          </Accordion>
                        </ErrorBoundary>

                        <div className={LOAD_MORE_ROW}>
                          <small className="text-muted-foreground">
                            {transferCountCategory === "one"
                              ? m.transfer_showing_count_one({ count: String(transfers.length) })
                              : m.transfer_showing_count_other({ count: String(transfers.length) })}
                            {hasMoreTransfers && ` ${m.transfer_more_available()}`}
                          </small>
                          {hasMoreTransfers && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setTransfersToShow((prev) => prev + 10)}
                            >
                              <Icon icon={CirclePlusIcon} className="mr-1" />
                              {m.transfer_load_more()}
                            </Button>
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}

                {showOverlapsEmptyState && (
                  <div className={showTransfers ? "mt-4" : undefined}>
                    <EmptyState
                      icon={CalendarXIcon}
                      title={m.transfer_no_overlaps_title()}
                      description={m.transfer_no_overlaps_desc({ otherTeam: String(otherTeam) })}
                    />
                  </div>
                )}

                {showOverlapsList && (
                  <div className={showTransfers ? "mt-4" : undefined}>
                    <p className="text-sm text-muted-foreground">{m.transfer_overlaps_help()}</p>
                    <ErrorBoundary>
                      <Accordion
                        defaultValue={nonEmptyGroupedOverlaps.map((group) => group.key)}
                        multiple
                      >
                        {nonEmptyGroupedOverlaps.map((group) => (
                          <AccordionItem value={group.key} key={group.key}>
                            <AccordionTrigger>
                              {group.title}
                              <Badge variant="secondary" className="ml-2">
                                {group.items.length}
                              </Badge>
                            </AccordionTrigger>
                            <AccordionContent>
                              <OverlapItemsList
                                overlaps={group.items}
                                myLabel={myOverlapLabel}
                                otherLabel={otherOverlapLabel}
                                timeFormat={timeFormat}
                                timeOffEvents={timeOffEvents}
                              />
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    </ErrorBoundary>

                    <div className={LOAD_MORE_ROW}>
                      <small className="text-muted-foreground">
                        {overlapCountCategory === "one"
                          ? m.transfer_showing_overlap_count_one({ count: String(overlaps.length) })
                          : m.transfer_showing_overlap_count_other({
                              count: String(overlaps.length),
                            })}
                        {hasMoreOverlaps && ` ${m.transfer_more_available()}`}
                      </small>
                      {hasMoreOverlaps && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setTransfersToShow((prev) => prev + 10)}
                        >
                          <Icon icon={CirclePlusIcon} className="mr-1" />
                          {m.transfer_load_more_overlaps()}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
