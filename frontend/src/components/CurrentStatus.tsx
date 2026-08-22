import { useEffect, useId, useMemo, useState } from "react";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import { useSettings } from "@/contexts/SettingsContext";
import { useLiveTime } from "@/hooks/useLiveTime";
import { formatTimeByPreference, formatYYWWD } from "@/utils/dateTimeUtils";
import { getLocale } from "@/paraglide/runtime.js";
import { getEffectiveTeam } from "@/utils/scheduleUtils";
import { getCurrentShiftDay, getCurrentWorkingTeam } from "@/utils/shiftCalculations";
import { PersonalizedStatusContent } from "./status/PersonalizedStatus";
import { GenericStatusContent } from "./status/GenericStatus";
import { SetupActionButton } from "./shared/SetupActionButton";
import { ShiftTimeline } from "./ShiftTimeline";
import * as m from "@/paraglide/messages.js";

interface CurrentStatusProps {
  myTeam: number | null;
  onChangeTeam: () => void;
  onChangeSchedule?: () => void;
  /** "compact" renders a summary strip; "responsive" does so only below Bootstrap's md breakpoint. */
  variant?: "full" | "compact" | "responsive";
}

/**
 * Current Status component displaying shift information.
 *
 * Shows a common header with date/time, then renders either personalized content
 * (user's team shifts) or generic content (overview of all teams).
 *
 * For single-user schedules (9-5), automatically treats user as team 1.
 * For multi-team schedules, shows generic view if no team selected.
 */
export function CurrentStatus({
  myTeam,
  onChangeTeam,
  onChangeSchedule,
  variant = "full",
}: CurrentStatusProps) {
  const dateTooltipId = useId();
  const { settings, scheduleType } = useSettings();
  const liveTime = useLiveTime({ precision: "minute" });
  const today = liveTime;
  const locale = getLocale();
  const [isMobile, setIsMobile] = useState(
    () => variant === "responsive" && window.matchMedia("(max-width: 767.98px)").matches,
  );

  useEffect(() => {
    if (variant !== "responsive") return;
    const query = window.matchMedia("(max-width: 767.98px)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [variant]);

  // A user-initiated expand always wins over the tab-driven default, but resets
  // when the default itself changes (e.g. switching tabs or crossing the breakpoint).
  const [expanded, setExpanded] = useState(false);
  const compactByDefault = variant === "compact" || (variant === "responsive" && isMobile);
  useEffect(() => {
    setExpanded(false);
  }, [compactByDefault]);
  const isCompact = compactByDefault && !expanded;
  const canCollapse = compactByDefault && expanded;

  // Get effective team - for single-user schedules, this returns 1 when myTeam is null
  const effectiveTeam = getEffectiveTeam(myTeam, scheduleType);

  // Calculate current shift day (accounts for night shifts spanning midnight)
  const currentShiftDay = useMemo(() => {
    if (!scheduleType) return liveTime;
    return getCurrentShiftDay(liveTime, scheduleType);
  }, [liveTime, scheduleType]);

  const localizedDateLabel = useMemo(() => {
    const liveTimeWithDate = liveTime as {
      toDate?: () => Date;
      format: (pattern: string) => string;
    };
    if (typeof liveTimeWithDate.toDate === "function") {
      return new Intl.DateTimeFormat(locale, {
        weekday: "long",
        month: "short",
        day: "numeric",
      }).format(liveTimeWithDate.toDate());
    }
    return liveTime.format("dddd, MMM D");
  }, [liveTime, locale]);

  // Find which team is currently working (for timeline)
  const currentWorkingTeam = useMemo(() => {
    if (!scheduleType) return null;
    return getCurrentWorkingTeam(liveTime, scheduleType);
  }, [liveTime, scheduleType]);

  // No schedule selected - show setup prompt
  if (!scheduleType) {
    return (
      <Col className="mb-4">
        <Card>
          <Card.Body className="text-center py-4">
            <i className="bi bi-calendar-plus text-muted mb-3 icon-lg" aria-hidden="true"></i>
            <p className="text-muted mb-3">{m.current_status_select_schedule_prompt()}</p>
            <SetupActionButton onChangeSchedule={onChangeSchedule} onChangeTeam={onChangeTeam} />
          </Card.Body>
        </Card>
      </Col>
    );
  }

  if (isCompact) {
    return (
      <Col className="mb-4">
        <Card className="current-status-compact">
          <Card.Body className="d-flex align-items-center justify-content-between gap-2 py-2">
            {effectiveTeam ? (
              <PersonalizedStatusContent
                myTeam={effectiveTeam}
                scheduleType={scheduleType}
                compact
              />
            ) : (
              <GenericStatusContent scheduleType={scheduleType} compact />
            )}
            <Button
              variant="link"
              size="sm"
              className="p-0 current-status-toggle flex-shrink-0"
              onClick={() => setExpanded(true)}
              aria-expanded={false}
              aria-label={m.current_status_expand()}
              title={m.current_status_expand()}
            >
              <i className="bi bi-chevron-down" aria-hidden="true"></i>
            </Button>
          </Card.Body>
        </Card>
      </Col>
    );
  }

  return (
    <Col className="mb-4">
      <Card>
        <Card.Body>
          {/* Common Header Row */}
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div className="d-flex align-items-center gap-3">
              <Card.Title className="mb-0">{m.schedule_current_status()}</Card.Title>
              <div className="text-muted">
                <OverlayTrigger
                  placement="bottom"
                  overlay={
                    <Tooltip id={dateTooltipId}>
                      <strong>{m.current_status_date_format()}</strong>
                      <br />
                      {m.current_status_yy_help()}
                      <br />
                      {m.current_status_ww_help()}
                      <br />
                      {m.current_status_d_help()}
                      <br />
                      <em>
                        {m.current_status_today_code({ code: formatYYWWD(today) })}
                        <br />
                        {m.current_status_shift_day_code({ code: formatYYWWD(currentShiftDay) })}
                      </em>
                    </Tooltip>
                  }
                >
                  <small className="help-underline">
                    <i className="bi bi-calendar2 me-1" aria-hidden="true"></i>
                    {formatYYWWD(currentShiftDay)} • {localizedDateLabel} •{" "}
                    {formatTimeByPreference(liveTime, settings.timeFormat)}
                  </small>
                </OverlayTrigger>
              </div>
            </div>
            <div className="d-flex align-items-center gap-2">
              {canCollapse && (
                <Button
                  variant="link"
                  size="sm"
                  className="p-0 current-status-toggle"
                  onClick={() => setExpanded(false)}
                  aria-expanded={true}
                  aria-label={m.current_status_collapse()}
                  title={m.current_status_collapse()}
                >
                  <i className="bi bi-chevron-up" aria-hidden="true"></i>
                </Button>
              )}
              <SetupActionButton
                onChangeSchedule={onChangeSchedule}
                onChangeTeam={onChangeTeam}
                size="sm"
              />
            </div>
          </div>

          {/* Timeline Row */}
          {currentWorkingTeam && (
            <div className="mb-3">
              <ShiftTimeline currentWorkingTeam={currentWorkingTeam} />
            </div>
          )}

          {/* Status Content - Personalized or Generic */}
          {effectiveTeam ? (
            <PersonalizedStatusContent myTeam={effectiveTeam} scheduleType={scheduleType} />
          ) : (
            <GenericStatusContent scheduleType={scheduleType} />
          )}
        </Card.Body>
      </Card>
    </Col>
  );
}
