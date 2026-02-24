import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import type { HdayEvent } from "../lib/hday/types";
import { buildPreviewLine, normalizeEventFlags, sortEvents, toLine } from "../lib/hday/parser";
import { useDeveloperOptions } from "../contexts/DeveloperOptionsContext";
import { useEventStore } from "../contexts/EventStoreContext";
import { useSettings } from "../contexts/SettingsContext";
import { useToast } from "../contexts/ToastContext";
import { useEventForm } from "../hooks/useEventForm";
import { useTimeOffKeyboardShortcuts } from "../hooks/useTimeOffKeyboardShortcuts";
import { EventModal } from "./EventModal";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { TeamScheduleView } from "./TeamScheduleView";
import {
  buildEventFormState,
  isEventFormDirty,
  serializeEventFormState,
  serializeEventFormStateFromEvent,
} from "../utils/eventFormState";
import { TimeOffStatsView } from "./timeOff/TimeOffStatsView";
import { TimeOffTableView } from "./timeOff/TimeOffTableView";
import {
  TYPE_FLAG_OPTIONS,
  TIME_LOCATION_FLAG_OPTIONS,
  TYPE_FLAGS_AS_EVENT_FLAGS,
  TIME_LOCATION_FLAGS_AS_EVENT_FLAGS,
  VIEW_MODE_HELP_TEXT,
  TIMEOFF_VIEWS,
  DEFAULT_WEEKDAY,
} from "../data/timeoffConstants";

type ExportGroup = {
  id: string;
  label: string;
  count: number;
  events: HdayEvent[];
};

