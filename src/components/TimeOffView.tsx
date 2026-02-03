import { useCallback, useEffect, useRef, useState } from "react";
import Card from "react-bootstrap/Card";
import type { HdayEvent } from "../lib/hday/types";
import { buildPreviewLine, normalizeEventFlags } from "../lib/hday/parser";
import { useEventStore } from "../contexts/EventStoreContext";
import { useSettings } from "../contexts/SettingsContext";
import { useToast } from "../contexts/ToastContext";
import { useViewMode } from "../hooks/useViewMode";
import { useEventForm } from "../hooks/useEventForm";
import { useTimeOffKeyboardShortcuts } from "../hooks/useTimeOffKeyboardShortcuts";
import { EventModal } from "./EventModal";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { RawContentPanel } from "./timeoff/RawContentPanel";
import { VacationStatsPanel } from "./timeoff/VacationStatsPanel";
import { EventTable } from "./timeoff/EventTable";
import { TimeOffToolbar } from "./timeoff/TimeOffToolbar";
import {
  TYPE_FLAG_OPTIONS,
  TIME_LOCATION_FLAG_OPTIONS,
  TYPE_FLAGS_AS_EVENT_FLAGS,
  TIME_LOCATION_FLAGS_AS_EVENT_FLAGS,
  TIMEOFF_VIEWS,
} from "./timeoff/constants";

/**
 * Render the Time Off Management UI that lists time-off events and provides add, edit, import, export and delete flows.
 *
 * The component manages form state and validation, displays a responsive table of events, and shows modal dialogs for event editing and deletion confirmation. It uses the EventStore and Toast contexts for persistence and user feedback.
 *
 * Accessibility Features:
 * - Semantic table structure with proper thead/tbody for screen readers
 * - ARIA labels on icon-only buttons (Edit/Delete) for screen reader announcements
 * - aria-hidden on decorative icons to prevent redundant announcements
 * - Proper form labels and ARIA attributes in EventModal (aria-required, aria-describedby)
 * - Keyboard navigation supported via standard HTML elements (buttons, inputs, table)
 * - Color contrast: Event badges use #000 text on colored backgrounds for readability
 * - Modal dialogs use React Bootstrap's built-in accessibility features (focus trap, Escape key)
 * - Empty state provides helpful context for new users
 * - Import/Export buttons clearly labeled with icons and text
 * - Responsive table layout adapts to smaller screens
 *
 * @returns The Time Off Management React element.
 */
interface TimeOffViewProps {
  isActive?: boolean;
  initialView?: string; // Initial view mode from URL parameter ("table", "stats", or "raw")
}

