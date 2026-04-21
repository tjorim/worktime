import Container from "react-bootstrap/Container";
import { Outlet } from "@tanstack/react-router";
import { canHandleRoute, getRoutingComponent } from "supertokens-auth-react/ui";
import { EmailPasswordPreBuiltUI } from "supertokens-auth-react/recipe/emailpassword/prebuiltui";
import { AboutModal } from "@/components/AboutModal";
import { FeatureIntroAlert } from "@/components/FeatureIntroAlert";
import { FirstSyncConflictDialog } from "@/components/FirstSyncConflictDialog";
import { Header } from "@/components/Header";
import { WelcomeWizard } from "@/components/WelcomeWizard";
import { OngoingConflictDialog } from "@/components/sync/OngoingConflictDialog";
import { useAppShellContext } from "@/contexts/AppShellContext";
import { useOngoingSyncContext } from "@/contexts/OngoingSyncContext";

const AUTH_PREBUILT_UI_LIST = [EmailPasswordPreBuiltUI];

/**
 * Root layout for all app routes.
 *
 * Also intercepts SuperTokens auth paths (e.g. /auth) and renders the
 * pre-built auth UI without app chrome, removing the need for a separate
 * canHandleRoute check at the App level.
 */
export function AppLayout() {
  // canHandleRoute is a plain function (not a hook) — safe to call before hooks.
  const isAuthRoute = canHandleRoute(AUTH_PREBUILT_UI_LIST);

  // Hooks must always be called unconditionally, even when isAuthRoute is true.
  // AppShellProvider and OngoingSyncProvider are mounted above this component
  // so both contexts are always available.
  const shell = useAppShellContext();
  const { conflictCount, conflictedPayload, resolveOngoingConflicts } = useOngoingSyncContext();

  if (isAuthRoute) {
    return <>{getRoutingComponent(AUTH_PREBUILT_UI_LIST)}</>;
  }

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
