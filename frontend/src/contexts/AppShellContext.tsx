import type { Dayjs } from "dayjs";
import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import type { TabKey } from "@/contexts/SettingsContext";

export interface FeatureAnnouncement {
  name: string;
  detail: string;
}

export interface AppShellContextType {
  featureAnnouncements: FeatureAnnouncement[];
  dismissFeatureAnnouncements: () => void;
  showAbout: boolean;
  openAbout: () => void;
  closeAbout: () => void;
  myTeam: number | null;
  currentDate: Dayjs;
  setCurrentDate: (date: Dayjs) => void;
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  onChangeSchedule: () => void;
  onChangeTeam: () => void;
}

const AppShellContext = createContext<AppShellContextType | null>(null);

interface AppShellProviderProps {
  value: AppShellContextType;
  children: ReactNode;
}

export function AppShellProvider({ value, children }: AppShellProviderProps) {
  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useAppShellContext(): AppShellContextType {
  const context = useContext(AppShellContext);
  if (!context) {
    throw new Error("useAppShellContext must be used within an AppShellProvider");
  }
  return context;
}