export function TimeOffView({ isActive = false, initialView }: TimeOffViewProps) {
  const {
    rawText,
    events,
    addEvent,
    updateEvent,
    deleteEvent,
    deleteEvents,
    importHday,
    exportHday,
    canUndo,
    canRedo,
    undo,
    redo,
  } = useEventStore();
  const { settings, updateVacationAllowance } = useSettings();
  const toast = useToast();

  const [viewMode, setViewMode] = useViewMode(initialView, TIMEOFF_VIEWS, "table");

  // Use custom hook for event form state management
  const {
    eventType,
    eventWeekday,
    eventStart,
    eventEnd,
    eventTitle,
    eventFlags,
    startDateError,
    endDateError,
    setEventType,
    setEventWeekday,
    setEventStart,
    setEventEnd,
    setEventTitle,
    resetForm,
    validateForm,
    prefillFormFromEvent,
    handleTypeFlagChange,
    handleTimeFlagChange,
  } = useEventForm();

  // Modal state
  const [showEventModal, setShowEventModal] = useState(false);
  const [editIndex, setEditIndex] = useState(-1);
  const [modalMode, setModalMode] = useState<"add" | "edit" | "view">("add");

  // Raw .hday editor state
  const [rawEditorText, setRawEditorText] = useState(rawText);
  const [rawEditorError, setRawEditorError] = useState("");
  const [isRawEditorDirty, setIsRawEditorDirty] = useState(false);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState(-1);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  // Refs
  const formRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenAddModal = useCallback(() => {
    resetForm();
    setEditIndex(-1);
    setModalMode("add");
    setShowEventModal(true);
  }, [resetForm]);

  const handleOpenEditModal = (index: number) => {
    const event = events[index];
    if (!event) return;

    setEditIndex(index);
    prefillFormFromEvent(event);
    setModalMode("edit");
    setShowEventModal(true);
  };

  const handleSwitchToEdit = () => {
    setModalMode("edit");
  };

  const handleCancelEditMode = useCallback(() => {
    if (editIndex < 0) {
      return;
    }
    const event = events[editIndex];
    if (!event) {
      return;
    }
    prefillFormFromEvent(event);
    setModalMode("view");
  }, [editIndex, events, prefillFormFromEvent]);

  const handleSubmitEvent = () => {
    if (!validateForm()) {
      toast.showError("Please fix validation errors before saving");
      return;
    }

    const normalizedFlags = normalizeEventFlags(eventFlags);

    let newEvent: HdayEvent;

    if (eventType === "range") {
      newEvent = {
        type: "range",
        start: eventStart,
        end: eventEnd || eventStart,
        flags: normalizedFlags,
        title: eventTitle,
      };
    } else {
      newEvent = {
        type: "weekly",
        weekday: eventWeekday,
        flags: normalizedFlags,
        title: eventTitle,
      };
    }

    if (editIndex >= 0) {
      updateEvent(editIndex, newEvent);
      toast.showSuccess(`Event updated successfully`, "✓");
    } else {
      addEvent(newEvent);
      toast.showSuccess(`Event added successfully`, "✓");
    }

    setShowEventModal(false);
    resetForm();
  };

  const handleDeleteClick = (index: number) => {
    setDeleteIndex(index);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = () => {
    if (deleteIndex >= 0) {
      deleteEvent(deleteIndex);
      toast.showSuccess("Event deleted successfully", "🗑️");
    }
    setShowDeleteConfirm(false);
    setDeleteIndex(-1);
  };

  const handleToggleSelection = (index: number) => {
    setSelectedIndices((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    setSelectedIndices(new Set(events.map((_, index) => index)));
  };

  const handleClearSelection = () => {
    setSelectedIndices(new Set());
  };

  const handleBulkDeleteConfirm = () => {
    if (selectedIndices.size > 0) {
      deleteEvents(Array.from(selectedIndices));
      toast.showSuccess(`Deleted ${selectedIndices.size} events`, "🗑️");
    }
    setSelectedIndices(new Set());
    setShowBulkDeleteConfirm(false);
  };

  useEffect(() => {
    setSelectedIndices((prev) => {
      const newSet = new Set<number>();
      prev.forEach((index) => {
        if (index >= 0 && index < events.length) {
          newSet.add(index);
        }
      });
      return newSet;
    });
  }, [events.length]);

  useEffect(() => {
    if (!isRawEditorDirty) {
      setRawEditorText(rawText);
    }
  }, [isRawEditorDirty, rawText]);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      importHday(text);
      setSelectedIndices(new Set()); // Clear selection after import
      setIsRawEditorDirty(false); // Reset raw editor dirty state
      setRawEditorError(""); // Clear any raw editor errors
      toast.showSuccess(`Imported ${file.name}`, "📥");
    } catch (error) {
      console.error("Failed to import .hday file:", error);
      toast.showError("Failed to import file. Please check the format.");
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleExport = useCallback(() => {
    const hdayContent = exportHday();

    if (!hdayContent.trim()) {
      toast.showError("No events to export");
      return;
    }

    // Export as downloadable file
    const blob = new Blob([hdayContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "timeoff.hday";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.showSuccess("Exported timeoff.hday", "📤");
  }, [exportHday, toast]);

  const handleRawEditorChange = useCallback((value: string) => {
    setRawEditorText(value);
    setIsRawEditorDirty(true);
    setRawEditorError("");
  }, []);

  const handleParseRawEditor = useCallback(() => {
    try {
      importHday(rawEditorText);
      setSelectedIndices(new Set());
      setIsRawEditorDirty(false);
      setRawEditorError("");
      toast.showSuccess("Raw .hday content applied", "✓");
    } catch (error) {
      console.error("Failed to parse raw .hday content:", error);
      setRawEditorError("Failed to parse raw .hday content. Please check the format.");
      toast.showError("Failed to parse raw .hday content.");
    }
  }, [importHday, rawEditorText, toast]);

  const handleResetRawEditor = useCallback(() => {
    setRawEditorText(rawText);
    setIsRawEditorDirty(false);
    setRawEditorError("");
  }, [rawText]);

  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    undo();
    toast.showSuccess("Undo successful", "↩️");
  }, [canUndo, undo, toast]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    redo();
    toast.showSuccess("Redo successful", "↪️");
  }, [canRedo, redo, toast]);

  // Use custom hook for keyboard shortcuts
  useTimeOffKeyboardShortcuts(
    {
      onUndo: handleUndo,
      onRedo: handleRedo,
      onImport: handleImport,
      onExport: handleExport,
      onBulkDelete: () => setShowBulkDeleteConfirm(true),
      onCancelEditMode: handleCancelEditMode,
    },
    {
      isActive,
      showEventModal,
      modalMode,
      editIndex,
      viewMode,
      selectedIndicesCount: selectedIndices.size,
    },
  );

  const previewLine = buildPreviewLine({
    eventType,
    start: eventStart,
    end: eventEnd,
    weekday: eventWeekday,
    title: eventTitle,
    flags: eventFlags,
  });

  return (
    <div className="time-off-view py-3">
      <Card>
        <TimeOffToolbar
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          eventCount={events.length}
          selectedCount={selectedIndices.size}
          onSelectAll={handleSelectAll}
          onClearSelection={handleClearSelection}
          onBulkDelete={() => setShowBulkDeleteConfirm(true)}
          onImport={handleImport}
          onExport={handleExport}
          onAddEvent={handleOpenAddModal}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          isRawEditorDirty={isRawEditorDirty}
        />
        <Card.Body>

          {viewMode === "table" &&
            (events.length === 0 ? (
              <div className="text-center text-muted py-5">
                <i className="bi bi-calendar-x display-4 d-block mb-3"></i>
                <p>No time-off events yet.</p>
                <p className="small">
                  Click "Add Event" to create your first event, or "Import" to load an existing
                  .hday file.
                </p>
              </div>
            ) : (
              <EventTable
                events={events}
                selectedIndices={selectedIndices}
                onToggleSelection={handleToggleSelection}
                onSelectAll={handleSelectAll}
                onClearSelection={handleClearSelection}
                onEditEvent={handleOpenEditModal}
                onDeleteEvent={handleDeleteClick}
              />
            ))}

          {viewMode === "stats" && (
            <div role="region" aria-label="Vacation statistics">
              <VacationStatsPanel
                events={events}
                allowance={settings.vacationAllowance}
                onUpdateAllowance={updateVacationAllowance}
              />
            </div>
          )}

          {viewMode === "raw" && (
            <div role="region" aria-label="Raw .hday content editor">
              <RawContentPanel
                rawText={rawEditorText}
                error={rawEditorError}
                isDirty={isRawEditorDirty}
                onChangeRawText={handleRawEditorChange}
                onApply={handleParseRawEditor}
                onReset={handleResetRawEditor}
              />
            </div>
          )}
        </Card.Body>
      </Card>

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".hday,text/plain"
        className="d-none"
        aria-label="Import .hday file"
        onChange={handleFileChange}
      />

      {/* Event Modal */}
      <EventModal
        show={showEventModal}
        mode={modalMode}
        formRef={formRef}
        eventType={eventType}
        eventWeekday={eventWeekday}
        eventStart={eventStart}
        eventEnd={eventEnd}
        eventTitle={eventTitle}
        eventFlags={eventFlags}
        startDateError={startDateError}
        endDateError={endDateError}
        previewLine={previewLine}
        typeFlagOptions={TYPE_FLAG_OPTIONS}
        timeLocationFlagOptions={TIME_LOCATION_FLAG_OPTIONS}
        typeFlagsAsEventFlags={TYPE_FLAGS_AS_EVENT_FLAGS}
        timeLocationFlagsAsEventFlags={TIME_LOCATION_FLAGS_AS_EVENT_FLAGS}
        onHide={() => setShowEventModal(false)}
        onEntered={() => formRef.current?.focus()}
        onEventTypeChange={setEventType}
        onEventTitleChange={setEventTitle}
        onEventWeekdayChange={setEventWeekday}
        onStartDateChange={setEventStart}
        onEndDateChange={setEventEnd}
        onTypeFlagChange={handleTypeFlagChange}
        onTimeFlagChange={handleTimeFlagChange}
        onResetForm={resetForm}
        onSubmit={handleSubmitEvent}
        onSwitchToEdit={handleSwitchToEdit}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteConfirm}
        title="Delete Event"
        message="Are you sure you want to delete this event? You can undo this with the Undo button or Ctrl+Z."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <ConfirmationDialog
        isOpen={showBulkDeleteConfirm}
        title="Delete Selected Events"
        message={`Are you sure you want to delete ${selectedIndices.size} selected events? You can undo this with the Undo button or Ctrl+Z.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleBulkDeleteConfirm}
        onCancel={() => setShowBulkDeleteConfirm(false)}
      />
    </div>
  );
}
