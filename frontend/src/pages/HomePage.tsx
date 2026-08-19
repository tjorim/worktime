import { CurrentStatus } from "@/components/CurrentStatus";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MainTabs } from "@/components/MainTabs";
import { useAppShellContext } from "@/contexts/AppShellContext";

// The status card is only central to the Calendar and Schedule tabs — everywhere
// else it collapses to a single-line strip so tab content is visible without
// scrolling (see #1126).
const FULL_STATUS_TABS = new Set(["calendar", "unified-calendar", "schedule"]);

export function HomePage() {
  const {
    myTeam,
    currentDate,
    setCurrentDate,
    activeTab,
    onTabChange,
    onChangeSchedule,
    onChangeTeam,
    pendingTaskEditId,
    requestTaskEdit,
    clearPendingTaskEdit,
  } = useAppShellContext();

  const statusVariant = FULL_STATUS_TABS.has(activeTab) ? "full" : "compact";

  return (
    <main id="main-content">
      <ErrorBoundary>
        <CurrentStatus
          myTeam={myTeam}
          onChangeTeam={onChangeTeam}
          onChangeSchedule={onChangeSchedule}
          variant={statusVariant}
        />
      </ErrorBoundary>
      <ErrorBoundary>
        <MainTabs
          myTeam={myTeam}
          currentDate={currentDate}
          setCurrentDate={setCurrentDate}
          activeTab={activeTab}
          onTabChange={onTabChange}
          onChangeSchedule={onChangeSchedule}
          onChangeTeam={onChangeTeam}
          pendingTaskEditId={pendingTaskEditId}
          onRequestTaskEdit={requestTaskEdit}
          onClearPendingTaskEdit={clearPendingTaskEdit}
        />
      </ErrorBoundary>
    </main>
  );
}
