import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SubmitEvent } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import Spinner from "react-bootstrap/Spinner";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import { useDeveloperOptions } from "../contexts/DeveloperOptionsContext";
import type { HdayEvent } from "../lib/hday/types";
import { getEventColorClass } from "../lib/hday/parser";
import { dayjs } from "../utils/dateTimeUtils";
import { MonthNavigationButtonGroup } from "./shared/NavigationButtonGroup";

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

/**
 * Check if a date has an event for a member
 */
function getEventsForDate(member: TeamMemberHdayData, date: dayjs.Dayjs): HdayEvent[] {
  return member.events.filter((event) => {
    if (event.type === "range" && event.start && event.end) {
      const eventStart = dayjs(event.start.replace(/\//g, "-")); // Convert YYYY/MM/DD to YYYY-MM-DD
      const eventEnd = dayjs(event.end.replace(/\//g, "-"));
      return date.isSameOrAfter(eventStart, "day") && date.isSameOrBefore(eventEnd, "day");
    } else if (event.type === "weekly" && event.weekday) {
      // Check if date matches the weekly pattern (1=Monday, 7=Sunday)
      const dayOfWeek = date.isoWeekday(); // 1=Monday, 7=Sunday
      return event.weekday === dayOfWeek;
    }
    return false;
  });
}

/**
 * Team Schedule Viewer - displays team members and their .hday schedules in a calendar grid.
 * Only visible when developer options are enabled and backend is connected.
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
  const { options } = useDeveloperOptions();
  const apiUrl = options.apiUrl;
  const connectionStatus = options.connectionStatus;

  const [teamId, setTeamId] = useState(() => {
    // Load saved team ID from localStorage
    return localStorage.getItem("worktime_last_team_id") || "";
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamData, setTeamData] = useState<TeamHdayResponse | null>(null);
  const [hasAttemptedFetch, setHasAttemptedFetch] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Date range for calendar (default: current month ± 1 month)
  const [startMonth, setStartMonth] = useState(() => dayjs().subtract(1, "month").startOf("month"));
  const [endMonth, setEndMonth] = useState(() => dayjs().add(1, "month").endOf("month"));

  // Save team ID to localStorage when it changes and reset attempt flag for new team
  useEffect(() => {
    if (teamId) {
      localStorage.setItem("worktime_last_team_id", teamId);
    }
    // Reset attempt flag when team ID changes to allow auto-fetch for new team
    setHasAttemptedFetch(false);
  }, [teamId]);

  // Reset state when connection is lost
  useEffect(() => {
    if (connectionStatus !== "connected") {
      setTeamData(null);
      setError(null);
      setHasAttemptedFetch(false);
    }
  }, [connectionStatus]);

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
      setError("Please enter a team ID");
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
      // Fetch team .hday data (includes team info)
      const response = await fetch(
        `${apiUrl}/v1/team/${encodeURIComponent(teamId)}/hday?format=parsed`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          signal: abortController.signal,
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch team data: ${errorText}`);
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

      console.error("Error fetching team data:", err);
      setError(err instanceof Error ? err.message : "An unknown error occurred");
      setTeamData(null);
    } finally {
      // Only update loading state if this request wasn't aborted
      if (!abortController.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [teamId, apiUrl]);

  // Auto-load team data if team ID is available and connected (only once per team ID)
  useEffect(() => {
    if (
      teamId &&
      connectionStatus === "connected" &&
      !teamData &&
      !isLoading &&
      !hasAttemptedFetch
    ) {
      fetchTeamData();
    }
  }, [teamId, connectionStatus, teamData, isLoading, hasAttemptedFetch, fetchTeamData]);

  const handleSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setHasAttemptedFetch(false); // Reset attempt flag to allow manual retry
    fetchTeamData();
  };

  // Generate array of all dates in the range
  const dateRange = useMemo(() => {
    const dates: dayjs.Dayjs[] = [];
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

  if (connectionStatus !== "connected") {
    return (
      <Alert variant="info" className="mt-3">
        <Alert.Heading>Backend Connection Required</Alert.Heading>
        <p>
          To view team schedules, please enable developer options and connect to the backend API.
        </p>
        <p className="mb-0 small">
          Open Settings → Developer Options and configure your backend API URL.
        </p>
      </Alert>
    );
  }

  return (
    <div className="team-schedule-view py-3">
      <Card className="mb-3">
        <Card.Body>
          <Card.Title>
            <i className="bi bi-people me-2" aria-hidden="true"></i>
            Team Schedule Viewer
          </Card.Title>
          <Card.Text className="text-muted small mb-3">
            Enter a team ID to view the team roster and .hday schedules for all members.
          </Card.Text>

          <Form onSubmit={handleSubmit}>
            <div className="d-flex gap-2 align-items-start">
              <Form.Group className="flex-grow-1">
                <Form.Label htmlFor="team-id-input" className="visually-hidden">
                  Team ID
                </Form.Label>
                <Form.Control
                  id="team-id-input"
                  type="text"
                  placeholder="Enter team ID (e.g., team1, dev-team)"
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  disabled={isLoading}
                  aria-required="true"
                />
              </Form.Group>
              <Button type="submit" variant="primary" disabled={isLoading || !teamId.trim()}>
                {isLoading ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-2" />
                    Loading...
                  </>
                ) : (
                  <>
                    <i className="bi bi-search me-1" aria-hidden="true"></i>
                    Load Team
                  </>
                )}
              </Button>
            </div>
          </Form>
        </Card.Body>
      </Card>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)}>
          <Alert.Heading>Error</Alert.Heading>
          <p className="mb-0">{error}</p>
        </Alert>
      )}

      {teamData && (
        <>
          <Card className="mb-3">
            <Card.Header>
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                <h5 className="mb-0">
                  <i className="bi bi-building me-2" aria-hidden="true"></i>
                  {teamData.name}
                </h5>
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
              </div>
            </Card.Header>
            <Card.Body>
              <h6 className="mb-3">
                Team Members ({teamData.members.length})
                <span className="text-muted small ms-2">ID: {teamData.team_id}</span>
              </h6>

              <div className="table-responsive">
                <table className="team-calendar-grid" cellSpacing="0" cellPadding="1">
                  <thead>
                    {/* Month header row */}
                    <tr className="calendar-header">
                      <th className="calendar-name-cell" rowSpan={2}>
                        Name
                      </th>
                      {monthGroups.map((group, idx) => (
                        <th key={idx} className="calendar-month-header" colSpan={group.colspan}>
                          {group.month}
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
                            className="calendar-day-header"
                            style={{
                              background: isToday
                                ? "var(--wt-team-cal-today)"
                                : isWeekend
                                  ? "var(--wt-team-cal-weekend)"
                                  : undefined,
                              opacity: isWeekend && !isToday ? 0.6 : 1,
                            }}
                            title={date.format("ddd, MMM D")}
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
                                {member.events.length} event{member.events.length !== 1 ? "s" : ""}
                                <br />
                                {member.etag ? (
                                  <span className="text-success">
                                    <i
                                      className="bi bi-file-earmark-text me-1"
                                      aria-hidden="true"
                                    ></i>
                                    .hday file
                                  </span>
                                ) : (
                                  <span className="text-muted">
                                    <i className="bi bi-file-earmark-x me-1" aria-hidden="true"></i>
                                    No .hday file
                                  </span>
                                )}
                              </div>
                            </Tooltip>
                          );

                          return (
                            <tr key={member.username} className="calendar-member-row">
                              <td className="calendar-name-cell">
                                <OverlayTrigger placement="right" overlay={tooltip}>
                                  <span className="member-name">{member.display_name}</span>
                                </OverlayTrigger>
                              </td>
                              {dateRange.map((date) => {
                                const events = getEventsForDate(member, date);
                                const isWeekend = date.day() === 0 || date.day() === 6;
                                const isToday = date.isSame(dayjs(), "day");

                                let cellClass = "calendar-day-cell";
                                let content = "\u00A0"; // Non-breaking space
                                let isHalfDay = false;

                                if (events.length > 0) {
                                  const event = events[0];
                                  if (event) {
                                    // Check for half-day
                                    isHalfDay =
                                      event.flags !== undefined &&
                                      (event.flags.includes("half_am") ||
                                        event.flags.includes("half_pm"));

                                    // Use first event if multiple
                                    cellClass += ` ${getEventColorClass(event.flags, event.type)}`;

                                    // Show symbol for half-day events
                                    if (isHalfDay) {
                                      content = "½"; // Half-day indicator
                                    }
                                  }
                                } else if (isWeekend) {
                                  cellClass += " calendar-weekend";
                                } else {
                                  cellClass += " calendar-available";
                                }

                                if (isToday) {
                                  cellClass += " calendar-today";
                                }

                                return (
                                  <td
                                    key={date.format("YYYY-MM-DD")}
                                    className={cellClass}
                                    title={
                                      events.length > 0
                                        ? `${date.format("MMM D")}: ${events.map((e) => e.title || "Event").join(", ")}`
                                        : date.format("MMM D")
                                    }
                                  >
                                    {content}
                                  </td>
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
            </Card.Body>
          </Card>

          {/* Legend */}
          <Card className="mb-3">
            <Card.Header>
              <h6 className="mb-0">Legend</h6>
            </Card.Header>
            <Card.Body>
              <div className="row g-2">
                <div className="col-md-6 col-lg-4">
                  <div className="d-flex align-items-center gap-2">
                    <div className="legend-color-box calendar-available"></div>
                    <span>Available / In office</span>
                  </div>
                </div>
                <div className="col-md-6 col-lg-4">
                  <div className="d-flex align-items-center gap-2">
                    <div className="legend-color-box event-holiday-full"></div>
                    <span>Vacation</span>
                  </div>
                </div>
                <div className="col-md-6 col-lg-4">
                  <div className="d-flex align-items-center gap-2">
                    <div className="legend-color-box event-ill-full"></div>
                    <span>Sick leave</span>
                  </div>
                </div>
                <div className="col-md-6 col-lg-4">
                  <div className="d-flex align-items-center gap-2">
                    <div className="legend-color-box event-business-full"></div>
                    <span>Business trip</span>
                  </div>
                </div>
                <div className="col-md-6 col-lg-4">
                  <div className="d-flex align-items-center gap-2">
                    <div className="legend-color-box event-course-full"></div>
                    <span>Training / Course</span>
                  </div>
                </div>
                <div className="col-md-6 col-lg-4">
                  <div className="d-flex align-items-center gap-2">
                    <div className="legend-color-box event-recurring-full"></div>
                    <span>Weekly off</span>
                  </div>
                </div>
                <div className="col-md-6 col-lg-4">
                  <div className="d-flex align-items-center gap-2">
                    <div className="legend-color-box event-birthday-full"></div>
                    <span>Birthday</span>
                  </div>
                </div>
                <div className="col-md-6 col-lg-4">
                  <div className="d-flex align-items-center gap-2">
                    <div className="legend-color-box calendar-weekend"></div>
                    <span>Weekend</span>
                  </div>
                </div>
                <div className="col-md-6 col-lg-4">
                  <div className="d-flex align-items-center gap-2">
                    <div className="legend-color-box event-in-full"></div>
                    <span>In office (explicit)</span>
                  </div>
                </div>
                <div className="col-md-6 col-lg-4">
                  <div className="d-flex align-items-center gap-2">
                    <span className="fw-bold fs-5">½</span>
                    <span>Half-day event</span>
                  </div>
                </div>
              </div>
            </Card.Body>
          </Card>
        </>
      )}

      {!teamData && !error && !isLoading && (
        <Card className="text-center py-5">
          <Card.Body>
            <i className="bi bi-inbox display-1 text-muted mb-3 d-block" aria-hidden="true"></i>
            <p className="text-muted">Enter a team ID above to load team schedule data.</p>
          </Card.Body>
        </Card>
      )}
    </div>
  );
}
