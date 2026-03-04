import { useCallback, useMemo, useState } from "react";
import Button from "react-bootstrap/Button";
import Container from "react-bootstrap/Container";
import Navbar from "react-bootstrap/Navbar";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import * as m from "../paraglide/messages.js";
import { SettingsPanel } from "./SettingsPanel";

interface HeaderProps {
  onShowAbout?: () => void;
  onChangeSchedule?: () => void;
  onChangeTeam?: () => void;
}

/**
 * Render the application header with title and Settings button.
 *
 * @param onShowAbout - Optional callback invoked when About is accessed from Settings panel
 * @param onChangeSchedule - Optional callback invoked when the work schedule settings are changed
 * @param onChangeTeam - Optional callback invoked when the user wants to change their team
 * @returns The header React element containing the app title and Settings button
 */
export function Header({ onShowAbout, onChangeSchedule, onChangeTeam }: HeaderProps = {}) {
  const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const [showSettings, setShowSettings] = useState(false);

  const handleToggleSettings = useCallback(() => {
    setShowSettings((prev) => !prev);
  }, []);

  const shortcuts = useMemo(
    () => ({
      onToggleSettings: handleToggleSettings,
    }),
    [handleToggleSettings],
  );

  useKeyboardShortcuts(shortcuts);

  return (
    <>
      <a href="#main-content" className="visually-hidden-focusable">
        {m.skip_to_content()}
      </a>
      <Navbar fixed="top" bg="primary" data-bs-theme="dark" className="shadow-sm">
        <Container fluid>
          <Navbar.Brand className="d-flex align-items-center">
            <i className="bi bi-clock-history me-2 header-icon"></i>
            <span className="fw-bold">Worktime</span>
          </Navbar.Brand>
          <Button
            variant="outline-light"
            size="sm"
            onClick={() => setShowSettings(true)}
            aria-label={m.settings_title()}
            title={isMac ? m.settings_cmd() : m.settings_ctrl()}
            aria-keyshortcuts={isMac ? "Meta+," : "Control+,"}
          >
            <i className="bi bi-gear"></i>
            <span className="d-none d-lg-inline ms-1">{m.settings_title()}</span>
          </Button>
        </Container>
      </Navbar>

      {/* Settings Panel */}
      <SettingsPanel
        show={showSettings}
        onHide={() => setShowSettings(false)}
        onShowAbout={onShowAbout}
        onChangeSchedule={onChangeSchedule}
        onChangeTeam={onChangeTeam}
      />
    </>
  );
}