function ExportDialog({
  show,
  onHide,
  groups,
  onExport,
}: {
  show: boolean;
  onHide: () => void;
  groups: ExportGroup[];
  onExport: (selectedGroups: ExportGroup[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const titleId = useId();

  useEffect(() => {
    if (show) {
      setSelectedIds(new Set(groups.map((g) => g.id)));
    }
  }, [show, groups]);

  const handleToggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectedGroups = groups.filter((g) => selectedIds.has(g.id));
  const totalSelected = selectedGroups.reduce((sum, g) => sum + g.count, 0);
  const allSelected = selectedGroups.length === groups.length;

  const handleExport = () => {
    onExport(selectedGroups);
    onHide();
  };

  return (
    <Modal show={show} onHide={onHide} centered aria-labelledby={titleId}>
      <Modal.Header closeButton>
        <Modal.Title id={titleId}>
          <i className="bi bi-upload me-2" aria-hidden="true"></i>
          Export Time Off Events
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted small mb-3">Select which events to include in the export file.</p>
        <div className="d-flex gap-3 mb-3">
          <Button
            variant="link"
            size="sm"
            className="p-0"
            onClick={() => setSelectedIds(new Set(groups.map((g) => g.id)))}
            disabled={allSelected}
          >
            Select all
          </Button>
          <Button
            variant="link"
            size="sm"
            className="p-0"
            onClick={() => setSelectedIds(new Set())}
            disabled={selectedGroups.length === 0}
          >
            Deselect all
          </Button>
        </div>
        <div className="d-flex flex-column gap-2">
          {groups.map((group) => (
            <Form.Check
              key={group.id}
              type="checkbox"
              id={`export-group-${group.id}`}
              label={group.label}
              checked={selectedIds.has(group.id)}
              onChange={() => handleToggle(group.id)}
            />
          ))}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleExport} disabled={selectedGroups.length === 0}>
          <i className="bi bi-upload me-1" aria-hidden="true"></i>
          Export
          {totalSelected > 0 ? ` (${totalSelected} event${totalSelected !== 1 ? "s" : ""})` : ""}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

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
}

/**
 * Default view mode for Time Off tab when no preference is stored or when stored value is invalid.
 */
const DEFAULT_TIME_OFF_VIEW = TIMEOFF_VIEWS[0]; // "table"

// Type guard to validate viewMode against TIMEOFF_VIEWS
const isValidTimeOffView = (value: unknown): value is (typeof TIMEOFF_VIEWS)[number] => {
  return typeof value === "string" && TIMEOFF_VIEWS.includes(value as any);
};

export function TimeOffView({ isActive = false }: TimeOffViewProps) {
  const {
    rawText,
    events,
    addEvent,
    updateEvent,
    deleteEvent,
    deleteEvents,
    importHday,
    canUndo,
    canRedo,
    undo,
    redo,
  } = useEventStore();
  const { settings, lastUsed, updateVacationAllowance, updateLastTimeOffView } = useSettings();
  const { options } = useDeveloperOptions();
  const toast = useToast();

  const [viewMode, setViewMode] = useState(
    isValidTimeOffView(lastUsed.timeOffView) ? lastUsed.timeOffView : DEFAULT_TIME_OFF_VIEW,
  );

  useEffect(() => {
    if (isValidTimeOffView(viewMode)) {
      updateLastTimeOffView(viewMode);
    }
  }, [updateLastTimeOffView, viewMode]);

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
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [initialFormState, setInitialFormState] = useState("");

  // Raw .hday editor state (kept in sync but not rendered in UI)
  const [rawEditorText, setRawEditorText] = useState(rawText);
  const [isRawEditorDirty, setIsRawEditorDirty] = useState(false);
  const rawEditorTextRef = useRef(rawText);

  // Update ref whenever rawEditorText changes
  useEffect(() => {
    rawEditorTextRef.current = rawEditorText;
  }, [rawEditorText]);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState(-1);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  // Refs
  const formRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isFormDirty = isEventFormDirty(
    buildEventFormState(eventType, eventWeekday, eventStart, eventEnd, eventTitle, eventFlags),
    initialFormState,
  );

  const handleOpenAddModal = useCallback(() => {
    resetForm();
    setInitialFormState(
      serializeEventFormState({
        type: "range",
        weekday: DEFAULT_WEEKDAY,
        start: "",
        end: "",
        title: "",
        flags: [],
      }),
    );
    setEditIndex(-1);
    setModalMode("add");
    setShowEventModal(true);
  }, [resetForm]);

  const loadEventIntoForm = useCallback(
    (event: HdayEvent, mode: "view" | "edit") => {
      prefillFormFromEvent(event);
      setInitialFormState(serializeEventFormStateFromEvent(event, DEFAULT_WEEKDAY));
      setModalMode(mode);
    },
    [prefillFormFromEvent],
  );

  const handleOpenEditModal = (index: number) => {
    const event = events[index];
    if (!event) return;

    setEditIndex(index);
    loadEventIntoForm(event, "edit");
    setShowEventModal(true);
  };

  const handleSwitchToEdit = () => {
    setInitialFormState(
      serializeEventFormState(
        buildEventFormState(eventType, eventWeekday, eventStart, eventEnd, eventTitle, eventFlags),
      ),
    );
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
    loadEventIntoForm(event, "view");
  }, [editIndex, events, loadEventIntoForm]);

  const handleResetForm = () => {
    if (isFormDirty) {
      setShowResetConfirm(true);
      return;
    }
    resetForm();
  };

  const handleConfirmResetForm = () => {
    resetForm();
    setShowResetConfirm(false);
  };

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
      toast.showSuccess(`Event updated successfully`, "bi-pencil-fill");
    } else {
      addEvent(newEvent);
      toast.showSuccess(`Event added successfully`);
    }

    setShowEventModal(false);
    setShowResetConfirm(false);
    resetForm();
  };

  const handleDeleteClick = (index: number) => {
    setDeleteIndex(index);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = () => {
    if (deleteIndex >= 0) {
      deleteEvent(deleteIndex);
      setSelectedIndices(new Set());
      toast.showSuccess("Event deleted successfully", "bi-trash");
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
      toast.showSuccess(`Deleted ${selectedIndices.size} events`, "bi-trash");
    }
    setSelectedIndices(new Set());
    setShowBulkDeleteConfirm(false);
  };

  useEffect(() => {
    setSelectedIndices((prev) => {
      const newSet = new Set<number>();
      let changed = false;
      prev.forEach((index) => {
        if (index >= 0 && index < events.length) {
          newSet.add(index);
        } else {
          changed = true;
        }
      });
      return changed ? newSet : prev;
    });
  }, [events.length]);

  useEffect(() => {
    if (!isRawEditorDirty) {
      setRawEditorText(rawText);
    }
  }, [isRawEditorDirty, rawText]);

  const handleRawEditorChange = useCallback(
    (value: string) => {
      setRawEditorText(value);
      setIsRawEditorDirty(value !== rawText);
    },
    [rawText],
  );

  const handleParseRawEditor = useCallback(() => {
    try {
      // Use the ref to get the current value without adding to dependencies
      importHday(rawEditorTextRef.current);
      setIsRawEditorDirty(false);
      setSelectedIndices(new Set());
      toast.showSuccess("Raw .hday content applied successfully", "bi-check-circle");
    } catch (error) {
      console.error("Failed to parse raw .hday content:", error);
      toast.showError("Failed to parse content. Please check the format.");
    }
  }, [importHday, toast]);

  const handleResetRawEditor = useCallback(() => {
    setRawEditorText(rawText);
    setIsRawEditorDirty(false);
  }, [rawText]);

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
      toast.showSuccess(`Imported ${file.name}`, "bi-download");
    } catch (error) {
      console.error("Failed to import .hday file:", error);
      toast.showError("Failed to import file. Please check the format.");
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const [showExportDialog, setShowExportDialog] = useState(false);

  const exportGroups = useMemo((): ExportGroup[] => {
    const yearMap = new Map<number, typeof events>();
    const weeklyEvents: typeof events = [];
    const unknownEvents: typeof events = [];

    for (const event of events) {
      if (event.type === "range" && event.start) {
        const year = parseInt(event.start.split("/")[0] ?? "", 10);
        if (!isNaN(year)) {
          const bucket = yearMap.get(year) ?? [];
          bucket.push(event);
          yearMap.set(year, bucket);
        } else {
          unknownEvents.push(event);
        }
      } else if (event.type === "weekly") {
        weeklyEvents.push(event);
      } else {
        unknownEvents.push(event);
      }
    }

    const groups: ExportGroup[] = [];

    for (const year of Array.from(yearMap.keys()).sort((a, b) => b - a)) {
      const yearEvents = yearMap.get(year)!;
      groups.push({
        id: `year-${year}`,
        label: `${year} (${yearEvents.length} event${yearEvents.length !== 1 ? "s" : ""})`,
        count: yearEvents.length,
        events: yearEvents,
      });
    }

    if (weeklyEvents.length > 0) {
      groups.push({
        id: "weekly",
        label: `Recurring weekly (${weeklyEvents.length} event${weeklyEvents.length !== 1 ? "s" : ""})`,
        count: weeklyEvents.length,
        events: weeklyEvents,
      });
    }

    if (unknownEvents.length > 0) {
      groups.push({
        id: "unknown",
        label: `Other (${unknownEvents.length} event${unknownEvents.length !== 1 ? "s" : ""})`,
        count: unknownEvents.length,
        events: unknownEvents,
      });
    }

    return groups;
  }, [events]);

  const handleExport = useCallback(() => {
    if (events.length === 0) {
      toast.showError("No events to export");
      return;
    }
    setShowExportDialog(true);
  }, [events.length, toast]);

  const handleExportGroups = useCallback(
    (selectedGroups: ExportGroup[]) => {
      const allEvents = sortEvents(selectedGroups.flatMap((g) => g.events));

      if (allEvents.length === 0) {
        toast.showError("No events to export");
        return;
      }

      let hdayContent: string;
      try {
        hdayContent = allEvents.map((e) => toLine(e)).join("\n") + "\n";
      } catch (error) {
        console.error("Failed to serialize events:", error);
        toast.showError("Failed to export events");
        return;
      }

      // Use a year-specific filename only when exactly one year group is selected
      const yearGroups = selectedGroups.filter((g) => g.id.startsWith("year-"));
      const nonYearGroups = selectedGroups.filter((g) => !g.id.startsWith("year-"));
      const filename =
        yearGroups.length === 1 && nonYearGroups.length === 0
          ? `timeoff-${yearGroups[0]!.id.slice(5)}.hday`
          : "timeoff.hday";

      const blob = new Blob([hdayContent], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.showSuccess(`Exported ${filename}`, "bi-upload");
    },
    [toast],
  );

  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    undo();
    toast.showSuccess("Undo successful", "bi-arrow-counterclockwise");
  }, [canUndo, undo, toast]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    redo();
    toast.showSuccess("Redo successful", "bi-arrow-clockwise");
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

  const handleHideEventModal = () => {
    setShowEventModal(false);
    setShowResetConfirm(false);
  };

  const previewLine = buildPreviewLine({
    eventType,
    start: eventStart,
    end: eventEnd,
    weekday: eventWeekday,
    title: eventTitle,
    flags: eventFlags,
  });

  return (
    <div className="time-off-view py-3 d-flex flex-column gap-3">
      <div className="d-flex flex-column flex-md-row align-items-start align-items-md-center justify-content-between gap-2">
        <ButtonGroup aria-label="Toggle time off view">
          <Button
            variant={viewMode === "table" ? "primary" : "outline-primary"}
            size="sm"
            aria-pressed={viewMode === "table"}
            onClick={() => setViewMode("table")}
          >
            <i className="bi bi-table me-1" aria-hidden="true"></i>
            Table
          </Button>
          <Button
            variant={viewMode === "stats" ? "primary" : "outline-primary"}
            size="sm"
            aria-pressed={viewMode === "stats"}
            onClick={() => setViewMode("stats")}
          >
            <i className="bi bi-bar-chart-line me-1" aria-hidden="true"></i>
            Statistics
          </Button>
          {options.connectionStatus === "connected" && (
            <Button
              variant={viewMode === "team" ? "primary" : "outline-primary"}
              size="sm"
              aria-pressed={viewMode === "team"}
              onClick={() => setViewMode("team")}
            >
              <i className="bi bi-people me-1" aria-hidden="true"></i>
              Team
            </Button>
          )}
        </ButtonGroup>
        <span className="text-muted small">
          {VIEW_MODE_HELP_TEXT[viewMode] ?? VIEW_MODE_HELP_TEXT[DEFAULT_TIME_OFF_VIEW]}
        </span>
      </div>

      {viewMode === "table" && (
        <TimeOffTableView
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
          events={events}
          selectedIndices={selectedIndices}
          onToggleSelection={handleToggleSelection}
          onEditEvent={handleOpenEditModal}
          onDeleteEvent={handleDeleteClick}
          rawEditorText={rawEditorText}
          rawEditorError={undefined}
          isRawEditorDirty={isRawEditorDirty}
          onChangeRawEditorText={handleRawEditorChange}
          onApplyRawEditor={handleParseRawEditor}
          onResetRawEditor={handleResetRawEditor}
        />
      )}

      {viewMode === "stats" && (
        <div role="region" aria-label="Vacation statistics">
          <TimeOffStatsView
            events={events}
            allowance={settings.vacationAllowance}
            onUpdateAllowance={updateVacationAllowance}
          />
        </div>
      )}

      {viewMode === "team" && (
        <div role="region" aria-label="Team schedule viewer">
          <TeamScheduleView />
        </div>
      )}

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
        onHide={handleHideEventModal}
        onEntered={() => formRef.current?.focus()}
        onEventTypeChange={setEventType}
        onEventTitleChange={setEventTitle}
        onEventWeekdayChange={setEventWeekday}
        onStartDateChange={setEventStart}
        onEndDateChange={setEventEnd}
        onTypeFlagChange={handleTypeFlagChange}
        onTimeFlagChange={handleTimeFlagChange}
        onResetForm={handleResetForm}
        onSubmit={handleSubmitEvent}
        onSwitchToEdit={handleSwitchToEdit}
        onCancelEditMode={handleCancelEditMode}
      />

      <ConfirmationDialog
        isOpen={showResetConfirm}
        title="Reset Event Form"
        message="You have unsaved changes. Resetting the form will clear your edits."
        confirmLabel="Reset"
        cancelLabel="Keep Editing"
        variant="warning"
        onConfirm={handleConfirmResetForm}
        onCancel={() => setShowResetConfirm(false)}
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

      <ExportDialog
        show={showExportDialog}
        onHide={() => setShowExportDialog(false)}
        groups={exportGroups}
        onExport={handleExportGroups}
      />
    </div>
  );
}
