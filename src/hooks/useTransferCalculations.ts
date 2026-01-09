import type { Dayjs } from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useSettings } from "../contexts/SettingsContext";
import { dayjs } from "../utils/dateTimeUtils";
import { getTeamCountForOption } from "../utils/scheduleUtils";
import { calculateShift, type ShiftType } from "../utils/shiftCalculations";

export type TransferType = "handover" | "takeover";

export interface TransferInfo {
  date: Dayjs;
  fromTeam: number;
  toTeam: number;
  fromShiftType: ShiftType;
  toShiftType: ShiftType;
  type: TransferType; // 'handover' = my team transfers to other team, 'takeover' = other team transfers to my team
}

interface UseTransferCalculationsProps {
  myTeam: number | null; // The user's team from onboarding
  limit?: number;
  customStartDate?: string;
  customEndDate?: string;
}

interface UseTransferCalculationsReturn {
  transfers: TransferInfo[];
  hasMoreTransfers: boolean;
  availableOtherTeams: number[]; // Teams available to compare with (excludes user's team)
  otherTeam: number; // Currently selected other team
  setOtherTeam: (team: number) => void;
}

/**
 * Create a TransferInfo when the current and next shift codes match the specified transition.
 *
 * @param currentShift - The shift on the current date
 * @param nextShift - The shift on the next date
 * @param fromShift - Expected code of the originating shift
 * @param toShift - Expected code of the destination shift
 * @param date - The date to assign to the transfer
 * @param fromTeam - Team number initiating the transfer
 * @param toTeam - Team number receiving the transfer
 * @param type - Either `'handover'` or `'takeover'`
 * @returns A TransferInfo describing the transfer if `currentShift.code === fromShift` and `nextShift.code === toShift`, `null` otherwise
 */
function checkTransfer(
  currentShift: { code: ShiftType; name: string },
  nextShift: { code: ShiftType; name: string },
  fromShift: ShiftType,
  toShift: ShiftType,
  date: Dayjs,
  fromTeam: number,
  toTeam: number,
  type: TransferType,
): TransferInfo | null {
  if (currentShift.code === fromShift && nextShift.code === toShift) {
    return {
      date,
      fromTeam,
      toTeam,
      fromShiftType: currentShift.code,
      toShiftType: nextShift.code,
      type,
    };
  }
  return null;
}

/**
 * Compute transfer events (handovers and takeovers) between the user's team and a selected other team over a date window.
 *
 * Scans day-by-day from a start date (default today) up to an end date (optional) or a default forward window, detects shift transitions that represent handovers or takeovers, and returns sorted transfer entries up to the specified limit.
 *
 * @param myTeam - The user's team id; when `null` no transfers are calculated
 * @param limit - Maximum number of transfers to return (default: 20)
 * @param customStartDate - Optional start date string parseable by dayjs; defaults to today when omitted
 * @param customEndDate - Optional end date string parseable by dayjs; when provided the scan is constrained to this inclusive end date
 * @returns An object containing:
 *  - `transfers`: an array of transfer records sorted by date (each record contains `date`, `fromTeam`, `toTeam`, `fromShiftType`, `toShiftType`, and `type`)
 *  - `hasMoreTransfers`: `true` if there are likely additional transfers beyond the returned set, `false` otherwise
 *  - `availableOtherTeams`: list of team ids available for comparison (excludes `myTeam`)
 *  - `otherTeam`: the currently selected comparison team id
 *  - `setOtherTeam`: setter function to change the selected comparison team
 *
 * @example
 * // In a React component - show handover/takeover points between teams
 * function TransferView({ myTeam }) {
 *   const { transfers, otherTeam, setOtherTeam, availableOtherTeams, hasMoreTransfers } =
 *     useTransferCalculations({ myTeam, limit: 10 });
 *
 *   return (
 *     <div>
 *       <select value={otherTeam} onChange={(e) => setOtherTeam(Number(e.target.value))}>
 *         {availableOtherTeams.map(t => <option key={t} value={t}>Team {t}</option>)}
 *       </select>
 *
 *       <h3>Transfers between Team {myTeam} and Team {otherTeam}</h3>
 *       {transfers.map(t => (
 *         <div key={t.date.format()}>
 *           {t.date.format('MMM D')}: {t.type === 'handover' ? '→' : '←'}
 *           {' '}T{t.fromTeam} ({t.fromShiftType}) to T{t.toTeam} ({t.toShiftType})
 *         </div>
 *       ))}
 *       {hasMoreTransfers && <p>More transfers available...</p>}
 *     </div>
 *   );
 * }
 */
