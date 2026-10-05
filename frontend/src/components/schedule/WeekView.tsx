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
        <CardContent className="text-center py-6">
          <Icon icon={CalendarPlusIcon} className="text-muted-foreground mb-4 size-10" />
          <p className="text-muted-foreground mb-4">{m.week_view_no_schedule()}</p>
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
    return myTeam === teamNumber ? "ring-2 ring-primary" : "";
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 mb-2">
          <span className="font-semibold">
            <Icon icon={hasTeams ? UsersIcon : CalendarIcon} className="mr-2" />
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
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
          <div className="text-muted-foreground text-sm">
            {m.week_label({ week: String(selectedWeekNumber), year: String(selectedWeekYear) })}
            {isCurrentWeek && (
              <Badge variant="success" className="ml-2" aria-label={m.this_week()}>
                {m.this_week()}
              </Badge>
            )}
          </div>
          <div className="text-sm text-muted-foreground hidden lg:block">
            <Icon icon={KeyboardIcon} className="mr-1" />
            {m.week_view_keyboard_hint()}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {myTeam && hasTeams && (
          <div className="mb-4">
            <strong>
              <Icon icon={UsersIcon} className="mr-1" />
              {m.week_view_team_schedule_heading({ team: String(myTeam) })}
            </strong>
            <div className="text-muted-foreground text-sm">
              {m.week_number({ week: String(selectedWeekNumber) })}
            </div>
          </div>
        )}

        {!hasTeams && (
          <div className="mb-4">
            <strong>
              <Icon icon={CalendarIcon} className="mr-1" />
              {m.week_view_your_schedule_heading()}
            </strong>
            <div className="text-muted-foreground text-sm">
              {m.week_number({ week: String(selectedWeekNumber) })}
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <Table
            className="[&_th]:text-center [&_td]:text-center [&_th]:p-2 [&_td]:p-2 [&_td]:align-middle "
            aria-label={m.week_view_table_aria({
              startDate: formatShortDate(startOfWeek),
              endDate: formatShortDate(startOfWeek.add(6, "day")),
            })}
          >
            <TableHeader>
              <TableRow>
                <TableHead className="bg-muted font-semibold">
                  {hasTeams ? m.week_view_team_header() : m.week_view_schedule_label()}
                </TableHead>
                {weekDays.map((day, dayIndex) => {
                  const isToday = day.isSame(today, "day");
                  return (
                    <TableHead
                      key={`day-header-${dayIndex}-${day.format("YYYY-MM-DD")}`}
                      className={clsx("text-center", isToday && "bg-primary/10")}
                      aria-label={m.week_view_day_header_aria({
                        date: formatLongDate(day),
                        today: isToday ? m.daycell_today_label() : "",
                      })}
                    >
                      <div className="font-semibold">{formatShortWeekday(day)}</div>
                      <div className="text-sm text-muted-foreground">
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
                          <span className="cursor-help underline decoration-dotted">
                            {formatYYWWD(day)}
                          </span>
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
                  <TableCell className="bg-muted font-semibold">
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
                        className={clsx("text-center", isToday && "bg-primary/10")}
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
