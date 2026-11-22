import { GanttChart } from "@/features/gantt/GanttChart";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import type { GanttViewMode } from "@/types/gantt";
import "@/styles/tailwind.css";

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") ?? "light";

const tasks = [
  { id: "design", name: "Design & review", start: "2026-11-02", end: "2026-11-13", progress: 60 },
  {
    id: "build",
    name: "Build",
    start: "2026-11-16",
    end: "2026-12-04",
    progress: 0,
    dependencies: "design",
  },
];

function Fixture() {
  const [mode, setMode] = useState<GanttViewMode>(
    localStorage.getItem("fixture-zoom") === "Day" ? "Day" : "Week",
  );
  return (
    <main className="p-3">
      <GanttChart
        tasks={tasks}
        viewMode={mode}
        holidays={["2026-11-06"]}
        timeOffDates={["2026-11-04"]}
        onTaskClick={() => {}}
        onDateChange={() => {}}
        onProgressChange={() => {}}
        onViewModeChange={(nextMode) => {
          localStorage.setItem("fixture-zoom", nextMode);
          setMode(nextMode);
        }}
      />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
