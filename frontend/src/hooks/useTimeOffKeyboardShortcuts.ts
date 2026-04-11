import { useCallback, useEffect, useRef } from "react";
import type { TimeOffViewMode } from "@/data/timeoffConstants";

/**
 * Check if an event target is an editable element.
 * Used to determine whether keyboard shortcuts should be active.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const isTextInput =
    target instanceof HTMLInputElement && target.type !== "checkbox" && target.type !== "radio";
  return (
    isTextInput ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

type KeyboardShortcutHandlers = {
  onImport: () => void;
  onExport: () => void;
  onBulkDelete: () => void;
  onCancelEditMode: () => void;
};

type KeyboardShortcutOptions = {
  isActive: boolean;
  showEventModal: boolean;
  modalMode: "add" | "edit" | "view";
  editIndex: number;
  viewMode: TimeOffViewMode;
  selectedIndicesCount: number;
};

/**
 * Custom hook for managing keyboard shortcuts in the Time Off view.
 * Handles undo/redo, import/export, delete, and escape key functionality.
 *
 * @param handlers - Object containing all keyboard shortcut callback handlers
 * @param options - Configuration options for conditional shortcut behavior
 */
export function useTimeOffKeyboardShortcuts(
  handlers: KeyboardShortcutHandlers,
  options: KeyboardShortcutOptions,
) {
  const { isActive, showEventModal, modalMode, editIndex, viewMode, selectedIndicesCount } =
    options;

  // Ref to hold latest handlers to avoid stale closures in keyboard event listener
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      if (isEditableTarget(event.target)) {
        return;
      }

      // Escape key - Cancel edit mode
      if (event.key === "Escape") {
        if (showEventModal && modalMode === "edit" && editIndex >= 0) {
          event.preventDefault();
          handlersRef.current.onCancelEditMode();
        }
        return;
      }

      // Suppress all other shortcuts while the modal is open
      if (showEventModal) {
        return;
      }

      // Delete key - Bulk delete selected events
      if (event.key === "Delete" || event.key === "Backspace") {
        if (viewMode === "table" && selectedIndicesCount > 0) {
          event.preventDefault();
          handlersRef.current.onBulkDelete();
        }
        return;
      }

      // Ctrl/Cmd shortcuts
      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase();

        // Ctrl+S / Cmd+S - Export
        if (key === "s") {
          event.preventDefault();
          handlersRef.current.onExport();
          return;
        }

        // Ctrl+I / Cmd+I - Import
        if (key === "i") {
          event.preventDefault();
          handlersRef.current.onImport();
          return;
        }
      }
    },
    [showEventModal, modalMode, editIndex, viewMode, selectedIndicesCount],
  );

  useEffect(() => {
    if (!isActive) {
      return;
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown, isActive]);
}
