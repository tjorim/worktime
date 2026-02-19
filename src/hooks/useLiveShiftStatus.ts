import type { Dayjs } from "dayjs";
import { useMemo } from "react";
import type { ScheduleOption } from "../data/rosters";
import { useLiveTime } from "./useLiveTime";
import type { OffDayProgress, ShiftResult, UpcomingShiftResult } from "../utils/shiftCalculations";
import {
  calculateShift,
  getCurrentShiftDay,
  getNextShift,
  getOffDayProgress,
  getShiftCode,
  isCurrentlyWorking,
} from "../utils/shiftCalculations";

export interface LiveShiftStatus {
  today: Dayjs;
  shiftDay: Dayjs;
  currentShift: ShiftResult;
  nextShift: UpcomingShiftResult | null;
  offDayProgress: OffDayProgress | null;
}

export function useLiveShiftStatus(myTeam: number, scheduleType: ScheduleOption): LiveShiftStatus {
  const today = useLiveTime({ precision: "minute" });

  const shiftDay = useMemo(() => getCurrentShiftDay(today, scheduleType), [today, scheduleType]);

  const currentShift = useMemo((): ShiftResult => {
    const shiftDayShift = calculateShift(shiftDay, myTeam, scheduleType);
    const isInNightShiftExtension =
      shiftDayShift.isWorking && isCurrentlyWorking(shiftDayShift, shiftDay, today, scheduleType);

    if (isInNightShiftExtension) {
      return {
        date: shiftDay,
        shift: shiftDayShift,
        code: getShiftCode(shiftDay, myTeam, scheduleType),
        teamNumber: myTeam,
      };
    }

    const shift = calculateShift(today, myTeam, scheduleType);
    return {
      date: today,
      shift,
      code: getShiftCode(today, myTeam, scheduleType),
      teamNumber: myTeam,
    };
  }, [myTeam, scheduleType, shiftDay, today]);

  const nextShift = useMemo((): UpcomingShiftResult | null => {
    return getNextShift(shiftDay, myTeam, scheduleType);
  }, [myTeam, scheduleType, shiftDay]);

  const offDayProgress = useMemo((): OffDayProgress | null => {
    return getOffDayProgress(today, myTeam, scheduleType);
  }, [myTeam, scheduleType, today]);

  return useMemo(
    () => ({
      today,
      shiftDay,
      currentShift,
      nextShift,
      offDayProgress,
    }),
    [today, shiftDay, currentShift, nextShift, offDayProgress],
  );
}
