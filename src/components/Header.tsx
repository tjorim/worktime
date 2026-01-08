import { useState } from "react";
import Button from "react-bootstrap/Button";
import Container from "react-bootstrap/Container";
import { SettingsPanel } from "./SettingsPanel";

interface HeaderProps {
  onShowAbout?: () => void;
  onChangeSchedule?: () => void;
}

/**
 * Render the application header showing the title and action buttons for About and Settings.
 *
 * @param onShowAbout - Optional callback invoked when the About button is clicked
 * @param onChangeSchedule - Optional callback invoked when the work schedule settings are changed
 * @returns The header React element containing the app title and action controls
 */
export function Header({ onShowAbout, onChangeSchedule }: HeaderProps = {}) {
  const [showSettings, setShowSettings] = useState(false);

  const handleShowAbout = () => {
    onShowAbout?.();
  };

  return (
    <>
      <header className="sticky-top bg-primary text-white py-2 mb-3 shadow-sm">
        <Container fluid>
          <div className="d-flex justify-content-between align-items-center">
            <div className="d-flex align-items-center">
              <i className="bi bi-clock-history me-2 header-icon"></i>
              <h1 className="h4 mb-0 fw-bold">Worktime</h1>
            </div>
            <div className="d-flex align-items-center header-button-spacing">
              <Button
                variant="outline-light"
                size="sm"
                onClick={handleShowAbout}
                aria-label="About Worktime"
                className="header-button"
              >
                <i className="bi bi-info-circle"></i>
                <span className="d-none d-lg-inline ms-1">About</span>
              </Button>
              <Button
                variant="outline-light"
                size="sm"
                onClick={() => setShowSettings(true)}
                aria-label="Settings"
                className="header-button"
              >
                <i className="bi bi-gear"></i>
                <span className="d-none d-lg-inline ms-1">Settings</span>
              </Button>
            </div>
          </div>
        </Container>
      </header>

      {/* Settings Panel */}
      <SettingsPanel
        show={showSettings}
        onHide={() => setShowSettings(false)}
        onShowAbout={onShowAbout}
        onChangeSchedule={onChangeSchedule}
      />
    </>
  );
}
