import Button from "react-bootstrap/Button";
import { useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { type SettingsSection, SettingsPanel } from "@/components/SettingsPanel";
import { useAppShellContext } from "@/contexts/AppShellContext";
import * as m from "@/paraglide/messages.js";

const SETTINGS_SECTIONS: Array<{
  key: SettingsSection;
  icon: string;
  label: () => string;
}> = [
  { key: "general", icon: "bi-sliders", label: m.preferences_title },
  { key: "features", icon: "bi-grid", label: m.features_title },
  { key: "account", icon: "bi-person-circle", label: m.account_section_title },
  { key: "sync", icon: "bi-cloud-check", label: m.sync_section_title },
  { key: "data", icon: "bi-database", label: m.quick_actions_title },
  { key: "about", icon: "bi-info-circle", label: m.information_title },
];

export function SettingsPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/settings" });
  const { openAbout } = useAppShellContext();
  const activeSection = search.section ?? "general";

  const sectionMeta = useMemo(() => {
    const matchedSection = SETTINGS_SECTIONS.find((section) => section.key === activeSection);
    return matchedSection ?? SETTINGS_SECTIONS[0]!;
  }, [activeSection]);

  return (
    <main id="main-content" className="py-4">
      <div className="mx-auto" style={{ maxWidth: "1080px" }}>
        <div className="rounded-4 border bg-body-tertiary px-4 py-4 px-md-5 mb-4">
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-3">
            <div>
              <div className="text-uppercase small text-muted fw-semibold mb-2">
                {m.settings_title()}
              </div>
              <h1 className="h3 mb-2">{sectionMeta.label()}</h1>
              <p className="text-muted mb-0">{m.settings_page_description()}</p>
            </div>
            <Button variant="outline-secondary" onClick={() => void navigate({ to: "/" })}>
              <i className="bi bi-arrow-left me-2"></i>
              {m.settings_page_back_btn()}
            </Button>
          </div>
        </div>

        <div className="row g-4 align-items-start">
          <div className="col-12 col-lg-4 col-xl-3">
            <div className="rounded-4 border bg-body shadow-sm overflow-hidden">
              <div className="px-3 py-3 border-bottom bg-body-tertiary">
                <div className="small text-uppercase text-muted fw-semibold">
                  {m.settings_page_nav_title()}
                </div>
              </div>
              <div className="p-2 d-grid gap-2">
                {SETTINGS_SECTIONS.map((section) => {
                  const isActive = section.key === activeSection;
                  return (
                    <Button
                      key={section.key}
                      variant={isActive ? "primary" : "outline-secondary"}
                      className="text-start d-flex align-items-center gap-2 justify-content-start"
                      onClick={() =>
                        void navigate({
                          to: "/settings",
                          search: { section: section.key },
                        })
                      }
                    >
                      <i className={`bi ${section.icon}`}></i>
                      <span>{section.label()}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="col-12 col-lg-8 col-xl-9">
            <SettingsPanel
              activeSection={activeSection}
              onHide={() => void navigate({ to: "/" })}
              onShowAbout={openAbout}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
