import { useCallback } from "react";
import { UsersIcon } from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";
import { useToast } from "@/contexts/ToastContext";
import type { ScheduleOption } from "@/data/rosters";
import { getScheduleChangeTeamAction } from "@/utils/scheduleUtils";
import * as m from "@/paraglide/messages.js";

/**
 * Switch the schedule type, clearing the team when the new schedule cannot keep it.
 *
 * A cleared team is announced with an Undo that restores both the previous
 * schedule and team, so an accidental click on another schedule card never
 * loses the selection for good.
 */
export function useScheduleChange() {
  const { scheduleType, myTeam, setScheduleType, setMyTeam } = useSettings();
  const toast = useToast();

  return useCallback(
    (schedule: ScheduleOption) => {
      const previousSchedule = scheduleType;
      const previousTeam = myTeam;
      const teamAction = getScheduleChangeTeamAction(previousSchedule, schedule, previousTeam);
      if (teamAction !== "keep") setMyTeam(null);
      setScheduleType(schedule);
      if (teamAction === "keep") return;
      toast.showUndo(
        teamAction === "clear-and-prompt"
          ? m.schedule_team_reset_changed()
          : m.schedule_team_reset_no_teams(),
        () => {
          setScheduleType(previousSchedule);
          setMyTeam(previousTeam);
        },
        UsersIcon,
      );
    },
    [scheduleType, myTeam, setScheduleType, setMyTeam, toast],
  );
}
