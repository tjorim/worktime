import {
  Calendar as CalendarIcon,
  CalendarPlus as CalendarPlusIcon,
  Keyboard as KeyboardIcon,
  Users as UsersIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import type { Dayjs } from "dayjs";
import { useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Hint } from "@/components/ui/tooltip";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import clsx from "clsx";
import type { ScheduleOption } from "@/data/rosters";
import { useSettings } from "@/contexts/SettingsContext";
import { getScheduleConfig } from "@/utils/scheduleUtils";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { dayjs, formatYYWWD, getISOWeekYear2Digit } from "@/utils/dateTimeUtils";
import { calculateShift } from "@/utils/shiftCalculations";
import { getLocale } from "@/paraglide/runtime.js";
import { ShiftBadge } from "@/components/shared/ShiftBadge";
import { WeekNavigationButtonGroup } from "@/components/shared/NavigationButtonGroup";
import * as m from "@/paraglide/messages.js";
import { logger } from "@/utils/logger";

interface WeekViewProps {
  myTeam: number | null; // The user's team from onboarding
  currentDate: Dayjs;
  setCurrentDate: (date: Dayjs) => void;
  isActive?: boolean;
  viewingScheduleType?: ScheduleOption | null;
}

/**
 * Render the weekly schedule overview for all teams, with navigation, date jump and keyboard shortcuts.
 *
 * Works with any schedule type - automatically adapts to single-user or multi-team schedules.
 * Validates the provided `myTeam` and treats out-of-range team numbers as no team selected.
 *
 * @param myTeam - The user's team number from onboarding, or `null` if none is set
 * @param currentDate - The date used to determine which week is displayed
 * @param setCurrentDate - Callback to update the displayed date
 * @returns The rendered schedule overview component
 */
export function WeekView({
  myTeam: inputMyTeam,
  currentDate,
  setCurrentDate,
  isActive = false,
  viewingScheduleType: propViewingScheduleType,
}: WeekViewProps) {
  const { scheduleType: userScheduleType } = useSettings();

  // Use prop if provided, otherwise fall back to user's schedule type
  const scheduleType = propViewingScheduleType ?? userScheduleType;

  const handlePrevious = useCallback(() => {
    setCurrentDate(currentDate.subtract(7, "day"));
  }, [currentDate, setCurrentDate]);

  const handleNext = useCallback(() => {
    setCurrentDate(currentDate.add(7, "day"));
  }, [currentDate, setCurrentDate]);

  const handleCurrent = useCallback(() => {
    setCurrentDate(dayjs());
  }, [setCurrentDate]);

  const handleDateChange = (dateString: string) => {
    if (dateString) {
      setCurrentDate(dayjs(dateString));
    }
  };

  // Generate Monday-Sunday week containing the current date
  const startOfWeek = currentDate.startOf("isoWeek"); // Monday (ISO week)
  const weekDays = Array.from({ length: 7 }, (_, i) => startOfWeek.add(i, "day"));
  const selectedWeekNumber = startOfWeek.add(0, "day").isoWeek();
  const selectedWeekYear = startOfWeek.isoWeekYear();

  // Check if we're viewing the current week
  const currentWeekStart = dayjs().startOf("isoWeek");
  const isCurrentWeek = startOfWeek.isSame(currentWeekStart, "day");

  // Keyboard shortcuts (only active when this tab is visible)
  const shortcuts = useMemo(
    () =>
      isActive
        ? {
            onToday: handleCurrent,
            onPrevious: handlePrevious,
            onNext: handleNext,
          }
        : {},
    [isActive, handleCurrent, handlePrevious, handleNext],
  );
  useKeyboardShortcuts(shortcuts);

  // Memoize today's date for consistent "today" highlighting throughout rendering
  const today = dayjs();
  const locale = getLocale();
  const shortDateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }),
    [locale],
  );
  const longDateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "long", month: "short", day: "numeric" }),
    [locale],
  );
  const shortWeekdayFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "short" }),
    [locale],
  );

  const formatShortDate = (value: Dayjs) => shortDateFormatter.format(dayjs(value).toDate());
  const formatLongDate = (value: Dayjs) => longDateFormatter.format(dayjs(value).toDate());
  const formatShortWeekday = (value: Dayjs) => shortWeekdayFormatter.format(dayjs(value).toDate());

  // No schedule selected - show setup prompt
  if (!scheduleType) {
    return (
      <Card>
        <CardContent className="tw:text-center tw:py-6">
          <Icon icon={CalendarPlusIcon} className="tw:text-muted-foreground tw:mb-4 tw:size-10" />
          <p className="tw:text-muted-foreground tw:mb-4">{m.week_view_no_schedule()}</p>
        </CardContent>
      </Card>
    );
  }

  const scheduleConfig = getScheduleConfig(scheduleType);
  const teamCount = scheduleConfig.shiftConfig.teamCount;
  const hasTeams = teamCount > 1;
  // Validate and sanitize myTeam prop
  let myTeam = inputMyTeam;
  if (typeof myTeam === "number" && (myTeam < 1 || myTeam > teamCount)) {
    logger.warn(`Invalid team number: ${myTeam}. Expected 1-${teamCount}`);
    myTeam = null;
  }
  const isMyTeam = (teamNumber: number) => {
    return myTeam === teamNumber ? "tw:ring-2 tw:ring-primary" : "";
  };

  return (
    <Card>
      <CardHeader>
        <div className="tw:flex tw:flex-col tw:sm:flex-row tw:justify-between tw:items-stretch tw:sm:items-center tw:gap-2 tw:mb-2">
          <span className="tw:font-semibold">
            <Icon icon={hasTeams ? UsersIcon : CalendarIcon} className="tw:mr-2" />
            {hasTeams ? m.week_view_all_teams() : m.week_view_schedule_label()}
          </span>
          <WeekNavigationButtonGroup
            isCurrent={isCurrentWeek}
            onPrevious={handlePrevious}
            onCurrent={handleCurrent}
            onNext={handleNext}
            selectorLabel={m.tt_jump_to_date()}
            selectorValue={currentDate.format("YYYY-MM-DD")}
            onSelectorChange={handleDateChange}
          />
        </div>
        <div className="tw:flex tw:flex-col tw:md:flex-row tw:justify-between tw:items-start tw:md:items-center tw:gap-2">
          <div className="tw:text-muted-foreground tw:text-sm">
            {m.week_label({ week: String(selectedWeekNumber), year: String(selectedWeekYear) })}
            {isCurrentWeek && (
              <Badge variant="success" className="tw:ml-2" aria-label={m.this_week()}>
                {m.this_week()}
              </Badge>
            )}
          </div>
          <div className="tw:text-sm tw:text-muted-foreground tw:hidden tw:lg:block">
            <Icon icon={KeyboardIcon} className="tw:mr-1" />
            {m.week_view_keyboard_hint()}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {myTeam && hasTeams && (
          <div className="tw:mb-4">
            <strong>
              <Icon icon={UsersIcon} className="tw:mr-1" />
              {m.week_view_team_schedule_heading({ team: String(myTeam) })}
            </strong>
            <div className="tw:text-muted-foreground tw:text-sm">
              {m.week_number({ week: String(selectedWeekNumber) })}
            </div>
          </div>
        )}

        {!hasTeams && (
          <div className="tw:mb-4">
            <strong>
              <Icon icon={CalendarIcon} className="tw:mr-1" />
              {m.week_view_your_schedule_heading()}
            </strong>
            <div className="tw:text-muted-foreground tw:text-sm">
              {m.week_number({ week: String(selectedWeekNumber) })}
            </div>
          </div>
        )}

        <div className="tw:overflow-x-auto">
          <Table
            className="tw:[&_th]:text-center tw:[&_td]:text-center tw:[&_th]:p-2 tw:[&_td]:p-2 tw:[&_td]:align-middle "
            aria-label={m.week_view_table_aria({
              startDate: formatShortDate(startOfWeek),
              endDate: formatShortDate(startOfWeek.add(6, "day")),
            })}
          >
            <TableHeader>
              <TableRow>
                <TableHead className="tw:bg-muted tw:font-semibold">
                  {hasTeams ? m.week_view_team_header() : m.week_view_schedule_label()}
                </TableHead>
                {weekDays.map((day, dayIndex) => {
                  const isToday = day.isSame(today, "day");
                  return (
                    <TableHead
                      key={`day-header-${dayIndex}-${day.format("YYYY-MM-DD")}`}
                      className={clsx("tw:text-center", isToday && "tw:bg-primary/10")}
                      aria-label={m.week_view_day_header_aria({
                        date: formatLongDate(day),
                        today: isToday ? m.daycell_today_label() : "",
                      })}
                    >
                      <div className="tw:font-semibold">{formatShortWeekday(day)}</div>
                      <div className="tw:text-sm tw:text-muted-foreground">
                        <Hint
                          placement="bottom"
                          content={
                            <div id={`date-tooltip-${day.format("YYYY-MM-DD")}`}>
                              <strong>{m.week_view_date_code({ code: formatYYWWD(day) })}</strong>
                              <br />
                              {m.week_view_date_code_format()}
                              <br />
                              {m.week_view_iso_year({ year: getISOWeekYear2Digit(day) })}
                              <br />
                              {m.week_view_iso_week({ week: String(day.isoWeek()) })}
                              <br />
                              {m.week_view_iso_day({
                                day: String(day.isoWeekday()),
                                weekday: formatShortWeekday(day),
                              })}
                            </div>
                          }
                        >
                          <span className="help-underline">{formatYYWWD(day)}</span>
                        </Hint>
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: teamCount }, (_, i) => i + 1).map((teamNumber) => (
                <TableRow
                  key={teamNumber}
                  className={isMyTeam(teamNumber)}
                  aria-label={
                    hasTeams
                      ? m.week_view_team_row_aria({
                          team: String(teamNumber),
                          yourTeam: myTeam === teamNumber ? m.week_view_your_team_suffix() : "",
                        })
                      : m.week_view_schedule_label()
                  }
                >
                  <TableCell className="tw:bg-muted tw:font-semibold">
                    <strong>
                      {hasTeams
                        ? m.team_label({ team: String(teamNumber) })
                        : m.week_view_schedule_label()}
                    </strong>
                  </TableCell>
                  {weekDays.map((day, dayIndex) => {
                    const shift = calculateShift(day, teamNumber, scheduleType);
                    const isToday = day.isSame(today, "day");

                    return (
                      <TableCell
                        key={`team-${teamNumber}-day-${dayIndex}-${day.format("YYYY-MM-DD")}`}
                        className={clsx("tw:text-center", isToday && "tw:bg-primary/10")}
                        aria-label={
                          hasTeams
                            ? m.week_view_team_day_shift_aria({
                                team: String(teamNumber),
                                day: formatLongDate(day),
                                shift: shift.isWorking ? shift.name : m.schedule_off(),
                              })
                            : m.week_view_schedule_day_shift_aria({
                                day: formatLongDate(day),
                                shift: shift.isWorking ? shift.name : m.schedule_off(),
                              })
                        }
                      >
                        {shift.isWorking && <ShiftBadge shift={shift} />}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
