import { Alert } from "@/components/ui/alert";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Calendar as CalendarIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  ClipboardList as ClipboardListIcon,
  Users as UsersIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { TeamCarousel } from "@/components/shared/TeamCarousel";

import { Hint } from "@/components/ui/tooltip";
import clsx from "clsx";
import { SCHEDULE_OPTIONS, type ScheduleOption } from "@/data/rosters";
import { ShiftBadge } from "@/components/shared/ShiftBadge";
import { hasMultipleTeams, isValidScheduleType } from "@/utils/scheduleUtils";
import { getISOWeekYear2Digit } from "@/utils/dateTimeUtils";
import { getLocale } from "@/paraglide/runtime.js";
import type { ShiftResult } from "@/utils/shiftCalculations";
import { getAllTeamsShifts, isCurrentlyWorking } from "@/utils/shiftCalculations";
import { useFormattedShiftTime } from "@/hooks/useFormattedShiftTime";
import { useLiveTime } from "@/hooks/useLiveTime";
import * as m from "@/paraglide/messages.js";

// Pre-compute available schedules since SCHEDULE_OPTIONS is static
const availableSchedules = SCHEDULE_OPTIONS.filter((s) => s.isAvailable);

interface TodayViewProps {
  myTeam: number | null; // The user's team from onboarding
  onTeamClick?: (teamNumber: number, scheduleType: ScheduleOption | null) => void;
  viewingScheduleType: ScheduleOption | null;
  userScheduleType: ScheduleOption | null;
  onViewingScheduleTypeChange: (next: ScheduleOption | null) => void;
}

/**
 * Render a team shift card showing shift details, live status and optional interactivity.
 *
 * Renders a Card displaying team number, shift code badge (with tooltip), shift name and working hours.
 * Shows a live overlay and LIVE badge when the team is currently active. When `onTeamClick` is provided
 * the card is rendered as interactive and invokes the callback with the team number on click or keyboard activation.
 *
 * @param shiftResult - ShiftResult containing team number, shift, date and full code to display
 * @param isMyTeam - Whether this card corresponds to the current user's team (applies "tw:ring-2 tw:ring-primary" styling)
 * @param isCurrentlyActive - Whether the team's shift is currently active (controls live overlay and badge)
 * @param onTeamClick - Optional callback invoked with the team number and schedule type when the card is activated
 * @returns The Card element for the given team and shift; interactive when `onTeamClick` is provided
 */
