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
      <a href="#main-content" className="tw:sr-only tw:focus:not-sr-only">
        {m.skip_to_content()}
      </a>
      <header className="tw:fixed tw:inset-x-0 tw:top-0 tw:z-header tw:h-header tw:bg-wt-navbar-bg tw:text-header-foreground tw:shadow-sm">
        <nav
          aria-label="Worktime"
          className="tw:flex tw:h-full tw:items-center tw:justify-between tw:px-2 tw:md:px-3"
        >
          <button
            type="button"
            onClick={handleNavigateHome}
            onMouseEnter={handlePreloadHome}
            onFocus={handlePreloadHome}
            className="tw:flex tw:items-center tw:gap-2 tw:border-0 tw:bg-transparent tw:text-inherit tw:rounded tw:focus-visible:ring-3 tw:focus-visible:ring-ring"
          >
            <Icon icon={HistoryIcon} className="tw:size-5" />
            <span className="tw:font-bold">Worktime</span>
          </button>
          <div className="tw:flex tw:items-center tw:gap-3 tw:ml-auto">
            <SyncStatusIndicator />
            <Button
              variant="ghost"
              size="sm"
              className="tw:px-2 tw:text-header-foreground tw:hover:bg-header-foreground/10 tw:hover:text-header-foreground"
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
              <span className="tw:hidden tw:lg:inline tw:ml-1">
                {isSettingsPage ? m.settings_page_back_btn() : m.settings_title()}
              </span>
            </Button>
          </div>
        </nav>
      </header>
    </>
  );
}
