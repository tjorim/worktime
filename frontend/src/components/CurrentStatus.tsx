import { CalendarIcon, CalendarPlusIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";

import { useSettings } from "@/contexts/SettingsContext";
import { useLiveTime } from "@/hooks/useLiveTime";
import { formatTimeByPreference, formatYYWWD } from "@/utils/dateTimeUtils";
import { getLocale } from "@/paraglide/runtime.js";
import { getEffectiveTeam } from "@/utils/scheduleUtils";
import { getCurrentShiftDay, getCurrentWorkingTeam } from "@/utils/shiftCalculations";
import { PersonalizedStatusContent } from "@/components/status/PersonalizedStatus";
import { GenericStatusContent } from "@/components/status/GenericStatus";
import { SetupActionButton } from "@/components/shared/SetupActionButton";
import { ShiftTimeline } from "@/components/ShiftTimeline";
import * as m from "@/paraglide/messages.js";

// Keep optional help out of the initial Base UI dependency closure.
const DateCodeHelp = lazy(() =>
  import("@/components/shared/DateCodeHelp").then((module) => ({ default: module.DateCodeHelp })),
);

interface CurrentStatusProps {
  myTeam: number | null;
  onChangeTeam: () => void;
  onChangeSchedule?: () => void;
  /** "compact" renders a summary strip; "responsive" does so only below the md breakpoint. */
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
  const [prevCompactByDefault, setPrevCompactByDefault] = useState(compactByDefault);
  if (prevCompactByDefault !== compactByDefault) {
    setPrevCompactByDefault(compactByDefault);
    setExpanded(false);
  }
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
      <div className="mb-6">
        <Card>
          <CardContent className="text-center py-6">
            <Icon icon={CalendarPlusIcon} className="text-muted-foreground mb-4 size-10" />
            <p className="text-muted-foreground mb-4">
              {m.current_status_select_schedule_prompt()}
            </p>
            <SetupActionButton onChangeSchedule={onChangeSchedule} onChangeTeam={onChangeTeam} />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isCompact) {
    return (
      <div className="mb-6">
        <Card>
          <CardContent className="flex items-center justify-between gap-2 py-2">
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
              className="p-0 text-muted-foreground no-underline shrink-0"
              onClick={() => setExpanded(true)}
              aria-expanded={false}
              aria-label={m.current_status_expand()}
              title={m.current_status_expand()}
            >
              <Icon icon={ChevronDownIcon} />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const dateLabel = (
    <>
      <Icon icon={CalendarIcon} className="mr-1" />
      {m.date_code_label()} {formatYYWWD(currentShiftDay)} • {localizedDateLabel} •{" "}
      {formatTimeByPreference(liveTime, settings.timeFormat)}
    </>
  );

  return (
    <div className="mb-6">
      <Card>
        <CardContent>
          {/* Common Header Row */}
          <div className="flex flex-wrap gap-2 justify-between items-center mb-4">
            <div className="flex flex-wrap items-center gap-4">
              <CardTitle className="mb-0">{m.schedule_current_status()}</CardTitle>
              <div className="text-muted-foreground">
                <Suspense fallback={<small>{dateLabel}</small>}>
                  <DateCodeHelp
                    todayCode={formatYYWWD(today)}
                    shiftDayCode={formatYYWWD(currentShiftDay)}
                  >
                    <button
                      type="button"
                      className="text-sm underline decoration-dotted rounded focus-visible:ring-3 focus-visible:ring-ring"
                    >
                      {dateLabel}
                    </button>
                  </DateCodeHelp>
                </Suspense>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canCollapse && (
                <Button
                  variant="link"
                  size="sm"
                  className="p-0 text-muted-foreground no-underline"
                  onClick={() => setExpanded(false)}
                  aria-expanded={true}
                  aria-label={m.current_status_collapse()}
                  title={m.current_status_collapse()}
                >
                  <Icon icon={ChevronUpIcon} />
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
            <div className="mb-4">
              <ShiftTimeline currentWorkingTeam={currentWorkingTeam} />
            </div>
          )}

          {/* Status Content - Personalized or Generic */}
          {effectiveTeam ? (
            <PersonalizedStatusContent myTeam={effectiveTeam} scheduleType={scheduleType} />
          ) : (
            <GenericStatusContent scheduleType={scheduleType} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