function TeamCard({
  shiftResult,
  isMyTeam,
  isCurrentlyActive,
  hasTeams,
  onTeamClick,
  scheduleType,
}: {
  shiftResult: ShiftResult;
  isMyTeam: boolean;
  isCurrentlyActive: boolean;
  hasTeams: boolean;
  onTeamClick?: (teamNumber: number, scheduleType: ScheduleOption | null) => void;
  scheduleType: ScheduleOption;
}) {
  // Use shiftResult.shift directly - already contains emoji/className/name/displayCode
  const shift = shiftResult.shift;
  const shiftTimeLabel = useFormattedShiftTime(shift);

  const cardContent = (
    <>
      {isCurrentlyActive && (
        <>
          <div className="tw:absolute tw:inset-0 tw:pointer-events-none tw:rounded-xl tw:bg-success-bg/50"></div>
          <Badge
            variant="success"
            className="tw:absolute tw:bottom-4 tw:right-4 tw:z-10 tw:text-xs"
            aria-label={
              hasTeams
                ? m.schedule_team_working_aria({ team: String(shiftResult.teamNumber) })
                : m.schedule_working_aria()
            }
          >
            {m.today_view_live_badge()}
          </Badge>
        </>
      )}
      <div className="tw:relative tw:z-10 tw:flex tw:justify-between tw:items-center tw:mb-2">
        <div className="tw:flex tw:items-center tw:gap-2">
          <h6 className="tw:mb-0">
            {hasTeams
              ? m.team_label({ team: String(shiftResult.teamNumber) })
              : m.week_view_schedule_label()}
          </h6>
          {onTeamClick && (
            <Icon icon={ChevronRightIcon} className="tw:text-muted-foreground tw:text-sm" />
          )}
        </div>
        <ShiftBadge shift={shift} />
      </div>
      <div className="tw:text-muted-foreground tw:text-sm">
        {shift.name}
        <br />
        {shift.isWorking ? shiftTimeLabel : m.schedule_not_working_today()}
      </div>
      <div className="tw:text-muted-foreground tw:text-sm tw:mt-1">
        <Hint
          placement="bottom"
          content={
            <div id={`code-tooltip-${shiftResult.teamNumber}`}>
              <strong>{m.shift_full_code_title()}</strong>
              <br />
              {m.shift_code_format()}
              <br />
              {m.today_view_shift_full_code_tooltip({
                code: shiftResult.code,
                isoYear: getISOWeekYear2Digit(shiftResult.date),
                isoWeek: String(shiftResult.date.isoWeek()),
                weekday: new Intl.DateTimeFormat(getLocale(), { weekday: "long" }).format(
                  shiftResult.date.toDate(),
                ),
                shift: shift.name,
              })}
            </div>
          }
        >
          <span className="help-underline">{shiftResult.code}</span>
        </Hint>
      </div>
    </>
  );

  if (onTeamClick) {
    return (
      <Card
        className={clsx(
          "tw:relative tw:cursor-pointer tw:transition tw:hover:bg-muted tw:focus-visible:outline-2 tw:focus-visible:outline-ring",
          "tw:w-full",
          isMyTeam && "tw:ring-2 tw:ring-primary",
        )}
        onClick={() => onTeamClick(shiftResult.teamNumber, scheduleType)}
        role="button"
        aria-label={
          hasTeams
            ? m.today_view_team_details_aria({ team: String(shiftResult.teamNumber) })
            : m.week_view_schedule_label()
        }
        title={
          hasTeams
            ? m.today_view_team_details_aria({ team: String(shiftResult.teamNumber) })
            : m.week_view_schedule_label()
        }

        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onTeamClick(shiftResult.teamNumber, scheduleType);
          }
        }}
      >
        <CardContent className="tw:p-4">{cardContent}</CardContent>
      </Card>
    );
  }

  return (
    <Card className={clsx("tw:relative", isMyTeam && "tw:ring-2 tw:ring-primary")}>
      <CardContent className="tw:p-4">{cardContent}</CardContent>
    </Card>
  );
}

/**
 * Render a card listing all teams scheduled for today, with a schedule selector and optional
 * per-team interactivity. Today always reflects the actual current date — it has no date
 * navigation of its own (see WeekView for browsing other days/weeks).
 *
 * Works with any schedule type - automatically adapts to single-user or multi-team schedules. Shifts are calculated
 * internally based on the selected viewing schedule, supporting cross-schedule viewing functionality.
 *
 * @param myTeam - Current user's team number, or `null`; used to visually highlight the user's team card.
 * @param onTeamClick - Optional handler invoked with a team number and schedule type when a team card is activated (click or keyboard).
 * @param viewingScheduleType - The schedule currently being browsed, or `null` if none is selected yet.
 * @param userScheduleType - The user's own schedule, used to mark it in the selector.
 * @param onViewingScheduleTypeChange - Callback invoked when the schedule selector changes.
 * @returns A React element representing the Today card containing a schedule selector and a responsive grid of team cards.
 */
