import { useEffect } from "react";
import { logger } from "@/utils/logger";

interface KeyboardShortcuts {
  onToday?: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onTeamSelect?: () => void;
  onTabCalendar?: () => void;
  onTabSchedule?: () => void;
  onTabTimeOff?: () => void;
  onTabTimeTracking?: () => void;
  onTabGantt?: () => void;
  onToggleSettings?: () => void;
  onShowShortcuts?: () => void;
}

/**
 * React hook that enables global keyboard shortcuts for navigation and selection actions.
 *
 * Registers a keydown event listener on the document to trigger the corresponding callback in `shortcuts` when specific keys or key combinations are pressed. Shortcut handling is disabled when the focus is on input, textarea, select, or contentEditable elements.
 *
 * @param shortcuts - Object with optional callbacks for "today" (h), "previous" (k / ArrowLeft), "next" (j / ArrowRight), and "team select" (Alt+T) actions, invoked when their respective shortcuts are pressed
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcuts) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle shortcuts when not in input fields or contentEditable elements
      const target = event.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.contentEditable === "true") ||
        // Support mock elements in tests
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.contentEditable === "true"
      ) {
        return;
      }

      // Guard against null/undefined key
      if (!event.key) {
        return;
      }

      // Ctrl/Cmd+, - Settings. The only modifier combo here because it's the only
      // one that isn't reserved by the browser (unlike Ctrl/Cmd+H/J/K/T, which are
      // intercepted before the page ever sees them).
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === ",") {
        event.preventDefault?.();
        try {
          shortcuts.onToggleSettings?.();
        } catch (error) {
          logger.error("Error in onToggleSettings callback:", error);
        }
        return;
      }

      // Alt+T - Team select. Alt-based combos pass through to the page, unlike Ctrl/Cmd+T
      // (new tab), and the modifier keeps it distinct from the plain "t" Time Tracking tab shortcut.
      if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "t") {
        event.preventDefault?.();
        try {
          shortcuts.onTeamSelect?.();
        } catch (error) {
          logger.error("Error in onTeamSelect callback:", error);
        }
        return;
      }

      // Handle single keys
      switch (event.key) {
        case "?":
          // "?" (Shift+/) opens the keyboard shortcuts overlay from anywhere.
          // Only intercept when a handler is registered so consumers that don't
          // provide onShowShortcuts don't swallow the browser's default behavior.
          if (shortcuts.onShowShortcuts && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault?.();
            try {
              shortcuts.onShowShortcuts();
            } catch (error) {
              logger.error("Error in onShowShortcuts callback:", error);
            }
          }
          break;
        case "ArrowLeft":
          if (!event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault?.();
            try {
              shortcuts.onPrevious?.();
            } catch (error) {
              logger.error("Error in onPrevious callback:", error);
            }
          }
          break;
        case "ArrowRight":
          if (!event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault?.();
            try {
              shortcuts.onNext?.();
            } catch (error) {
              logger.error("Error in onNext callback:", error);
            }
          }
          break;
        default:
          // Single-key shortcuts without modifiers: tab switching plus Today/Previous/Next,
          // rebound off Ctrl/Cmd+H/J/K since browsers reserve those combos for themselves.
          if (!event.ctrlKey && !event.metaKey && !event.altKey) {
            const key = event.key.toLowerCase();
            const singleKeyShortcuts: Record<string, { cb?: () => void; name: string }> = {
              c: { cb: shortcuts.onTabCalendar, name: "onTabCalendar" },
              s: { cb: shortcuts.onTabSchedule, name: "onTabSchedule" },
              o: { cb: shortcuts.onTabTimeOff, name: "onTabTimeOff" },
              t: { cb: shortcuts.onTabTimeTracking, name: "onTabTimeTracking" },
              g: { cb: shortcuts.onTabGantt, name: "onTabGantt" },
              h: { cb: shortcuts.onToday, name: "onToday" },
              k: { cb: shortcuts.onPrevious, name: "onPrevious" },
              j: { cb: shortcuts.onNext, name: "onNext" },
            };

            const shortcut = singleKeyShortcuts[key];
            if (shortcut?.cb) {
              event.preventDefault?.();
              try {
                shortcut.cb();
              } catch (error) {
                logger.error(`Error in ${shortcut.name} callback:`, error);
              }
            }
          }
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [shortcuts]);
}

