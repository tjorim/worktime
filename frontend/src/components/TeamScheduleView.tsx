import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, SubmitEvent } from "react";
import type { Dayjs } from "dayjs";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import Spinner from "react-bootstrap/Spinner";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Popover from "react-bootstrap/Popover";
import Tooltip from "react-bootstrap/Tooltip";
import { useHdayHelper } from "@/contexts/HdayHelperContext";
import type { HdayEvent } from "@/lib/hday/types";
import { getPrimaryTypeFlag } from "@/lib/hday/flags";
import { getEventColorClass } from "@/lib/hday/presentation";
import { dayjs } from "@/utils/dateTimeUtils";
import { MonthNavigationButtonGroup } from "./shared/NavigationButtonGroup";
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

/** Full-day colour class for an event: the half-day look comes from the split fill, not a lighter colour. */
function getGridColorClass(event: HdayEvent): string {
  const typeFlags = event.flags?.filter((flag) => flag !== "half_am" && flag !== "half_pm");
  return getEventColorClass(typeFlags, event.type);
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
    { swatchClass: "calendar-available", label: m.team_legend_available() },
    { swatchClass: "calendar-weekend", label: m.team_legend_weekend() },
    { swatchClass: "event-holiday-full", label: m.team_legend_vacation() },
    { swatchClass: "event-ill-full", label: m.team_legend_sick() },
    { swatchClass: "event-business-full", label: m.team_legend_business() },
    { swatchClass: "event-course-full", label: m.team_legend_training() },
    { swatchClass: "event-recurring-full", label: m.team_legend_weekly_off() },
    { swatchClass: "event-birthday-full", label: m.team_legend_birthday() },
    { swatchClass: "event-in-full", label: m.team_legend_in_office() },
    { swatchClass: "event-other-full", label: m.team_legend_other() },
    { swatchClass: "event-weekend-full", label: m.team_legend_weekend_event() },
    {
      swatchClass: "event-holiday-full calendar-half-am",
      glyph: HALF_DAY_GLYPH.am,
      label: m.team_legend_half_am(),
    },
    {
      swatchClass: "event-holiday-full calendar-half-pm",
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
  // range that continues past the edge is still recognised as continuing.
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
    const nameColumn = container.querySelector<HTMLElement>(".calendar-name-cell");
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
      <Alert variant="info" className="mt-3">
        <Alert.Heading>{m.team_helper_required_heading()}</Alert.Heading>
        <p>{m.team_helper_required_body()}</p>
        <p className="mb-0 small">{m.team_helper_required_help()}</p>
      </Alert>
    );
  }

  const legendItems = getLegendItems();

  return (
    <div className="team-schedule-view py-3">
      <Card className="mb-3">
        <Card.Header>
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
            <h5 className="mb-0">
              <i
                className={`bi ${teamData ? "bi-building" : "bi-people"} me-2`}
                aria-hidden="true"
              ></i>
              {teamData ? teamData.name : m.team_viewer_title()}
            </h5>

            <Form onSubmit={handleSubmit} className="d-flex gap-2 flex-grow-1 team-id-form">
              <Form.Group className="flex-grow-1">
                <Form.Label htmlFor="team-id-input" className="visually-hidden">
                  {m.team_id_label()}
                </Form.Label>
                <Form.Control
                  id="team-id-input"
                  type="text"
                  size="sm"
                  placeholder={m.team_id_placeholder()}
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  disabled={isLoading}
                  aria-required="true"
                />
              </Form.Group>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={isLoading || !teamId.trim()}
              >
                {isLoading ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-2" />
                    {m.loading()}
                  </>
                ) : (
                  <>
                    <i className="bi bi-search me-1" aria-hidden="true"></i>
                    {m.team_load_btn()}
                  </>
                )}
              </Button>
            </Form>

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
        </Card.Header>
        <Card.Body>
          {error && (
            <Alert variant="danger" dismissible onClose={() => setError(null)}>
              <Alert.Heading>{m.error()}</Alert.Heading>
              <p className="mb-0">{error}</p>
            </Alert>
          )}

          {teamData ? (
            <>
              <h6 className="mb-3">
                {m.team_members_heading({ count: String(teamData.members.length) })}
                <span className="text-muted small ms-2">
                  {m.team_id_display({ id: teamData.team_id })}
                </span>
              </h6>

              <div className="table-responsive" ref={gridScrollRef}>
                <table className="team-calendar-grid" cellSpacing="0" cellPadding="1">
                  <thead>
                    {/* Month header row */}
                    <tr className="calendar-header">
                      <th className="calendar-name-cell" rowSpan={2}>
                        {m.team_calendar_name_header()}
                      </th>
                      {monthGroups.map((group, idx) => (
                        <th key={idx} className="calendar-month-header" colSpan={group.colspan}>
                          <span className="calendar-month-label">{group.month}</span>
                        </th>
                      ))}
                    </tr>
                    {/* Day header row */}
                    <tr className="calendar-header">
                      {dateRange.map((date) => {
                        const isWeekend = date.day() === 0 || date.day() === 6;
                        const isToday = date.isSame(dayjs(), "day");
                        return (
                          <th
                            key={date.format("YYYY-MM-DD")}
                            className={`calendar-day-header${isToday ? " is-today" : isWeekend ? " is-weekend" : ""}`}
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
                          <tr className="section-header-row">
                            <td className="section-header">
                              <i className="bi bi-people-fill me-2" aria-hidden="true"></i>
                              {section.title}
                            </td>
                            {/* Empty cells for date columns */}
                            {dateRange.map((date) => (
                              <td
                                key={date.format("YYYY-MM-DD")}
                                className="section-header-spacer"
                              ></td>
                            ))}
                          </tr>
                        )}
                        {/* Member rows */}
                        {section.members.map((member) => {
                          const tooltip = (
                            <Tooltip id={`tooltip-${member.username}`}>
                              <div className="text-start">
                                <strong>{member.display_name}</strong>
                                <br />
                                <code className="text-white">{member.username}</code>
                                <br />
                                {member.events.length === 1
                                  ? m.team_events_count_one({ count: String(member.events.length) })
                                  : m.team_events_count_other({
                                      count: String(member.events.length),
                                    })}
                                <br />
                                {member.etag ? (
                                  <span className="text-success">
                                    <i
                                      className="bi bi-file-earmark-text me-1"
                                      aria-hidden="true"
                                    ></i>
                                    {m.team_hday_file()}
                                  </span>
                                ) : (
                                  <span className="text-muted">
                                    <i className="bi bi-file-earmark-x me-1" aria-hidden="true"></i>
                                    {m.team_no_hday_file()}
                                  </span>
                                )}
                              </div>
                            </Tooltip>
                          );

                          return (
                            <tr key={member.username} className="calendar-member-row">
                              <td className="calendar-name-cell">
                                <OverlayTrigger placement="right" overlay={tooltip}>
                                  <span className="member-name" tabIndex={0}>
                                    {member.display_name}
                                  </span>
                                </OverlayTrigger>
                              </td>
                              {dateRange.map((date) => {
                                const memberEvents = eventsByMember.get(member);
                                const events = memberEvents?.get(date.format("YYYY-MM-DD")) ?? [];
                                const isWeekend = date.day() === 0 || date.day() === 6;
                                const isToday = date.isSame(dayjs(), "day");

                                let cellClass = "calendar-day-cell";
                                if (isWeekend) cellClass += " on-weekend";
                                let content: ReactNode = "\u00A0"; // Non-breaking space

                                if (events.length === 1) {
                                  const event = events[0];
                                  if (event) {
                                    cellClass += ` ${getGridColorClass(event)}`;
                                    const half = getHalfDay(event);
                                    if (half) {
                                      cellClass += ` calendar-half-${half}`;
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
                                      if (!previous?.includes(event)) cellClass += " range-start";
                                      if (!next?.includes(event)) cellClass += " range-end";
                                    }
                                  }
                                } else if (events.length > 1) {
                                  // Several events on one day: a stripe each, so none is hidden.
                                  cellClass += " calendar-multi";
                                  content = (
                                    <span className="calendar-cell-stack">
                                      {events.map((event, index) => {
                                        const half = getHalfDay(event);
                                        return (
                                          <span
                                            key={index}
                                            className={`calendar-cell-segment ${getGridColorClass(event)}${half ? ` calendar-half-${half}` : ""}`}
                                          />
                                        );
                                      })}
                                    </span>
                                  );
                                } else if (isWeekend) {
                                  cellClass += " calendar-weekend";
                                } else {
                                  cellClass += " calendar-available";
                                }

                                if (isToday) {
                                  cellClass += " calendar-today";
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
                                // focus or tap, so the details don't depend on colour or a mouse.
                                const described = events.map(describeEvent);
                                const dateLabel = date.format("ddd, MMM D YYYY");
                                return (
                                  <OverlayTrigger
                                    key={dateKey}
                                    placement="top"
                                    trigger={["hover", "focus"]}
                                    overlay={
                                      <Popover id={`cell-${member.username}-${dateKey}`}>
                                        <Popover.Header as="h6">
                                          {member.display_name}
                                          <span className="d-block fw-normal text-muted small">
                                            {dateLabel}
                                          </span>
                                        </Popover.Header>
                                        <Popover.Body>
                                          {described.map((item, index) => (
                                            <div
                                              key={index}
                                              className="d-flex align-items-start gap-2 mb-1"
                                            >
                                              <span
                                                className={`team-popover-chip ${item.colorClass}`}
                                                aria-hidden="true"
                                              ></span>
                                              <span>
                                                <strong>{item.typeLabel}</strong>
                                                {item.halfLabel && (
                                                  <span className="text-muted">
                                                    {" "}
                                                    · {item.halfLabel}
                                                  </span>
                                                )}
                                                {item.title && (
                                                  <span className="d-block text-muted small">
                                                    {item.title}
                                                  </span>
                                                )}
                                              </span>
                                            </div>
                                          ))}
                                        </Popover.Body>
                                      </Popover>
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
                                  </OverlayTrigger>
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
              <div className="text-center py-4">
                <i className="bi bi-inbox display-4 text-muted mb-2 d-block" aria-hidden="true"></i>
                <p className="text-muted mb-0">{m.team_empty_state()}</p>
              </div>
            )
          )}
        </Card.Body>
      </Card>

      {teamData && (
        <Card className="mb-3">
          <Card.Header>
            <h6 className="mb-0">{m.team_legend_heading()}</h6>
          </Card.Header>
          <Card.Body>
            <div className="row g-2">
              {legendItems.map((item) => (
                <div key={item.swatchClass} className="col-md-6 col-lg-4">
                  <div className="d-flex align-items-center gap-2">
                    <div className={`legend-color-box ${item.swatchClass}`} aria-hidden="true">
                      {item.glyph}
                    </div>
                    <span>{item.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card.Body>
        </Card>
      )}
    </div>
  );
}