export function useTransferCalculations({
  myTeam,
  limit = 20,
  customStartDate,
  customEndDate,
}: UseTransferCalculationsProps): UseTransferCalculationsReturn {
  const { scheduleOption } = useSettings();
  const teamCount = getTeamCountForOption(scheduleOption);

  // Validate myTeam is within valid range
  const validatedMyTeam = useMemo(() => {
    if (myTeam === null) return null;
    if (myTeam < 1 || myTeam > teamCount) {
      console.warn(`Invalid team number ${myTeam} (expected 1-${teamCount}). Treating as null.`);
      return null;
    }
    return myTeam;
  }, [myTeam, teamCount]);

  // Get available other teams (excludes user's team)
  const availableOtherTeams = useMemo(() => {
    const allTeams = Array.from({ length: teamCount }, (_, i) => i + 1);
    return allTeams.filter((team) => team !== validatedMyTeam);
  }, [validatedMyTeam, teamCount]);

  // State for selected other team to compare with
  const [otherTeam, setOtherTeam] = useState<number>(availableOtherTeams[0] || 1);

  // Update other team when user's team changes and current other team is not available
  useEffect(() => {
    if (!availableOtherTeams.includes(otherTeam)) {
      setOtherTeam(availableOtherTeams[0] || 1);
    }
  }, [availableOtherTeams, otherTeam]);

  // Calculate transfers based on current parameters
  const transfersResult = useMemo(() => {
    if (!validatedMyTeam) return { transfers: [], hasMoreTransfers: false };

    const foundTransfers: TransferInfo[] = [];

    // Determine date range
    const startDate = customStartDate ? dayjs(customStartDate) : dayjs();
    const endDate = customEndDate ? dayjs(customEndDate) : null;

    // If we have a date range, scan within it; otherwise scan forward from today
    const maxDaysToScan = endDate ? endDate.diff(startDate, "day") + 1 : 365; // Default to scanning 1 year forward

    // Add performance warning for large date ranges
    if (endDate && endDate.diff(startDate, "day") > 365) {
      console.warn(
        "Large date range detected. Consider limiting the range for better performance.",
      );
    }

    let lastScannedDate = startDate;

    for (let day = 0; day < maxDaysToScan && foundTransfers.length < limit; day++) {
      const scanDate = startDate.add(day, "day");
      const nextDate = scanDate.add(1, "day");

      // If we have an end date, don't scan beyond it
      if (endDate && scanDate.isAfter(endDate)) {
        break;
      }

      const myTeamShift = calculateShift(scanDate, validatedMyTeam, scheduleOption);
      const otherTeamShift = calculateShift(scanDate, otherTeam, scheduleOption);
      const myTeamNextShift = calculateShift(nextDate, validatedMyTeam, scheduleOption);
      const otherTeamNextShift = calculateShift(nextDate, otherTeam, scheduleOption);

      // Check for transfer patterns
      const transfers = [
        // Handovers: My team transfers to other team (same day)
        checkTransfer(
          myTeamShift,
          otherTeamShift,
          "M",
          "L",
          scanDate,
          validatedMyTeam,
          otherTeam,
          "handover",
        ),
        checkTransfer(
          myTeamShift,
          otherTeamShift,
          "L",
          "N",
          scanDate,
          validatedMyTeam,
          otherTeam,
          "handover",
        ),

        // Handover: My team night shift to other team morning shift (next day)
        !endDate || !nextDate.isAfter(endDate)
          ? checkTransfer(
              myTeamShift,
              otherTeamNextShift,
              "N",
              "M",
              nextDate,
              validatedMyTeam,
              otherTeam,
              "handover",
            )
          : null,

        // Takeovers: Other team transfers to my team (same day)
        checkTransfer(
          otherTeamShift,
          myTeamShift,
          "M",
          "L",
          scanDate,
          otherTeam,
          validatedMyTeam,
          "takeover",
        ),
        checkTransfer(
          otherTeamShift,
          myTeamShift,
          "L",
          "N",
          scanDate,
          otherTeam,
          validatedMyTeam,
          "takeover",
        ),

        // Takeover: Other team night shift to my team morning shift (next day)
        !endDate || !nextDate.isAfter(endDate)
          ? checkTransfer(
              otherTeamShift,
              myTeamNextShift,
              "N",
              "M",
              nextDate,
              otherTeam,
              validatedMyTeam,
              "takeover",
            )
          : null,
      ];

      // Add valid transfers
      transfers.forEach((transfer) => {
        if (transfer) {
          foundTransfers.push(transfer);
        }
      });

      lastScannedDate = scanDate;
    }

    // Sort transfers by date
    foundTransfers.sort((a, b) => a.date.valueOf() - b.date.valueOf());

    // Check if there are more transfers available
    const hasMoreTransfers =
      foundTransfers.length === limit && (!endDate || lastScannedDate.isBefore(endDate));

    return {
      transfers: foundTransfers,
      hasMoreTransfers,
    };
  }, [validatedMyTeam, otherTeam, limit, customStartDate, customEndDate, scheduleOption]);

  return {
    transfers: transfersResult.transfers,
    hasMoreTransfers: transfersResult.hasMoreTransfers,
    availableOtherTeams,
    otherTeam,
    setOtherTeam,
  };
}
