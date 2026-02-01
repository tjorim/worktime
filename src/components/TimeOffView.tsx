import { useCallback, useEffect, useRef, useState } from "react";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Card from "react-bootstrap/Card";
import type { EventFlag, HdayEvent, TimeLocationFlag, TypeFlag } from "../lib/hday/types";
import { buildPreviewLine, normalizeEventFlags } from "../lib/hday/parser";
import { isValidDate } from "../lib/hday/validation";
import { dayjs } from "../utils/dateTimeUtils";
import { useEventStore } from "../contexts/EventStoreContext";
import { useSettings } from "../contexts/SettingsContext";
import { useToast } from "../contexts/ToastContext";
import { useViewMode } from "../hooks/useViewMode";
import { EventModal } from "./EventModal";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { RawContentPanel } from "./timeoff/RawContentPanel";
import { VacationStatsPanel } from "./timeoff/VacationStatsPanel";
import { EmptyState } from "./timeoff/EmptyState";
import { EventTable } from "./timeoff/EventTable";
import {
  TYPE_FLAG_OPTIONS,
  TIME_LOCATION_FLAG_OPTIONS,
  TYPE_FLAGS_AS_EVENT_FLAGS,
  TIME_LOCATION_FLAGS_AS_EVENT_FLAGS,
  TIMEOFF_VIEWS,
  DEFAULT_WEEKDAY,
  VIEW_MODE_HELP_TEXT,
} from "./timeoff/constants";
import { isEditableTarget } from "./timeoff/helpers";

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

  // Modal state
  const [showEventModal, setShowEventModal] = useState(false);
  const [editIndex, setEditIndex] = useState(-1);
  const [modalMode, setModalMode] = useState<"add" | "edit" | "view">("add");

  // Event form state
  const [eventType, setEventType] = useState<"range" | "weekly">("range");
  const [eventWeekday, setEventWeekday] = useState(DEFAULT_WEEKDAY);
  const [eventStart, setEventStart] = useState("");
  const [eventEnd, setEventEnd] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [eventFlags, setEventFlags] = useState<EventFlag[]>([]);

  // Raw .hday editor state
  const [rawEditorText, setRawEditorText] = useState(rawText);
  const [rawEditorError, setRawEditorError] = useState("");
  const [isRawEditorDirty, setIsRawEditorDirty] = useState(false);

  // Validation errors
  const [startDateError, setStartDateError] = useState("");
  const [endDateError, setEndDateError] = useState("");

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState(-1);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);

  // Refs
  const formRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = useCallback(() => {
    setEventType("range");
    setEventWeekday(DEFAULT_WEEKDAY);
    setEventStart("");
    setEventEnd("");
    setEventTitle("");
    setEventFlags([]);
    setStartDateError("");
    setEndDateError("");
  }, []);

  const validateForm = (): boolean => {
    let valid = true;

    if (eventType === "range") {
      // Validate start date
      if (!eventStart) {
        setStartDateError("Start date is required");
        valid = false;
      } else if (!isValidDate(eventStart)) {
        setStartDateError("Invalid date (e.g., Feb 30 or April 31)");
        valid = false;
      } else {
        setStartDateError("");
      }

      // Validate end date
      if (eventEnd && !isValidDate(eventEnd)) {
        setEndDateError("Invalid date (e.g., Feb 30 or April 31)");
        valid = false;
      } else if (eventEnd && eventStart && dayjs(eventEnd).isBefore(dayjs(eventStart))) {
        setEndDateError("End date must be after start date");
        valid = false;
      } else {
        setEndDateError("");
      }
    }

    return valid;
  };

  const handleOpenAddModal = useCallback(() => {
    resetForm();
    setEditIndex(-1);
    setModalMode("add");
    setShowEventModal(true);
  }, [resetForm]);

  const prefillFormFromEvent = useCallback((event: HdayEvent) => {
    if (event.type === "range") {
      setEventType("range");
      setEventStart(event.start || "");
      setEventEnd(event.end || "");
      setEventWeekday(DEFAULT_WEEKDAY);
    } else if (event.type === "weekly") {
      setEventType("weekly");
      setEventWeekday(event.weekday || DEFAULT_WEEKDAY);
      setEventStart("");
      setEventEnd("");
    }

    setEventTitle(event.title || "");
    setEventFlags(event.flags || []);
    setStartDateError("");
    setEndDateError("");
  }, []);

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
    setSelectedIndices((prev) =>
      prev.includes(index) ? prev.filter((item) => item !== index) : [...prev, index],
    );
  };

  const handleSelectAll = () => {
    setSelectedIndices(events.map((_, index) => index));
  };

  const handleClearSelection = () => {
    setSelectedIndices([]);
  };

  const handleBulkDeleteConfirm = () => {
    if (selectedIndices.length > 0) {
      deleteEvents(selectedIndices);
      toast.showSuccess(`Deleted ${selectedIndices.length} events`, "🗑️");
    }
    setSelectedIndices([]);
    setShowBulkDeleteConfirm(false);
  };

  useEffect(() => {
    setSelectedIndices((prev) => prev.filter((index) => index >= 0 && index < events.length));
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
      setSelectedIndices([]); // Clear selection after import
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
      setSelectedIndices([]);
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

  // Ref to hold latest handlers to avoid stale closures in keyboard event listener
  const handlersRef = useRef({
    handleCancelEditMode,
    handleExport,
    handleImport,
    handleRedo,
    handleUndo,
  });

  useEffect(() => {
    handlersRef.current = {
      handleCancelEditMode,
      handleExport,
      handleImport,
      handleRedo,
      handleUndo,
    };
  }, [handleCancelEditMode, handleExport, handleImport, handleRedo, handleUndo]);

  const handleTimeOffKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.key === "Escape") {
        if (showEventModal && modalMode === "edit" && editIndex >= 0) {
          event.preventDefault();
          handlersRef.current.handleCancelEditMode();
        }
        return;
      }

      if (event.key === "Delete") {
        if (viewMode === "table" && selectedIndices.length > 0) {
          event.preventDefault();
          setShowBulkDeleteConfirm(true);
        }
        return;
      }

      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase();
        if (key === "z") {
          event.preventDefault();
          if (event.shiftKey) {
            handlersRef.current.handleRedo();
          } else {
            handlersRef.current.handleUndo();
          }
        }
        if (key === "y") {
          event.preventDefault();
          handlersRef.current.handleRedo();
        }
        if (key === "s") {
          event.preventDefault();
          handlersRef.current.handleExport();
        }
        if (key === "i") {
          event.preventDefault();
          handlersRef.current.handleImport();
        }
      }
    },
    [editIndex, modalMode, selectedIndices.length, showEventModal, viewMode],
  );

  useEffect(() => {
    if (!isActive) {
      return;
    }

    document.addEventListener("keydown", handleTimeOffKeyDown);

    return () => {
      document.removeEventListener("keydown", handleTimeOffKeyDown);
    };
  }, [handleTimeOffKeyDown, isActive]);

  const previewLine = buildPreviewLine({
    eventType,
    start: eventStart,
    end: eventEnd,
    weekday: eventWeekday,
    title: eventTitle,
    flags: eventFlags,
  });

  const handleTypeFlagChange = (flag: TypeFlag | "none") => {
    if (flag === "none") {
      setEventFlags((prev) => prev.filter((f) => !TYPE_FLAGS_AS_EVENT_FLAGS.includes(f)));
    } else {
      setEventFlags((prev) => {
        const filtered = prev.filter((f) => !TYPE_FLAGS_AS_EVENT_FLAGS.includes(f));
        return [...filtered, flag];
      });
    }
  };

  const handleTimeFlagChange = (flag: TimeLocationFlag | "none") => {
    if (flag === "none") {
      setEventFlags((prev) => prev.filter((f) => !TIME_LOCATION_FLAGS_AS_EVENT_FLAGS.includes(f)));
    } else {
      setEventFlags((prev) => {
        const filtered = prev.filter((f) => !TIME_LOCATION_FLAGS_AS_EVENT_FLAGS.includes(f));
        return [...filtered, flag];
      });
    }
  };

  return (
    <div className="time-off-view py-3">
      <Card>
        <Card.Header>
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2 mb-2">
            <h5 className="mb-0">
              <i className="bi bi-calendar-check me-2"></i>
              Time Off Management
            </h5>
            <div className="d-flex flex-wrap gap-2">
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={handleUndo}
                disabled={!canUndo}
                aria-label="Undo last change"
              >
                <i className="bi bi-arrow-counterclockwise me-1"></i>
                Undo
              </Button>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={handleRedo}
                disabled={!canRedo}
                aria-label="Redo last change"
              >
                <i className="bi bi-arrow-clockwise me-1"></i>
                Redo
              </Button>
            </div>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <Button
              variant="outline-danger"
              size="sm"
              onClick={() => {
                if (selectedIndices.length === 0) {
                  return;
                }
                setShowBulkDeleteConfirm(true);
              }}
              disabled={selectedIndices.length === 0}
              aria-label="Delete selected events"
            >
              <i className="bi bi-trash me-1"></i>
              Delete Selected
            </Button>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={handleSelectAll}
              disabled={events.length === 0 || selectedIndices.length === events.length}
            >
              Select All
            </Button>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={handleClearSelection}
              disabled={selectedIndices.length === 0}
            >
              Clear Selection
            </Button>
            <Button variant="outline-primary" size="sm" onClick={handleImport}>
              <i className="bi bi-download me-1"></i>
              Import
            </Button>
            <Button variant="outline-primary" size="sm" onClick={handleExport}>
              <i className="bi bi-upload me-1"></i>
              Export
            </Button>
            <Button variant="primary" size="sm" onClick={handleOpenAddModal}>
              <i className="bi bi-plus-lg me-1"></i>
              Add Event
            </Button>
          </div>
        </Card.Header>
        <Card.Body>
          <div className="d-flex flex-wrap align-items-center justify-content-between mb-3 gap-2">
            <ButtonGroup aria-label="Toggle time off view">
              <Button
                variant={viewMode === "table" ? "primary" : "outline-primary"}
                size="sm"
                onClick={() => setViewMode("table")}
              >
                <i className="bi bi-table me-1" aria-hidden="true"></i>
                Table
              </Button>
              <Button
                variant={viewMode === "stats" ? "primary" : "outline-primary"}
                size="sm"
                onClick={() => setViewMode("stats")}
              >
                <i className="bi bi-bar-chart-line me-1" aria-hidden="true"></i>
                Statistics
              </Button>
              <Button
                variant={viewMode === "raw" ? "primary" : "outline-primary"}
                size="sm"
                onClick={() => setViewMode("raw")}
              >
                Raw .hday
                {isRawEditorDirty && viewMode !== "raw" && (
                  <span className="badge bg-warning text-dark ms-1">•</span>
                )}
              </Button>
            </ButtonGroup>
            <span className="text-muted small">{VIEW_MODE_HELP_TEXT[viewMode]}</span>
          </div>

          {viewMode === "table" &&
            (events.length === 0 ? (
              <EmptyState />
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
        message={`Are you sure you want to delete ${selectedIndices.length} selected events? You can undo this with the Undo button or Ctrl+Z.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleBulkDeleteConfirm}
        onCancel={() => setShowBulkDeleteConfirm(false)}
      />
    </div>
  );
}
