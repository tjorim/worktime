import { useCallback, useMemo } from "react";
import Button from "react-bootstrap/Button";
import Container from "react-bootstrap/Container";
import Navbar from "react-bootstrap/Navbar";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { SyncStatusIndicator } from "@/components/sync/SyncStatusIndicator";
import * as m from "@/paraglide/messages.js";

/**
 * Render the application header with title and Settings button.
 *
 * @returns The header React element containing the app title and Settings button
 */
export function Header() {
  const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isSettingsPage = pathname === "/settings";

  const handleToggleSettings = useCallback(() => {
    void navigate({ to: isSettingsPage ? "/" : "/settings" });
  }, [navigate, isSettingsPage]);

  const handleNavigateHome = useCallback(() => {
    void navigate({ to: "/" });
  }, [navigate]);

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
          <Navbar.Brand
            as="button"
            type="button"
            onClick={handleNavigateHome}
            className="d-flex align-items-center border-0 bg-transparent"
          >
            <i className="bi bi-clock-history me-2 header-icon"></i>
            <span className="fw-bold">Worktime</span>
          </Navbar.Brand>
          <div className="d-flex align-items-center gap-3 ms-auto">
            <SyncStatusIndicator />
            <Button
              variant={isSettingsPage ? "light" : "outline-light"}
              size="sm"
              onClick={handleToggleSettings}
              aria-label={m.settings_title()}
              title={isMac ? m.settings_cmd() : m.settings_ctrl()}
              aria-keyshortcuts={isMac ? "Meta+," : "Control+,"}
            >
              <i className="bi bi-gear"></i>
              <span className="d-none d-lg-inline ms-1">{m.settings_title()}</span>
            </Button>
          </div>
        </Container>
      </Navbar>
    </>
  );
}
