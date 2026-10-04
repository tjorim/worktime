import { Input } from "@/components/ui/input";
import {
  Building as BuildingIcon,
  FileText as FileTextIcon,
  FileX as FileXIcon,
  Inbox as InboxIcon,
  Search as SearchIcon,
  Users as UsersIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, SubmitEvent } from "react";
import type { Dayjs } from "dayjs";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Hint } from "@/components/ui/tooltip";
import { DetailsHeader, PopoverBody } from "@/components/ui/popover";
import { useHdayHelper } from "@/contexts/HdayHelperContext";
import type { HdayEvent } from "@/lib/hday/types";
import { getPrimaryTypeFlag } from "@/lib/hday/flags";
import { getEventColorUtilities } from "@/lib/hday/presentation";
import { dayjs } from "@/utils/dateTimeUtils";
import { MonthNavigationButtonGroup } from "@/components/shared/NavigationButtonGroup";
import { useDevicePreferences } from "@/hooks/useDevicePreferences";
import * as m from "@/paraglide/messages.js";
import { logger } from "@/utils/logger";
import { getHdayHelperErrorMessage, resolveHdayHelperBaseUrl } from "@/utils/hdayHelper";
import {
  getHalfDay,
  getScrollLeftForColumn,
  indexEventsByDate,
  type HalfDay,
} from "@/utils/teamCalendarGrid";

interface TeamMember {
  username: string;
  display_name: string;
}

interface TeamMemberHdayData extends TeamMember {
  raw: string;
  events: HdayEvent[];
  etag: string | null;
}

interface TeamSectionHdayData {
  title: string | null;
  members: TeamMemberHdayData[];
}

interface TeamHdayResponse {
  team_id: string;
  name: string;
  sections: TeamSectionHdayData[];
  members: TeamMemberHdayData[]; // Flat list for backward compatibility
}

/** Full-day color class for an event: the half-day look comes from the split fill, not a lighter color. */
function getGridColorClass(event: HdayEvent): string {
  const typeFlags = event.flags?.filter((flag) => flag !== "half_am" && flag !== "half_pm");
  return getEventColorUtilities(typeFlags, event.type);
}

const HALF_DAY_GLYPH: Record<HalfDay, string> = { am: "◐", pm: "◑" };

function getEventTypeName(event: HdayEvent): string {
  switch (getPrimaryTypeFlag(event.flags)) {
    case "business":
      return m.team_legend_business();
    case "course":
      return m.team_legend_training();
    case "in":
      return m.team_legend_in_office();
    case "weekend":
      return m.team_legend_weekend_event();
    case "birthday":
      return m.team_legend_birthday();
    case "ill":
      return m.team_legend_sick();
    case "other":
      return m.team_legend_other();
    default:
      // A weekly pattern with no type is the standing day off, not booked leave.
      return event.type === "weekly" ? m.team_legend_weekly_off() : m.team_legend_vacation();
  }
}

/** Everything a cell needs to say about one event, for the popover and the aria-label alike. */
function describeEvent(event: HdayEvent) {
  const half = getHalfDay(event);
  const halfLabel =
    half === "am" ? m.team_legend_half_am() : half === "pm" ? m.team_legend_half_pm() : null;
  const isRecurringVariant =
    event.type === "weekly" && getPrimaryTypeFlag(event.flags) !== "holiday";
  const typeLabel = isRecurringVariant
    ? `${getEventTypeName(event)} (${m.team_popover_weekly()})`
    : getEventTypeName(event);
  const title = event.title?.trim() || null;
  const text = [typeLabel, halfLabel ? `(${halfLabel})` : null, title ? `– ${title}` : null]
    .filter(Boolean)
    .join(" ");
  return { colorClass: getGridColorClass(event), typeLabel, halfLabel, title, text };
}

