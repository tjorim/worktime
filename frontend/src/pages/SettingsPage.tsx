import Button from "react-bootstrap/Button";
import { useNavigate } from "@tanstack/react-router";
import { SettingsPanel } from "@/components/SettingsPanel";
import { useAppShellContext } from "@/contexts/AppShellContext";
import * as m from "@/paraglide/messages.js";

export function SettingsPage() {
  const navigate = useNavigate();
  const { openAbout, onChangeSchedule, onChangeTeam } = useAppShellContext();

  return (
    <main id="main-content" className="py-4">
      <div className="mx-auto" style={{ maxWidth: "1080px" }}>
        <div className="rounded-4 border bg-body-tertiary px-4 py-4 px-md-5 mb-4">
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-3">
            <div>
              <div className="text-uppercase small text-muted fw-semibold mb-2">
                {m.settings_title()}
              </div>
              <h1 className="h3 mb-2">{m.settings_page_heading()}</h1>
              <p className="text-muted mb-0">{m.settings_page_description()}</p>
            </div>
            <Button variant="outline-secondary" onClick={() => void navigate({ to: "/" })}>
              <i className="bi bi-arrow-left me-2"></i>
              {m.settings_page_back_btn()}
            </Button>
          </div>
        </div>

        <SettingsPanel
          show
          variant="page"
          onHide={() => void navigate({ to: "/" })}
          onShowAbout={openAbout}
          onChangeSchedule={onChangeSchedule}
          onChangeTeam={onChangeTeam}
        />
      </div>
    </main>
  );
}
