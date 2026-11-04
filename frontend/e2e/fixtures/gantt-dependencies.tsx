import { GanttTableView } from "@/features/gantt/GanttTableView";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import "@/styles/tailwind.css";
import { GanttTaskModal } from "@/features/gantt/GanttTaskModal";

const params = new URLSearchParams(location.search);
document.documentElement.setAttribute("data-theme", params.get("theme") ?? "light");
const dependencies =
  params.get("reason") === "self" ? "a" : params.get("reason") === "cycle" ? "b" : "missing";
function Fixture() {
  const [saved, setSaved] = useState(false);
  if (params.get("view") === "table") {
    return (
      <GanttTableView
        tasks={[
          {
            id: "a",
            name: "Missing target",
            start: "2026-11-01",
            end: "2026-11-05",
            progress: 0,
            dependencies: "missing",
          },
          {
            id: "b",
            name: "Self reference",
            start: "2026-11-01",
            end: "2026-11-05",
            progress: 0,
            dependencies: "b",
          },
          {
            id: "c",
            name: "Cycle",
            start: "2026-11-01",
            end: "2026-11-05",
            progress: 0,
            dependencies: "d",
          },
          {
            id: "d",
            name: "Other cycle task",
            start: "2026-11-01",
            end: "2026-11-05",
            progress: 0,
            dependencies: "c",
          },
        ]}
        onTaskClick={() => {}}
        onDeleteTask={() => {}}
      />
    );
  }
  return (
    <>
      {saved && <p>Saved</p>}
      <GanttTaskModal
        show
        onHide={() => {}}
        onSave={() => setSaved(true)}
        task={{
          id: "a",
          name: "Design",
          start: "2026-11-01",
          end: "2026-11-05",
          progress: 0,
          dependencies,
        }}
        existingTasks={[
          { id: "a", name: "Design", dependencies },
          { id: "b", name: "Build", dependencies: "a" },
        ]}
      />
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