// One entry per distinguishable look in the grid. The swatch reuses the grid's own
// classes, so the legend can't drift from what the cells actually show.
function getLegendItems() {
  return [
    { swatchClass: "bg-wt-team-cal-available", label: m.team_legend_available() },
    { swatchClass: "bg-wt-team-cal-weekend-cell", label: m.team_legend_weekend() },
    {
      swatchClass: "bg-wt-event-holiday-full-bg text-wt-event-holiday-full-fg",
      label: m.team_legend_vacation(),
    },
    {
      swatchClass: "bg-wt-event-ill-full-bg text-wt-event-ill-full-fg",
      label: m.team_legend_sick(),
    },
    {
      swatchClass: "bg-wt-event-business-full-bg text-wt-event-business-full-fg",
      label: m.team_legend_business(),
    },
    {
      swatchClass: "bg-wt-event-course-full-bg text-wt-event-course-full-fg",
      label: m.team_legend_training(),
    },
    {
      swatchClass: "bg-wt-event-recurring-full-bg text-wt-event-recurring-full-fg",
      label: m.team_legend_weekly_off(),
    },
    {
      swatchClass: "bg-wt-event-birthday-full-bg text-wt-event-birthday-full-fg",
      label: m.team_legend_birthday(),
    },
    {
      swatchClass: "bg-wt-event-in-full-bg text-wt-event-in-full-fg",
      label: m.team_legend_in_office(),
    },
    {
      swatchClass: "bg-wt-event-other-full-bg text-wt-event-other-full-fg",
      label: m.team_legend_other(),
    },
    {
      swatchClass: "bg-wt-event-weekend-full-bg text-wt-event-weekend-full-fg",
      label: m.team_legend_weekend_event(),
    },
    {
      swatchClass: "bg-wt-event-holiday-full-bg text-wt-event-holiday-full-fg team-half-am",
      glyph: HALF_DAY_GLYPH.am,
      label: m.team_legend_half_am(),
    },
    {
      swatchClass: "bg-wt-event-holiday-full-bg text-wt-event-holiday-full-fg team-half-pm",
      glyph: HALF_DAY_GLYPH.pm,
      label: m.team_legend_half_pm(),
    },
  ];
}

/**
 * Team Schedule Viewer - displays team members and their .hday schedules in a calendar grid.
 * Team data remains in the legacy holiday planner, so this view talks to the
 * local .hday helper configured in Schedule & team settings.
 *
 * Shows a calendar-style grid with:
 * - Dates as columns (horizontal timeline)
 * - Team members as rows (grouped by sections)
 * - Color-coded cells for different event types
 * - Member metadata shown on hover over names
 *
 * Inspired by example-team-overview.html.
 */
