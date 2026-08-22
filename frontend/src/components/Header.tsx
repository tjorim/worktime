import { useCallback, useMemo } from "react";
import Button from "react-bootstrap/Button";
import Container from "react-bootstrap/Container";
import Navbar from "react-bootstrap/Navbar";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useAppShellContext } from "@/contexts/AppShellContext";
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
  const { openShortcuts } = useAppShellContext();

  const handleToggleSettings = useCallback(() => {
    void navigate({ to: isSettingsPage ? "/" : "/settings" });
  }, [navigate, isSettingsPage]);

  const handleNavigateHome = useCallback(() => {
    void navigate({ to: "/" });
  }, [navigate]);

  const shortcuts = useMemo(
    () => ({
      onToggleSettings: handleToggleSettings,
      onShowShortcuts: openShortcuts,
    }),
    [handleToggleSettings, openShortcuts],
  );

  useKeyboardShortcuts(shortcuts);

  return (
    <>
      <a href="#main-content" className="visually-hidden-focusable">
        {m.skip_to_content()}
      </a>
      <Navbar fixed="top" data-bs-theme="dark" className="shadow-sm navbar-worktime">
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
              aria-label={isSettingsPage ? m.settings_page_back_btn() : m.settings_title()}
              title={
                isSettingsPage
                  ? m.settings_page_back_btn()
                  : isMac
                    ? m.settings_cmd()
                    : m.settings_ctrl()
              }
              aria-keyshortcuts={isMac ? "Meta+," : "Control+,"}
            >
              <i className={`bi ${isSettingsPage ? "bi-arrow-left" : "bi-gear"}`}></i>
              <span className="d-none d-lg-inline ms-1">
                {isSettingsPage ? m.settings_page_back_btn() : m.settings_title()}
              </span>
            </Button>
          </div>
        </Container>
      </Navbar>
    </>
  );
}
