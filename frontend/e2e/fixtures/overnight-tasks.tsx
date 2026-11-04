import { createRoot } from "react-dom/client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { EventStoreProvider } from "@/contexts/EventStoreContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { TimeTrackingDailyView } from "@/features/timeTracking/TimeTrackingDailyView";
import { TimeTrackingWeeklyView } from "@/features/timeTracking/TimeTrackingWeeklyView";
import type { StoredTimeTrackingTask } from "@/lib/timeTracking/types";
import { setLocale } from "@/paraglide/runtime.js";
import "@/styles/tailwind.css";
const params = new URLSearchParams(location.search);
setLocale("en", { reload: false });
const labels = [{ id: "work", name: "Work", color: "#198754" }];
function Fixture() {
  const [tasks, setTasks] = useState<StoredTimeTrackingTask[]>(
    params.has("timer")
      ? [{ id: "running", text: "Night shift", label: "work", startTime: "2026-01-04T23:00" }]
      : [],
  );
  const [date, setDate] = useState("2026-01-04");
  return (
    <main className="p-4">
      <TimeTrackingDailyView
        tasks={tasks}
        labels={labels}
        templates={[
          { id: "night", text: "Night shift", label: "work", start: "23:00", stop: "06:30" },
        ]}
        selectedDate={date}
        onSelectedDateChange={setDate}
        onAddTask={async (task) => {
          setTasks((previous) => [...previous, task]);
          return true;
        }}
        onUpdateLabels={() => {}}
        onUpdateTaskTimes={(update) =>
          setTasks((previous) =>
            previous.map((task) =>
              task.id === update.id
                ? { ...task, startTime: update.newStartTime, stopTime: update.newStopTime }
                : task,
            ),
          )
        }
        onRemoveTask={(id) => setTasks((previous) => previous.filter((task) => task.id !== id))}
        onToggleBreak={() => {}}
      />
      <TimeTrackingWeeklyView
        tasks={tasks}
        labels={labels}
        selectedDate={date}
        onSelectedDateChange={setDate}
      />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <SettingsProvider>
      <EventStoreProvider>
        <ToastProvider>
          <Fixture />
        </ToastProvider>
      </EventStoreProvider>
    </SettingsProvider>
  </QueryClientProvider>,
);
// Mirror App's resolved theme after SettingsProvider's mount effect.
queueMicrotask(() =>
  document.documentElement.setAttribute("data-theme", params.get("theme") ?? "light"),
);