export function TodayView({
  myTeam,
  onTeamClick,
  viewingScheduleType,
  userScheduleType,
  onViewingScheduleTypeChange,
}: TodayViewProps) {
  const scheduleSelectId = useId();
  const hasTeams = viewingScheduleType ? hasMultipleTeams(viewingScheduleType) : false;
  const today = useLiveTime({ precision: "minute" });
  const [mobileTeamIndex, setMobileTeamIndex] = useState(0);

  // Calculate shifts for the viewing schedule
  const todayShifts = viewingScheduleType ? getAllTeamsShifts(today, viewingScheduleType) : [];

  // Reset the mobile team carousel whenever the viewed schedule changes, as a
  // same-render response rather than a follow-up effect.
  const [prevViewingScheduleType, setPrevViewingScheduleType] = useState(viewingScheduleType);
  if (prevViewingScheduleType !== viewingScheduleType) {
    setPrevViewingScheduleType(viewingScheduleType);
    setMobileTeamIndex(0);
  }

  const isCurrentlyActive = (shiftResult: ShiftResult) => {
    if (!viewingScheduleType || !shiftResult.shift.isWorking) return false;
    return isCurrentlyWorking(shiftResult.shift, shiftResult.date, today, viewingScheduleType);
  };

  return (
    <Card>
      <CardHeader>
        <div className="tw:flex tw:flex-col tw:md:flex-row tw:justify-between tw:items-start tw:md:items-center tw:gap-2 tw:mb-2">
          <span className="tw:font-semibold">
            <Icon icon={hasTeams ? UsersIcon : CalendarIcon} className="tw:mr-2" />
            {hasTeams ? m.week_view_all_teams() : m.week_view_schedule_label()}
          </span>
          <div className="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
            <label
              htmlFor={scheduleSelectId}
              className="tw:mb-0 tw:text-sm tw:text-muted-foreground"
            >
              <Icon icon={ClipboardListIcon} className="tw:mr-1" />
              {m.schedule_view_label()}
            </label>
            <NativeSelect
              id={scheduleSelectId}
              value={viewingScheduleType || ""}
              onChange={(e) => {
                const value = e.target.value;
                onViewingScheduleTypeChange(isValidScheduleType(value) ? value : null);
              }}
              className="tw:w-auto"
            >
              <option value="" disabled>
                {m.schedule_select_placeholder()}
              </option>
              {availableSchedules.map((schedule) => (
                <option key={schedule.value} value={schedule.value}>
                  {schedule.title}
                  {schedule.value === userScheduleType
                    ? ` ${m.schedule_your_schedule_suffix()}`
                    : ""}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        {viewingScheduleType && (
          <div className="tw:text-muted-foreground tw:text-sm">
            {new Intl.DateTimeFormat(getLocale(), {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            }).format(today.toDate())}
            <Badge
              variant="success"
              className="tw:ml-2"
              aria-label={m.today_view_current_day_aria()}
            >
              {m.today()}
            </Badge>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {!viewingScheduleType ? (
          <Alert variant="info" role="status">
            {m.schedule_select_hint()}
          </Alert>
        ) : (
          <>
            {todayShifts.length > 1 && (
              <div className="tw:sm:hidden">
                <div className="tw:flex tw:items-center tw:justify-between tw:mb-2">
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={m.today_view_previous_team()}
                    onClick={() =>
                      setMobileTeamIndex(
                        (mobileTeamIndex - 1 + todayShifts.length) % todayShifts.length,
                      )
                    }
                  >
                    <Icon icon={ChevronLeftIcon} />
                  </Button>
                  <span className="tw:text-sm tw:text-muted-foreground" aria-live="polite">
                    {m.today_view_team_position({
                      current: String(mobileTeamIndex + 1),
                      total: String(todayShifts.length),
                    })}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={m.today_view_next_team()}
                    onClick={() => setMobileTeamIndex((mobileTeamIndex + 1) % todayShifts.length)}
                  >
                    <Icon icon={ChevronRightIcon} />
                  </Button>
                </div>
                <TeamCarousel activeIndex={mobileTeamIndex} onSelect={setMobileTeamIndex}>
                  {todayShifts.map((shiftResult) => (
                    <div key={shiftResult.teamNumber}>
                      <TeamCard
                        shiftResult={shiftResult}
                        isMyTeam={myTeam === shiftResult.teamNumber}
                        isCurrentlyActive={isCurrentlyActive(shiftResult)}
                        hasTeams={hasTeams}
                        onTeamClick={onTeamClick}
                        scheduleType={viewingScheduleType}
                      />
                    </div>
                  ))}
                </TeamCarousel>
              </div>
            )}
            <div
              className={
                todayShifts.length > 1
                  ? "tw:hidden tw:sm:grid tw:sm:grid-cols-2 tw:md:grid-cols-3 tw:lg:grid-cols-5 tw:gap-2"
                  : "tw:grid tw:gap-2"
              }
            >
              {todayShifts.map((shiftResult) => (
                <div key={shiftResult.teamNumber} className="tw:min-w-0">
                  <TeamCard
                    shiftResult={shiftResult}
                    isMyTeam={myTeam === shiftResult.teamNumber}
                    isCurrentlyActive={isCurrentlyActive(shiftResult)}
                    hasTeams={hasTeams}
                    onTeamClick={onTeamClick}
                    scheduleType={viewingScheduleType}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
