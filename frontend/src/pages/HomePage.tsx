import { CurrentStatus } from "@/components/CurrentStatus";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MainTabs } from "@/components/MainTabs";
import { useAppShellContext } from "@/contexts/AppShellContext";

// The status card is central to Calendar and Schedule on larger screens. On
// mobile it starts compact everywhere so the selected tab remains in reach.
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

  const statusVariant = FULL_STATUS_TABS.has(activeTab) ? "responsive" : "compact";

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