export function TeamScheduleView() {
  const { options } = useHdayHelper();
  const { preferences, setPreferences } = useDevicePreferences();
  const helperBaseUrl = resolveHdayHelperBaseUrl(options.hdayHelperUrl);

  const [teamId, setTeamId] = useState(() => preferences?.lastHdayTeamId ?? "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamData, setTeamData] = useState<TeamHdayResponse | null>(null);
  const [hasAttemptedFetch, setHasAttemptedFetch] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);

  // Date range for calendar (default: current month ± 1 month)
  const [startMonth, setStartMonth] = useState(() => dayjs().subtract(1, "month").startOf("month"));
  const [endMonth, setEndMonth] = useState(() => dayjs().add(1, "month").endOf("month"));

  // Save the team selection with the other device-local preferences.
  useEffect(() => {
    if (teamId) {
      setPreferences((current) => ({ ...current, lastHdayTeamId: teamId }));
    }
    // Reset attempt flag when team ID changes to allow auto-fetch for new team
    setHasAttemptedFetch(false);
  }, [setPreferences, teamId]);

  // Reset state when the target helper changes — otherwise data fetched from
  // the previous helper stays on screen (or a stale in-flight request from it
  // resolves) after the user selects a different helper in settings.
  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsLoading(false);
    setTeamData(null);
    setError(null);
    setHasAttemptedFetch(false);
  }, [helperBaseUrl]);

  // Cleanup: abort any pending requests on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const fetchTeamData = useCallback(async () => {
    if (!teamId.trim()) {
      setError(m.team_enter_id_error());
      setHasAttemptedFetch(true);
      return;
    }

    // Abort any previous fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this fetch
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsLoading(true);
    setError(null);
    setTeamData(null);
    setHasAttemptedFetch(true);

    try {
      // Fetch team .hday data (includes team info) — routed to the configured local
      // helper when set, since production doesn't mount these routes on the app origin.
      if (!helperBaseUrl) return;
      const response = await fetch(
        `${helperBaseUrl}/team/${encodeURIComponent(teamId)}/hday?format=parsed`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          signal: abortController.signal,
        },
      );

      if (!response.ok) {
        const errorMessage = await getHdayHelperErrorMessage(response, m.team_unknown_error());
        throw new Error(m.team_fetch_failed({ error: errorMessage }));
      }

      const data: TeamHdayResponse = await response.json();

      // Only update state if this request wasn't aborted
      if (!abortController.signal.aborted) {
        setTeamData(data);
      }
    } catch (err) {
      // Don't show error if the request was aborted
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }

      logger.error("Error fetching team data:", err);
      setError(err instanceof Error ? err.message : m.team_unknown_error());
      setTeamData(null);
    } finally {
      // Only update loading state if this request wasn't aborted
      if (!abortController.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [teamId, helperBaseUrl]);

  // Auto-load team data if the team and helper are available (only once per team ID).
  // Helper connectivity is independent of the hosted Worktime backend connection.
  useEffect(() => {
    if (teamId && helperBaseUrl && !teamData && !isLoading && !hasAttemptedFetch) {
      fetchTeamData();
    }
  }, [teamId, helperBaseUrl, teamData, isLoading, hasAttemptedFetch, fetchTeamData]);

  const handleSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setHasAttemptedFetch(false); // Reset attempt flag to allow manual retry
    fetchTeamData();
  };

  // Generate array of all dates in the range
  const dateRange = useMemo(() => {
    const dates: Dayjs[] = [];
    let current = startMonth;
    while (current.isSameOrBefore(endMonth, "day")) {
      dates.push(current);
      current = current.add(1, "day");
    }
    return dates;
  }, [startMonth, endMonth]);

  // Group dates by month for header
  const monthGroups = useMemo(() => {
    const groups: { month: string; colspan: number }[] = [];
    let currentMonth = "";
    let count = 0;

    dateRange.forEach((date) => {
      const monthName = date.format("MMMM YYYY");
      if (monthName !== currentMonth) {
        if (count > 0) {
          groups.push({ month: currentMonth, colspan: count });
        }
        currentMonth = monthName;
        count = 1;
      } else {
        count++;
      }
    });

    if (count > 0) {
      groups.push({ month: currentMonth, colspan: count });
    }

    return groups;
  }, [dateRange]);

  // Events per member per day, over the range plus one day either side so a
  // range that continues past the edge is still recognized as continuing.
  const eventsByMember = useMemo(() => {
    const index = new Map<TeamMemberHdayData, Map<string, HdayEvent[]>>();
    const first = dateRange[0];
    const last = dateRange[dateRange.length - 1];
    if (!teamData || !first || !last) return index;
    const padded = [first.subtract(1, "day"), ...dateRange, last.add(1, "day")];
    for (const section of teamData.sections) {
      for (const member of section.members) {
        index.set(member, indexEventsByDate(member.events, padded));
      }
    }
    return index;
  }, [teamData, dateRange]);

  // Bring today into view whenever the grid (re)appears or the range changes:
  // the default range spans three months, so today is otherwise off-screen.
  // A range that doesn't contain today just starts at the beginning.
  useEffect(() => {
    const container = gridScrollRef.current;
    if (!container) return;
    const todayHeader = container.querySelector<HTMLElement>('th[aria-current="date"]');
    const nameColumn = container.querySelector<HTMLElement>("[data-team-name]");
    if (!todayHeader) {
      container.scrollLeft = 0;
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const todayRect = todayHeader.getBoundingClientRect();
    container.scrollLeft = getScrollLeftForColumn({
      containerLeft: containerRect.left,
      containerWidth: containerRect.width,
      currentScrollLeft: container.scrollLeft,
      columnLeft: todayRect.left,
      columnWidth: todayRect.width,
      stickyWidth: nameColumn?.getBoundingClientRect().width ?? 0,
    });
  }, [teamData, dateRange]);

  // This is normally unreachable because TimeOffView only exposes the Team tab
  // after a helper is configured. Keep a guard for direct rendering and stale state.
  if (!helperBaseUrl) {
    return (
      <Alert variant="info" className="mt-4">
        <h5>{m.team_helper_required_heading()}</h5>
        <p>{m.team_helper_required_body()}</p>
        <p className="mb-0 text-sm">{m.team_helper_required_help()}</p>
      </Alert>
    );
  }

  const legendItems = getLegendItems();

  return (
    <div data-slot="team-schedule-view" className="py-4">
      <Card className="mb-4">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h5 className="mb-0">
              <Icon icon={teamData ? BuildingIcon : UsersIcon} className="mr-2" />
              {teamData ? teamData.name : m.team_viewer_title()}
            </h5>

            <form onSubmit={handleSubmit} className="flex gap-2 grow min-w-56 max-w-md">
              <div className="grow">
                <label htmlFor="team-id-input" className="sr-only">
                  {m.team_id_label()}
                </label>
                <Input
                  id="team-id-input"
                  type="text"
                  placeholder={m.team_id_placeholder()}
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  disabled={isLoading}
                  aria-required="true"
                />
              </div>
              <Button
                type="submit"
                variant="default"
                size="sm"
                disabled={isLoading || !teamId.trim()}
              >
                {isLoading ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    {m.loading()}
                  </>
                ) : (
                  <>
                    <Icon icon={SearchIcon} className="mr-1" />
                    {m.team_load_btn()}
                  </>
                )}
              </Button>
            </form>

            {teamData && (
              <MonthNavigationButtonGroup
                isCurrent={
                  startMonth.isSame(dayjs().subtract(1, "month").startOf("month"), "day") &&
                  endMonth.isSame(dayjs().add(1, "month").endOf("month"), "day")
                }
                onPrevious={() => {
                  setStartMonth(startMonth.subtract(1, "month"));
                  setEndMonth(endMonth.subtract(1, "month"));
                }}
                onCurrent={() => {
                  setStartMonth(dayjs().subtract(1, "month").startOf("month"));
                  setEndMonth(dayjs().add(1, "month").endOf("month"));
                }}
                onNext={() => {
                  setStartMonth(startMonth.add(1, "month"));
                  setEndMonth(endMonth.add(1, "month"));
                }}
                displayLabel={`${startMonth.format("MMM YYYY")} - ${endMonth.format("MMM YYYY")}`}
              />
            )}
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive">
              <h5>{m.error()}</h5>
              <p className="mb-0">{error}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setError(null)}
                aria-label={m.close()}
              >
                {m.close()}
              </Button>
            </Alert>
          )}

          {teamData ? (
            <>
              <h6 className="mb-4">
                {m.team_members_heading({ count: String(teamData.members.length) })}
                <span className="text-muted-foreground text-sm ml-2">
                  {m.team_id_display({ id: teamData.team_id })}
                </span>
              </h6>

              <div className="overflow-x-auto" ref={gridScrollRef}>
                <table
                  data-team-grid
                  className="team-grid w-full border-collapse text-sm"
                  cellSpacing="0"
                  cellPadding="1"
                >
                  <thead>
                    {/* Month header row */}
                    <tr className="bg-team-header text-team-header-foreground">
                      <th
                        data-team-name
                        className="team-name-width sticky left-0 z-11 box-border truncate border border-border bg-team-header px-4 py-2 text-left shadow-team-name"
                        rowSpan={2}
                      >
                        {m.team_calendar_name_header()}
                      </th>
                      {monthGroups.map((group, idx) => (
                        <th
                          key={idx}
                          className="border-l border-team-header-divider p-1.5 text-center font-semibold"
                          colSpan={group.colspan}
                        >
                          <span
                            data-team-month-label
                            className="team-month-label inline-block sticky"
                          >
                            {group.month}
                          </span>
                        </th>
                      ))}
                    </tr>
                    {/* Day header row */}
                    <tr className="bg-team-header text-team-header-foreground">
                      {dateRange.map((date) => {
                        const isWeekend = date.day() === 0 || date.day() === 6;
                        const isToday = date.isSame(dayjs(), "day");
                        return (
                          <th
                            key={date.format("YYYY-MM-DD")}
                            className={`min-w-7 border-l border-team-day-divider p-1 text-center text-xs${isToday ? " bg-team-today text-team-today-foreground font-bold" : isWeekend ? " bg-team-header-weekend font-medium" : " font-medium"}`}
                            title={date.format("ddd, MMM D")}
                            aria-current={isToday ? "date" : undefined}
                          >
                            {date.format("D")}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {teamData.sections.map((section, sectionIndex) => (
                      <Fragment key={`section-${sectionIndex}`}>
                        {/* Section header row (if multiple sections with titles) */}
                        {section.title && teamData.sections.length > 1 && (
                          <tr>
                            <td className="team-name-width sticky left-0 z-5 box-border truncate border-t-2 border-b border-r-2 border-border bg-secondary px-2 team:px-4 py-2 text-foreground font-semibold">
                              <Icon icon={UsersIcon} className="hidden team:inline mr-2" />
                              {section.title}
                            </td>
                            {/* Empty cells for date columns */}
                            {dateRange.map((date) => (
                              <td
                                key={date.format("YYYY-MM-DD")}
                                className="h-9 border-t-2 border-b border-border bg-secondary p-0"
                              ></td>
                            ))}
                          </tr>
                        )}
                        {/* Member rows */}
                        {section.members.map((member) => {
                          const tooltip = (
                            <div id={`tooltip-${member.username}`}>
                              <div className="text-left">
                                <strong>{member.display_name}</strong>
                                <br />
                                <code className="text-primary-foreground">{member.username}</code>
                                <br />
                                {member.events.length === 1
                                  ? m.team_events_count_one({ count: String(member.events.length) })
                                  : m.team_events_count_other({
                                      count: String(member.events.length),
                                    })}
                                <br />
                                {member.etag ? (
                                  <span className="text-success">
                                    <Icon icon={FileTextIcon} className="mr-1" />
                                    {m.team_hday_file()}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">
                                    <Icon icon={FileXIcon} className="mr-1" />
                                    {m.team_no_hday_file()}
                                  </span>
                                )}
                              </div>
                            </div>
                          );

                          return (
                            <tr data-team-member key={member.username} className="group">
                              <td
                                data-team-name
                                className="team-name-width sticky left-0 z-5 box-border truncate border border-r-2 border-border bg-background group-hover:bg-muted px-2 team:px-4 py-1 text-left text-foreground shadow-team-name"
                              >
                                <Hint placement="right" content={tooltip}>
                                  <span
                                    data-team-member-name
                                    className="block truncate font-medium focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                                    tabIndex={0}
                                  >
                                    {member.display_name}
                                  </span>
                                </Hint>
                              </td>
                              {dateRange.map((date) => {
                                const memberEvents = eventsByMember.get(member);
                                const events = memberEvents?.get(date.format("YYYY-MM-DD")) ?? [];
                                const isWeekend = date.day() === 0 || date.day() === 6;
                                const isToday = date.isSame(dayjs(), "day");

                                let cellClass =
                                  "team-day relative min-w-7 h-6 border border-border font-mono hover:opacity-85 hover:cursor-pointer focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 focus-visible:z-1";
                                if (isWeekend) cellClass += " team-weekend-rest";
                                let content: ReactNode = "\u00A0"; // Non-breaking space

                                if (events.length === 1) {
                                  const event = events[0];
                                  if (event) {
                                    cellClass += ` ${getGridColorClass(event)}`;
                                    const half = getHalfDay(event);
                                    if (half) {
                                      cellClass +=
                                        half === "am"
                                          ? " team-half-am py-0 pr-0"
                                          : " team-half-pm py-0 pl-0";
                                      content = HALF_DAY_GLYPH[half];
                                    }
                                    // Cap the first and last day of a range so it reads as one
                                    // block while every cell keeps its border.
                                    if (event.type === "range") {
                                      const previous = memberEvents?.get(
                                        date.subtract(1, "day").format("YYYY-MM-DD"),
                                      );
                                      const next = memberEvents?.get(
                                        date.add(1, "day").format("YYYY-MM-DD"),
                                      );
                                      if (!previous?.includes(event))
                                        cellClass += " team-range-start";
                                      if (!next?.includes(event)) cellClass += " team-range-end";
                                    }
                                  }
                                } else if (events.length > 1) {
                                  // Several events on one day: a stripe each, so none is hidden.
                                  content = (
                                    <span
                                      data-team-event-stack
                                      className="flex flex-col h-full min-h-6"
                                    >
                                      {events.map((event, index) => {
                                        const half = getHalfDay(event);
                                        return (
                                          <span
                                            key={index}
                                            data-team-event-segment
                                            className={`flex-1 min-h-0 leading-none text-team-stripe ${getGridColorClass(event)}${half ? (half === "am" ? " team-half-am" : " team-half-pm") : ""}`}
                                          />
                                        );
                                      })}
                                    </span>
                                  );
                                } else if (isWeekend) {
                                  cellClass += " bg-wt-team-cal-weekend-cell";
                                } else {
                                  cellClass += " bg-wt-team-cal-available";
                                }

                                if (events.length !== 1 || !getHalfDay(events[0]!)) {
                                  cellClass += " p-0 text-center font-bold text-xs";
                                }

                                if (isToday) {
                                  cellClass += " brightness-120 shadow-team-today";
                                }

                                const dateKey = date.format("YYYY-MM-DD");

                                if (events.length === 0) {
                                  return (
                                    <td
                                      key={dateKey}
                                      className={cellClass}
                                      data-date={dateKey}
                                      title={date.format("MMM D")}
                                    >
                                      {content}
                                    </td>
                                  );
                                }

                                // Cells with events are focusable and open a popover on hover,
                                // focus or tap, so the details don't depend on color or a mouse.
                                const described = events.map(describeEvent);
                                const dateLabel = date.format("ddd, MMM D YYYY");
                                return (
                                  <Hint
                                    key={dateKey}
                                    variant="details"
                                    openOnClick
                                    placement="top"
                                    content={
                                      <>
                                        <DetailsHeader>
                                          {member.display_name}
                                          <span className="block font-normal text-muted-foreground text-sm">
                                            {dateLabel}
                                          </span>
                                        </DetailsHeader>
                                        <PopoverBody>
                                          {described.map((item, index) => (
                                            <div
                                              key={index}
                                              className="flex items-start gap-2 mb-1"
                                            >
                                              <span
                                                className={`shrink-0 size-3.5 mt-0.75 rounded-xs border border-border ${item.colorClass}`}
                                                aria-hidden="true"
                                              ></span>
                                              <span>
                                                <strong>{item.typeLabel}</strong>
                                                {item.halfLabel && (
                                                  <span className="text-muted-foreground">
                                                    {" "}
                                                    · {item.halfLabel}
                                                  </span>
                                                )}
                                                {item.title && (
                                                  <span className="block text-muted-foreground text-sm">
                                                    {item.title}
                                                  </span>
                                                )}
                                              </span>
                                            </div>
                                          ))}
                                        </PopoverBody>
                                      </>
                                    }
                                  >
                                    <td
                                      className={cellClass}
                                      data-date={dateKey}
                                      tabIndex={0}
                                      aria-label={`${member.display_name}, ${dateLabel}: ${described.map((item) => item.text).join("; ")}`}
                                    >
                                      {content}
                                    </td>
                                  </Hint>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            !error &&
            !isLoading && (
              <div className="text-center py-6">
                <Icon icon={InboxIcon} className="size-12 text-muted-foreground mb-2 block" />
                <p className="text-muted-foreground mb-0">{m.team_empty_state()}</p>
              </div>
            )
          )}
        </CardContent>
      </Card>

      {teamData && (
        <Card className="mb-4">
          <CardHeader>
            <h6 className="mb-0">{m.team_legend_heading()}</h6>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-12 gap-4 gap-2">
              {legendItems.map((item) => (
                <div key={item.swatchClass} className="col-span-12 md:col-span-6 lg:col-span-4">
                  <div className="flex items-center gap-2">
                    <div
                      data-team-swatch
                      className={`flex items-center shrink-0 size-7 rounded border border-border ${item.swatchClass}`}
                      aria-hidden="true"
                    >
                      {item.glyph}
                    </div>
                    <span>{item.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
