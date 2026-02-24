import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "react-bootstrap/Button";
import Container from "react-bootstrap/Container";
import Navbar from "react-bootstrap/Navbar";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { SettingsPanel } from "./SettingsPanel";

interface HeaderProps {
  onShowAbout?: () => void;
  onChangeSchedule?: () => void;
  onChangeTeam?: () => void;
  showSettings?: boolean;
  onOpenSettings?: () => void;
  onCloseSettings?: () => void;
}

export function Header({
  onShowAbout,
  onChangeSchedule,
  onChangeTeam,
  showSettings,
  onOpenSettings,
  onCloseSettings,
}: HeaderProps = {}) {
  const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const [internalShowSettings, setInternalShowSettings] = useState(false);
  const isControlled = typeof showSettings === "boolean";
  const settingsOpen = isControlled ? showSettings : internalShowSettings;
  const latestSettingsRef = useRef(settingsOpen);

  useEffect(() => {
    latestSettingsRef.current = settingsOpen;
  }, [settingsOpen]);

  const openSettings = useCallback(() => {
    if (isControlled) {
      onOpenSettings?.();
      return;
    }
    setInternalShowSettings(true);
  }, [isControlled, onOpenSettings]);

  const closeSettings = useCallback(() => {
    if (isControlled) {
      onCloseSettings?.();
      return;
    }
    setInternalShowSettings(false);
  }, [isControlled, onCloseSettings]);

  const toggleSettings = useCallback(() => {
    if (isControlled) {
      if (latestSettingsRef.current) {
        onCloseSettings?.();
      } else {
        onOpenSettings?.();
      }
      return;
    }
    setInternalShowSettings((prev) => !prev);
  }, [isControlled, onOpenSettings, onCloseSettings]);

  useKeyboardShortcuts(
    useMemo(
      () => ({
        onToggleSettings: toggleSettings,
      }),
      [toggleSettings],
    ),
  );

  return (
    <>
      <a href="#main-content" className="visually-hidden-focusable">
        Skip to content
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
            onClick={openSettings}
            aria-label="Settings"
            title={`Settings (${isMac ? "Cmd" : "Ctrl"}+,)`}
            aria-keyshortcuts={isMac ? "Meta+," : "Control+,"}
          >
            <i className="bi bi-gear"></i>
            <span className="d-none d-lg-inline ms-1">Settings</span>
          </Button>
        </Container>
      </Navbar>

      <SettingsPanel
        show={settingsOpen}
        onHide={closeSettings}
        onShowAbout={onShowAbout}
        onChangeSchedule={onChangeSchedule}
        onChangeTeam={onChangeTeam}
      />
    </>
  );
}
