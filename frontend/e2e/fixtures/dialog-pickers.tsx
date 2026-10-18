import { useState } from "react";
import { createRoot } from "react-dom/client";
import "@/styles/tailwind.css";
import { TemplateModal } from "@/features/timeTracking/TemplateModal";
import { TaskEditModal } from "@/components/shared/TaskEditModal";
import { AuthProvider as OidcAuthProvider } from "react-oidc-context";
import { oidcConfig } from "@/config/oidc";
import { WelcomeWizard } from "@/components/WelcomeWizard";
import { AuthProvider } from "@/contexts/AuthContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { GanttTaskModal } from "@/features/gantt/GanttTaskModal";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";

const labels = Array.from({ length: 20 }, (_, index) => ({
  id: String(index),
  name: `Label ${index + 1}`,
  color: "#198754",
}));
const params = new URLSearchParams(location.search);
document.documentElement.setAttribute("data-theme", params.get("theme") ?? "light");
function Fixture() {
  const [open, setOpen] = useState(true);
  const [value, setValue] = useState({
    text: "Review task",
    label: "0",
    start: "09:00",
    stop: "10:00",
    includesBreak: false,
  });
  const mode = params.get("mode");
  if (mode === "wizard") {
    return (
      <OidcAuthProvider {...oidcConfig}>
        <SettingsProvider>
          <ToastProvider>
            <AuthProvider>
              <WelcomeWizard
                show={open}
                startStep="work-location-setup"
                onTeamSelect={() => {}}
                onHide={() => setOpen(false)}
              />
            </AuthProvider>
          </ToastProvider>
        </SettingsProvider>
      </OidcAuthProvider>
    );
  }
  if (mode === "gantt") {
    return (
      <GanttTaskModal
        show={open}
        onHide={() => setOpen(false)}
        onSave={() => setOpen(false)}
        existingTasks={labels.map((label) => ({ id: label.id, name: label.name }))}
      />
    );
  }
  if (mode === "warning") {
    return (
      <ConfirmationDialog
        isOpen={open}
        title="Reset changes?"
        message="Your edits will be discarded."
        variant="warning"
        onCancel={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
      />
    );
  }
  if (mode === "template") {
    return (
      <TemplateModal
        show={open}
        title="Add Template"
        submitLabel="Save"
        labels={labels}
        initialValue={value}
        onClose={() => setOpen(false)}
        onSubmit={() => setOpen(false)}
      />
    );
  }
  return (
    <TaskEditModal
      show={open}
      labels={labels}
      showGanttPicker
      ganttTasks={labels.map((label) => ({
        id: label.id,
        name: `Project ${Number(label.id) + 1}`,
        start: "2026-09-01",
        end: "2026-09-30",
        progress: 0,
      }))}
      value={value}
      onChange={setValue}
      onClose={() => setOpen(false)}
      onSubmit={() => setOpen(false)}
      error=""
    />
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
