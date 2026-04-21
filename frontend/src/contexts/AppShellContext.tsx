import type { Dayjs } from "dayjs";
import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import type { WizardCompletionPayload } from "@/components/WelcomeWizard";
import type { WizardStep } from "@/components/wizardStepConfig";
import type { ScheduleOption } from "@/data/rosters";
import type { TabKey } from "@/contexts/SettingsContext";
import type { ConflictChoice } from "@/hooks/useFirstSyncFlow";

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
  // WelcomeWizard state — lifted here so AppLayout can render the wizard outside the route outlet
  showTeamModal: boolean;
  teamModalMode: "onboarding" | "change-team" | "change-schedule";
  teamWizardStartStep: WizardStep;
  onTeamSelect: (team: number) => void;
  onScheduleSelect: (schedule: ScheduleOption) => void;
  onSkipTeamWizard: () => void;
  onHideTeamModal: (payload?: WizardCompletionPayload) => void;
  onDeferTeamWizard: () => void;
  // First-sync conflict dialog state
  syncConflictShow: boolean;
  onResolveSyncConflict: (choice: ConflictChoice) => void;
  onDismissSyncConflict: () => void;
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
