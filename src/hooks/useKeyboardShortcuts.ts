import { useEffect } from "react";

interface KeyboardShortcuts {
  onToday?: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onTeamSelect?: () => void;
  onTabCalendar?: () => void;
  onTabSchedule?: () => void;
  onTabTransfer?: () => void;
  onTabTimeOff?: () => void;
  onToggleSettings?: () => void;
}

/**
 * React hook that enables global keyboard shortcuts for navigation and selection actions.
 *
 * Registers a keydown event listener on the document to trigger the corresponding callback in `shortcuts` when specific keys or key combinations are pressed. Shortcut handling is disabled when the focus is on input, textarea, select, or contentEditable elements.
 *
 * @param shortcuts - Object with optional callbacks for "today", "previous", "next", and "team select" actions, invoked when their respective shortcuts are pressed
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

      // Handle key combinations
      if (event.ctrlKey || event.metaKey) {
        switch (event.key.toLowerCase()) {
          case ",":
            event.preventDefault?.();
            try {
              shortcuts.onToggleSettings?.();
            } catch (error) {
              console.error("Error in onToggleSettings callback:", error);
            }
            break;
          case "h":
            event.preventDefault?.();
            try {
              shortcuts.onToday?.();
            } catch (error) {
              console.error("Error in onToday callback:", error);
            }
            break;
          case "k":
            event.preventDefault?.();
            try {
              shortcuts.onPrevious?.();
            } catch (error) {
              console.error("Error in onPrevious callback:", error);
            }
            break;
          case "j":
            event.preventDefault?.();
            try {
              shortcuts.onNext?.();
            } catch (error) {
              console.error("Error in onNext callback:", error);
            }
            break;
          case "t":
            event.preventDefault?.();
            try {
              shortcuts.onTeamSelect?.();
            } catch (error) {
              console.error("Error in onTeamSelect callback:", error);
            }
            break;
        }
      }

      // Handle single keys
      switch (event.key) {
        case "ArrowLeft":
          if (!event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault?.();
            try {
              shortcuts.onPrevious?.();
            } catch (error) {
              console.error("Error in onPrevious callback:", error);
            }
          }
          break;
        case "ArrowRight":
          if (!event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault?.();
            try {
              shortcuts.onNext?.();
            } catch (error) {
              console.error("Error in onNext callback:", error);
            }
          }
          break;
        default:
          // Tab switching shortcuts (single keys without modifiers)
          if (!event.ctrlKey && !event.metaKey && !event.altKey) {
            const key = event.key.toLowerCase();
            const tabShortcuts: Record<string, { cb?: () => void; name: string }> = {
              c: { cb: shortcuts.onTabCalendar, name: "onTabCalendar" },
              s: { cb: shortcuts.onTabSchedule, name: "onTabSchedule" },
              t: { cb: shortcuts.onTabTransfer, name: "onTabTransfer" },
              o: { cb: shortcuts.onTabTimeOff, name: "onTabTimeOff" },
            };

            const shortcut = tabShortcuts[key];
            if (shortcut?.cb) {
              event.preventDefault?.();
              try {
                shortcut.cb();
              } catch (error) {
                console.error(`Error in ${shortcut.name} callback:`, error);
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
