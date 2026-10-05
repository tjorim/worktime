import {
  ArrowLeft as ArrowLeftIcon,
  History as HistoryIcon,
  Settings as SettingsIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
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
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isSettingsPage = pathname === "/settings";
  const { openShortcuts } = useAppShellContext();

  const handleToggleSettings = useCallback(() => {
    void navigate({ to: isSettingsPage ? "/" : "/settings" });
  }, [navigate, isSettingsPage]);

  const handleNavigateHome = useCallback(() => {
    void navigate({ to: "/" });
  }, [navigate]);

  const handlePreloadHome = useCallback(() => {
    void router.preloadRoute({ to: "/" }).catch(() => {});
  }, [router]);

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
      <a href="#main-content" className="sr-only focus:not-sr-only">
        {m.skip_to_content()}
      </a>
      <header className="fixed inset-x-0 top-0 z-header h-header bg-wt-navbar-bg text-header-foreground shadow-sm">
        <nav
          aria-label="Worktime"
          className="flex h-full items-center justify-between px-2 md:px-3"
        >
          <button
            type="button"
            onClick={handleNavigateHome}
            onMouseEnter={handlePreloadHome}
            onFocus={handlePreloadHome}
            className="flex items-center gap-2 border-0 bg-transparent text-inherit rounded focus-visible:ring-3 focus-visible:ring-ring"
          >
            <Icon icon={HistoryIcon} className="size-5" />
            <span className="font-bold">Worktime</span>
          </button>
          <div className="flex items-center gap-3 ml-auto">
            <SyncStatusIndicator />
            <Button
              variant="ghost"
              size="sm"
              className="px-2 text-header-foreground hover:bg-header-foreground/10 hover:text-header-foreground"
              onClick={handleToggleSettings}
              onMouseEnter={isSettingsPage ? handlePreloadHome : undefined}
              onFocus={isSettingsPage ? handlePreloadHome : undefined}
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
              <Icon icon={isSettingsPage ? ArrowLeftIcon : SettingsIcon} />
              <span className="hidden lg:inline ml-1">
                {isSettingsPage ? m.settings_page_back_btn() : m.settings_title()}
              </span>
            </Button>
          </div>
        </nav>
      </header>
    </>
  );
}
