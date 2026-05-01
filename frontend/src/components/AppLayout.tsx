import Container from "react-bootstrap/Container";
import { Outlet } from "@tanstack/react-router";
import { AboutModal } from "@/components/AboutModal";
import { FeatureIntroAlert } from "@/components/FeatureIntroAlert";
import { FirstSyncConflictDialog } from "@/components/FirstSyncConflictDialog";
import { Header } from "@/components/Header";
import { WelcomeWizard } from "@/components/WelcomeWizard";
import { OngoingConflictDialog } from "@/components/sync/OngoingConflictDialog";
import { useAppShellContext } from "@/contexts/AppShellContext";
import { useOngoingSyncContext } from "@/contexts/OngoingSyncContext";

/**
 * Root layout for all app routes.
 *
 * Renders the application chrome (header, modals, dialogs) around the
 * routed page content. Authentication redirects are handled by the OIDC
 * provider; there is no inline auth UI route intercept.
 */
export function AppLayout() {
  const shell = useAppShellContext();
  const { conflictCount, conflictedPayload, resolveOngoingConflicts } = useOngoingSyncContext();

  return (
    <div className="min-vh-100">
      <Container fluid>
        <Header />
        {shell.featureAnnouncements.length > 0 && (
          <FeatureIntroAlert
            features={shell.featureAnnouncements}
            onDismiss={shell.dismissFeatureAnnouncements}
          />
        )}
        <Outlet />
        <AboutModal show={shell.showAbout} onHide={shell.closeAbout} />
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
        <FirstSyncConflictDialog
          show={shell.syncConflictShow}
          onResolve={shell.onResolveSyncConflict}
          onDismiss={shell.onDismissSyncConflict}
        />
        <OngoingConflictDialog
          show={conflictCount > 0}
          conflictCount={conflictCount}
          conflictedPayload={conflictedPayload}
          onResolve={resolveOngoingConflicts}
        />
      </Container>
    </div>
  );
}
