import type { Dayjs } from "dayjs";
import { useMemo, useState } from "react";
import { useSettings } from "../contexts/SettingsContext";
import { dayjs } from "../utils/dateTimeUtils";
import {
  calculateShift,
  getAllTeamsShifts,
  getCurrentShiftDay,
  getNextShift,
  getShiftCode,
  type UpcomingShiftResult,
  type ShiftResult,
} from "../utils/shiftCalculations";

export interface UseShiftCalculationReturn {
  myTeam: number | null; // The user's team from onboarding
  setMyTeam: (team: number | null) => void;
  currentDate: Dayjs;
  setCurrentDate: (date: Dayjs) => void;
  currentShift: ShiftResult | null;
  nextShift: UpcomingShiftResult | null;
  todayShifts: ShiftResult[];
  currentShiftDay: Dayjs;
}

/**
 * Provide shift-related state and memoized calculations for the current user team.
 *
 * The hook exposes a team identifier and date state and computes the current shift,
 * the next upcoming shift for the team, all teams' shifts for the selected date,
 * and the canonical shift day (accounts for pre-07:00 night-shift handling). Computed
 * values update when `currentDate` or the user's team change.
 *
 * @returns An object exposing `myTeam`, `setMyTeam`, `currentDate`, `setCurrentDate`, `currentShift`, `nextShift`, `todayShifts` and `currentShiftDay`
 *
 * @example
 * // In a React component
 * function MyShiftView() {
 *   const { myTeam, currentShift, nextShift, todayShifts } = useShiftCalculation();
 *
 *   if (!myTeam) {
 *     return <div>Please select your team</div>;
 *   }
 *
 *   return (
 *     <div>
 *       <h2>Team {myTeam}</h2>
 *       <p>Current: {currentShift?.shift.name} ({currentShift?.code})</p>
 *       <p>Next: {nextShift?.shift.name} on {nextShift?.date.format('MMM D')}</p>
 *       <h3>All Teams Today:</h3>
 *       {todayShifts.map(s => <div key={s.teamNumber}>T{s.teamNumber}: {s.shift.name}</div>)}
 *     </div>
 *   );
 * }
 */
export function useShiftCalculation(): UseShiftCalculationReturn {
  // Use unified user state from SettingsContext
  const { myTeam, setMyTeam, scheduleOption } = useSettings();

  // Current date for calculations
  const [currentDate, setCurrentDate] = useState<Dayjs>(dayjs());

  // Calculate current shift for user's team
  const currentShift = useMemo((): ShiftResult | null => {
    if (!myTeam) return null;

    const shiftDay = getCurrentShiftDay(currentDate);
    const shift = calculateShift(shiftDay, myTeam, scheduleOption ?? undefined);

    return {
      date: shiftDay,
      shift,
      code: getShiftCode(currentDate, myTeam, scheduleOption ?? undefined),
      teamNumber: myTeam,
    };
  }, [myTeam, currentDate, scheduleOption]);

  // Calculate next shift for user's team
  const nextShift = useMemo((): UpcomingShiftResult | null => {
    if (!myTeam) return null;

    return getNextShift(currentDate, myTeam, scheduleOption ?? undefined);
  }, [myTeam, currentDate, scheduleOption]);

  // Get all teams' shifts for current date
  const todayShifts = useMemo((): ShiftResult[] => {
    return getAllTeamsShifts(currentDate, scheduleOption ?? undefined);
  }, [currentDate, scheduleOption]);

  // Calculate current shift day (handles pre-7AM night shift logic)
  const currentShiftDay = useMemo((): Dayjs => {
    return getCurrentShiftDay(currentDate);
  }, [currentDate]);

  return {
    myTeam,
    setMyTeam,
    currentDate,
    setCurrentDate,
    currentShift,
    nextShift,
    todayShifts,
    currentShiftDay,
  };
}
