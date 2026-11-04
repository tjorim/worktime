import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { LabelsPanel } from "@/features/timeTracking/LabelsPanel";
import { TemplatesPanel } from "@/features/timeTracking/TemplatesPanel";
import { SettingsReplacementError } from "@/utils/apiError";
import { ToastProvider } from "@/contexts/ToastContext";
import "@/styles/tailwind.css";
const params = new URLSearchParams(location.search);
document.documentElement.setAttribute("data-theme", params.get("theme") ?? "light");
function Fixture() {
  const router = useRouter();
  const [labels, setLabels] = useState([{ id: "a", name: "Support", color: "#123456" }]);
  return (
    <main className="p-4">
      <ToastProvider>
        <button
          onClick={() => {
            void router.navigate({ to: "/away" });
          }}
        >
          Leave editors
        </button>
        <button onClick={() => router.history.back()}>Go back</button>
        <button onClick={() => setLabels([{ id: "b", name: "Updated", color: "#123456" }])}>
          Simulate refresh
        </button>
        <LabelsPanel
          labels={labels}
          tasks={[]}
          ganttTasks={[]}
          templates={[]}
          onReassignAndDeleteLabel={async () => {}}
          onUpdateLabels={(next) => {
            if (params.has("partial")) {
              setLabels([]);
              throw new SettingsReplacementError(1, 1);
            }
            setLabels(next);
          }}
        />
        <TemplatesPanel
          labels={labels}
          templates={[]}
          onUpdateTemplates={() => {}}
          onAddTemplate={() => {}}
          onUpdateTemplate={() => {}}
          onDeleteTemplate={() => {}}
        />
      </ToastProvider>
    </main>
  );
}
function OtherPage() {
  const router = useRouter();
  return (
    <>
      <p>Other page</p>
      <button
        onClick={() => {
          void router.navigate({ to: "/e2e/fixtures/label-editors.html" });
        }}
      >
        Return editors
      </button>
    </>
  );
}
const root = createRootRoute();
const editor = createRoute({
  getParentRoute: () => root,
  path: "/e2e/fixtures/label-editors.html",
  component: Fixture,
});
const away = createRoute({
  getParentRoute: () => root,
  path: "/away",
  component: () => <OtherPage />,
});
const router = createRouter({
  routeTree: root.addChildren([editor, away]),
});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
