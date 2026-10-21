import { Outlet } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { AboutModal } from "@/components/AboutModal";
import { FeatureIntroAlert } from "@/components/FeatureIntroAlert";
import { FirstSyncConflictDialog } from "@/components/FirstSyncConflictDialog";
import { Header } from "@/components/Header";
import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";
import { OngoingConflictDialog } from "@/components/sync/OngoingConflictDialog";
import { useAppShellContext } from "@/contexts/AppShellContext";
import { useOngoingSyncContext } from "@/contexts/OngoingSyncContext";
import { useSettings } from "@/contexts/SettingsContext";

// Shown on first run and from the settings only: its steps (country, team and
// schedule pickers) load when it first opens, not on every page load.
const WelcomeWizard = lazy(() =>
  import("@/components/WelcomeWizard").then((module) => ({ default: module.WelcomeWizard })),
);

/**
 * Root layout for all app routes.
 *
 * Renders the application chrome (header, modals, dialogs) around the
 * routed page content. Authentication redirects are handled by the OIDC
 * provider; there is no inline auth UI route intercept.
 */
export function AppLayout() {
  const shell = useAppShellContext();
  const { settings } = useSettings();
  const { conflictCount, conflictedPayload, resolveOngoingConflicts } = useOngoingSyncContext();
  // Kept mounted once opened so closing keeps the dialog's exit animation.
  const [wizardOpened, setWizardOpened] = useState(shell.showTeamModal);
  if (shell.showTeamModal && !wizardOpened) setWizardOpened(true);

  return (
    <div className="min-h-screen pt-header">
      <div className="px-2 md:px-3">
        <Header />
        {shell.featureAnnouncements.length > 0 && (
          <FeatureIntroAlert
            features={shell.featureAnnouncements}
            onDismiss={shell.dismissFeatureAnnouncements}
          />
        )}
        <Outlet />
        <AboutModal show={shell.showAbout} onHide={shell.closeAbout} />
        <KeyboardShortcutsModal
          show={shell.showShortcuts}
          onHide={shell.closeShortcuts}
          enableTimeOff={settings.enableTimeOff}
          enableTimeTracking={settings.enableTimeTracking}
          enableGantt={settings.enableGantt}
        />
        {wizardOpened && (
          <Suspense fallback={null}>
            <WelcomeWizard
              show={shell.showTeamModal}
              onTeamSelect={shell.onTeamSelect}
              onScheduleSelect={shell.onScheduleSelect}
              onSkip={shell.onSkipTeamWizard}
              onHide={shell.onHideTeamModal}
              onDefer={shell.onDeferTeamWizard}
              mode={shell.teamModalMode}
              startStep={shell.teamWizardStartStep}
            />
          </Suspense>
        )}
        <FirstSyncConflictDialog
          show={shell.syncConflictShow}
          counts={shell.syncConflictCounts}
          onResolve={shell.onResolveSyncConflict}
          onDismiss={shell.onDismissSyncConflict}
        />
        <OngoingConflictDialog
          show={conflictCount > 0}
          conflictCount={conflictCount}
          conflictedPayload={conflictedPayload}
          onResolve={resolveOngoingConflicts}
        />
      </div>
    </div>
  );
}
