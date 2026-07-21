import { CurrentStatus } from "@/components/CurrentStatus";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MainTabs } from "@/components/MainTabs";
import { useAppShellContext } from "@/contexts/AppShellContext";

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

  return (
    <main id="main-content">
      <ErrorBoundary>
        <CurrentStatus
          myTeam={myTeam}
          onChangeTeam={onChangeTeam}
          onChangeSchedule={onChangeSchedule}
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
