import type { ScheduleOption } from "@/lib/schedule/rosters";
import type { GanttViewMode } from "@/types/gantt";

export type Theme = "light" | "dark" | "auto";
export type TabKey =
  | "calendar"
  | "unified-calendar"
  | "schedule"
  | "timeoff"
  | "timetracking"
  | "gantt";
export type ScheduleViewKey = "schedule" | "transfer";
export type TimeOffViewKey = "table" | "stats" | "team";
export type TimeTrackingViewKey = "daily" | "weekly";
export type GanttViewKey = "chart" | "table";

export interface LastUsed {
  activeTab: TabKey;
  scheduleView: ScheduleViewKey;
  otherSchedule: ScheduleOption | null;
  timeOffView: TimeOffViewKey;
  timeTrackingView: TimeTrackingViewKey;
  otherTeam: number | null;
  ganttViewMode: GanttViewMode;
  ganttView: GanttViewKey;
}
