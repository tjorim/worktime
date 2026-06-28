import { createContext, useContext, type ReactNode } from "react";
import type {
  GanttViewKey,
  GanttViewMode,
  LastUsed,
  ScheduleViewKey,
  TabKey,
  TimeOffViewKey,
  TimeTrackingViewKey,
} from "@/contexts/SettingsContext";
import type { ScheduleOption } from "@/data/rosters";

export interface LastUsedContextType {
  lastUsed: LastUsed;
  updateLastActiveTab: (tab: TabKey) => void;
  updateLastScheduleView: (view: ScheduleViewKey) => void;
  updateLastTimeOffView: (view: TimeOffViewKey) => void;
  updateLastTimeTrackingView: (view: TimeTrackingViewKey) => void;
  updateLastOtherSchedule: (schedule: ScheduleOption | null) => void;
  updateLastOtherTeam: (team: number | null) => void;
  updateLastGanttViewMode: (mode: GanttViewMode) => void;
  updateLastGanttView: (view: GanttViewKey) => void;
}

const LastUsedContext = createContext<LastUsedContextType | undefined>(undefined);

interface LastUsedProviderProps {
  children: ReactNode;
  value: LastUsedContextType;
}

export function LastUsedProvider({ children, value }: LastUsedProviderProps) {
  return <LastUsedContext.Provider value={value}>{children}</LastUsedContext.Provider>;
}

export function useLastUsed(): LastUsedContextType {
  const context = useContext(LastUsedContext);
  if (context === undefined) {
    throw new Error("useLastUsed must be used within a LastUsedProvider");
  }
  return context;
}
