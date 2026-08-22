import { useCallback, useEffect, useRef, useState } from "react";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import { normalizeEventFlags } from "@/lib/hday/flags";
import { buildPreviewLine } from "@/lib/hday/serializer";
import {
  buildTimeOffEntryForRange,
  createWeeklyTimeOffEntry,
  getEntryTimeFlagFromDisplayFlags,
  getEntryTypeFromDisplayFlags,
} from "@/lib/timeOff/codecs";
import { useEventStore } from "@/contexts/EventStoreContext";
import { useHdayHelper } from "@/contexts/HdayHelperContext";
import { useLastUsed } from "@/contexts/LastUsedContext";
import { useToast } from "@/contexts/ToastContext";
import { useEventForm } from "@/hooks/useEventForm";
import { useTimeOffKeyboardShortcuts } from "@/hooks/useTimeOffKeyboardShortcuts";
import { EventModal } from "./EventModal";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { TeamScheduleView } from "./TeamScheduleView";
import {
  buildEventFormState,
  isEventFormDirty,
  serializeEventFormState,
  serializeEventFormStateFromEntry,
} from "@/utils/eventFormState";
import { TimeOffStatsView } from "./timeOff/TimeOffStatsView";
import { TimeOffTableView } from "./timeOff/TimeOffTableView";
import {
  getTypeFlagOptions,
  getTimeLocationFlagOptions,
  TYPE_FLAGS_AS_EVENT_FLAGS,
  TIME_LOCATION_FLAGS_AS_EVENT_FLAGS,
  getViewModeHelpText,
  TIMEOFF_VIEWS,
  DEFAULT_WEEKDAY,
} from "@/data/timeoffConstants";
import * as m from "@/paraglide/messages.js";
import { logger } from "@/utils/logger";

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
  addEventRequest?: number;
}

/**
 * Default view mode for Time Off tab when no preference is stored or when stored value is invalid.
 */
const DEFAULT_TIME_OFF_VIEW = TIMEOFF_VIEWS[0]; // "table"

// Type guard to validate viewMode against TIMEOFF_VIEWS
const isValidTimeOffView = (value: unknown): value is (typeof TIMEOFF_VIEWS)[number] => {
  return typeof value === "string" && TIMEOFF_VIEWS.includes(value as any);
};

export function TimeOffView({ isActive = false, addEventRequest = 0 }: TimeOffViewProps) {
  const { options: hdayHelperOptions, helperConnectionStatus } = useHdayHelper();
  const helpText = getViewModeHelpText();
  const { rawText, entries, addEntries, updateEntry, deleteEntry, deleteEntries, importHday } =
    useEventStore();
  const { lastUsed, updateLastTimeOffView } = useLastUsed();
  const toast = useToast();

  const [viewMode, setViewMode] = useState(
    isValidTimeOffView(lastUsed.timeOffView) ? lastUsed.timeOffView : DEFAULT_TIME_OFF_VIEW,
  );
  const previousHelperStatusRef = useRef(helperConnectionStatus);
  const hasCompletedInitialHelperProbeRef = useRef(!hdayHelperOptions.hdayHelperUrl);

  // Do not leave a previously loaded Team schedule visible after the local
  // helper becomes unhealthy. The Team button is health-gated, so its view
  // must follow the same rule.
  useEffect(() => {
    const wasConnected = previousHelperStatusRef.current === "connected";
    previousHelperStatusRef.current = helperConnectionStatus;
    const initialProbeFailed =
      !hasCompletedInitialHelperProbeRef.current && helperConnectionStatus === "error";
    if (helperConnectionStatus === "connected" || helperConnectionStatus === "error") {
      hasCompletedInitialHelperProbeRef.current = true;
    }
    const helperLossConfirmed = wasConnected && helperConnectionStatus !== "connected";
    if (
      viewMode === "team" &&
      (!hdayHelperOptions.hdayHelperUrl || initialProbeFailed || helperLossConfirmed)
    ) {
      setViewMode(DEFAULT_TIME_OFF_VIEW);
      if (wasConnected) {
        toast.showWarning(m.team_helper_unavailable_toast(), "bi-plug");
      }
    }
  }, [hdayHelperOptions.hdayHelperUrl, helperConnectionStatus, toast, viewMode]);

  // Skip the initial run: viewMode is already initialized from lastUsed.timeOffView,
  // so persisting it back on mount would be a no-op write that still bumps the shared
  // preferences blob's _updatedAt — making local state look newer than it really is
  // and winning last-write-wins reconciliation against genuinely newer server data.
  const isInitialTimeOffViewRender = useRef(true);
  useEffect(() => {
    if (isInitialTimeOffViewRender.current) {
      isInitialTimeOffViewRender.current = false;
      return;
    }
    if (hasCompletedInitialHelperProbeRef.current && isValidTimeOffView(viewMode)) {
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
    prefillFormFromEntry,
    handleTypeFlagChange,
    handleTimeFlagChange,
  } = useEventForm();

  // Modal state
  const [showEventModal, setShowEventModal] = useState(false);
  const [editEntryId, setEditEntryId] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<"add" | "edit" | "view">("add");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [initialFormState, setInitialFormState] = useState("");

  // Raw .hday adapter state for the explicit import/export panel.
  // The canonical runtime data remains `entries`; this text is just the editable codec surface.
  const [rawEditorText, setRawEditorText] = useState(rawText);
  const [isRawEditorDirty, setIsRawEditorDirty] = useState(false);
  const [rawEditorError, setRawEditorError] = useState<string | undefined>(undefined);
  const [rawEditorSkippedLines, setRawEditorSkippedLines] = useState<string[]>([]);
  const rawEditorTextRef = useRef(rawText);

  // Update ref whenever rawEditorText changes
  useEffect(() => {
    rawEditorTextRef.current = rawEditorText;
  }, [rawEditorText]);

  // Bulk delete keeps a confirmation dialog (higher stakes); single deletes are
  // immediate with an undo toast.
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
    setEditEntryId(null);
    setModalMode("add");
    setShowEventModal(true);
  }, [resetForm]);
  const handledAddEventRequest = useRef(0);

  useEffect(() => {
    if (addEventRequest === 0 || addEventRequest === handledAddEventRequest.current) return;
    handledAddEventRequest.current = addEventRequest;
    handleOpenAddModal();
  }, [addEventRequest, handleOpenAddModal]);

  const loadEntryIntoForm = useCallback(
    (entryId: string, mode: "view" | "edit") => {
      const entry = entries.find((currentEntry) => currentEntry.id === entryId);
      if (!entry) return;
      prefillFormFromEntry(entry);
      setInitialFormState(serializeEventFormStateFromEntry(entry, DEFAULT_WEEKDAY));
      setModalMode(mode);
    },
    [entries, prefillFormFromEntry],
  );

  const handleOpenEditModal = (entryId: string) => {
    setEditEntryId(entryId);
    loadEntryIntoForm(entryId, "edit");
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
    if (!editEntryId) {
      return;
    }
    loadEntryIntoForm(editEntryId, "view");
  }, [editEntryId, loadEntryIntoForm]);

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
      toast.showError(m.timeoff_fix_validation());
      return;
    }

    const normalizedFlags = normalizeEventFlags(eventFlags);

    const nextEntry =
      eventType === "weekly"
        ? createWeeklyTimeOffEntry({
            weekday: eventWeekday,
            note: eventTitle,
            entryType: getEntryTypeFromDisplayFlags(normalizedFlags),
            entryFlag: getEntryTimeFlagFromDisplayFlags(normalizedFlags),
          })
        : buildTimeOffEntryForRange({
            start: eventStart.replace(/\//g, "-"),
            end: (eventEnd || eventStart).replace(/\//g, "-"),
            note: eventTitle,
            entryType: getEntryTypeFromDisplayFlags(normalizedFlags),
            entryFlag: getEntryTimeFlagFromDisplayFlags(normalizedFlags),
          });

    if (editEntryId) {
      updateEntry(editEntryId, nextEntry);
      toast.showSuccess(m.timeoff_event_updated(), "bi-pencil-fill");
    } else {
      addEntries([nextEntry]);
      toast.showSuccess(m.timeoff_event_added());
    }

    setShowEventModal(false);
    setShowResetConfirm(false);
    resetForm();
  };

  const handleDeleteClick = (entryId: string) => {
    const entry = entries.find((currentEntry) => currentEntry.id === entryId);
    if (!entry) return;
    // Act immediately, then offer an undo — re-adding restores the same entry id
    // via the existing store API, so no duplicate or conflicting entry is created.
    deleteEntry(entryId);
    setSelectedIds(new Set());
    toast.showUndo(m.timeoff_event_deleted(), () => addEntries([entry]));
  };

  const handleToggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(entries.map((entry) => entry.id)));
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleBulkDeleteConfirm = () => {
    if (selectedIds.size > 0) {
      // Capture the entries before deleting so undo can restore them exactly.
      const removedEntries = entries.filter((entry) => selectedIds.has(entry.id));
      deleteEntries(Array.from(selectedIds));
      toast.showUndo(m.timeoff_events_deleted({ count: removedEntries.length }), () =>
        addEntries(removedEntries),
      );
    }
    setSelectedIds(new Set());
    setShowBulkDeleteConfirm(false);
  };

  useEffect(() => {
    setSelectedIds((prev) => {
      const newSet = new Set<string>();
      const existingIds = new Set(entries.map((entry) => entry.id));
      let changed = false;
      prev.forEach((id) => {
        if (existingIds.has(id)) {
          newSet.add(id);
        } else {
          changed = true;
        }
      });
      return changed ? newSet : prev;
    });
  }, [entries]);

  useEffect(() => {
    if (!isRawEditorDirty) {
      setRawEditorText(rawText);
      setRawEditorError(undefined);
    }
  }, [isRawEditorDirty, rawText]);

  const handleRawEditorChange = useCallback(
    (value: string) => {
      setRawEditorText(value);
      setIsRawEditorDirty(value !== rawText);
      setRawEditorError(undefined);
    },
    [rawText],
  );

  const handleParseRawEditor = useCallback(() => {
    try {
      // Use the ref to get the current value without adding to dependencies
      const result = importHday(rawEditorTextRef.current);
      setIsRawEditorDirty(false);
      setRawEditorError(undefined);
      setRawEditorSkippedLines(result.skippedLines);
      setSelectedIds(new Set());
      if (result.skippedLines.length > 0) {
        const skippedMsg =
          result.skippedLines.length === 1
            ? m.timeoff_hday_skipped_one()
            : m.timeoff_hday_skipped_other({ count: result.skippedLines.length });
        toast.showWarning(`${m.timeoff_hday_applied()} ${skippedMsg}`, "bi-exclamation-triangle");
      } else {
        toast.showSuccess(m.timeoff_hday_applied(), "bi-check-circle");
      }
    } catch (error) {
      logger.error("Failed to parse raw .hday content:", error);
      setRawEditorError(m.timeoff_parse_failed());
      toast.showError(m.timeoff_parse_failed());
    }
  }, [importHday, toast]);

  const handleResetRawEditor = useCallback(() => {
    setRawEditorText(rawText);
    setIsRawEditorDirty(false);
    setRawEditorError(undefined);
    setRawEditorSkippedLines([]);
  }, [rawText]);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const result = importHday(text);
      setRawEditorText(text);
      setSelectedIds(new Set()); // Clear selection after import
      setIsRawEditorDirty(false); // Reset raw editor dirty state
      setRawEditorError(undefined);
      setRawEditorSkippedLines(result.skippedLines);
      if (result.skippedLines.length > 0) {
        const skippedMsg =
          result.skippedLines.length === 1
            ? m.timeoff_hday_skipped_one()
            : m.timeoff_hday_skipped_other({ count: result.skippedLines.length });
        toast.showWarning(
          `${m.timeoff_imported({ name: file.name })} ${skippedMsg}`,
          "bi-exclamation-triangle",
        );
      } else {
        toast.showSuccess(m.timeoff_imported({ name: file.name }), "bi-download");
      }
    } catch (error) {
      logger.error("Failed to import .hday file:", error);
      setRawEditorError(m.timeoff_import_failed());
      toast.showError(m.timeoff_import_failed());
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleExport = useCallback(() => {
    if (entries.length === 0) {
      toast.showError(m.timeoff_no_events_export());
      return;
    }

    const blob = new Blob([rawText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "timeoff.hday";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.showSuccess(m.timeoff_exported(), "bi-upload");
  }, [entries, rawText, toast]);

  // Use custom hook for keyboard shortcuts
  useTimeOffKeyboardShortcuts(
    {
      onImport: handleImport,
      onExport: handleExport,
      onBulkDelete: () => setShowBulkDeleteConfirm(true),
      onCancelEditMode: handleCancelEditMode,
    },
    {
      isActive,
      showEventModal,
      modalMode,
      editIndex: editEntryId ? 0 : -1,
      viewMode,
      selectedIndicesCount: selectedIds.size,
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
        <ButtonGroup className="view-toggle-group" aria-label={m.timeoff_toggle_view_aria()}>
          <Button
            variant={viewMode === "table" ? "primary" : "outline-primary"}
            size="sm"
            aria-pressed={viewMode === "table"}
            onClick={() => setViewMode("table")}
          >
            <i className="bi bi-table me-1" aria-hidden="true"></i>
            {m.timeoff_view_table()}
          </Button>
          <Button
            variant={viewMode === "stats" ? "primary" : "outline-primary"}
            size="sm"
            aria-pressed={viewMode === "stats"}
            onClick={() => setViewMode("stats")}
          >
            <i className="bi bi-bar-chart-line me-1" aria-hidden="true"></i>
            {m.timeoff_view_statistics()}
          </Button>
          {helperConnectionStatus === "connected" && (
            <Button
              variant={viewMode === "team" ? "primary" : "outline-primary"}
              size="sm"
              aria-pressed={viewMode === "team"}
              onClick={() => setViewMode("team")}
            >
              <i className="bi bi-people me-1" aria-hidden="true"></i>
              {m.timeoff_view_team()}
            </Button>
          )}
        </ButtonGroup>
        {(viewMode !== "table" || entries.length > 0) && (
          <span className="text-muted small">
            {helpText[viewMode] ?? helpText[DEFAULT_TIME_OFF_VIEW]}
          </span>
        )}
      </div>

      {viewMode === "table" && (
        <TimeOffTableView
          eventCount={entries.length}
          selectedCount={selectedIds.size}
          onSelectAll={handleSelectAll}
          onClearSelection={handleClearSelection}
          onBulkDelete={() => setShowBulkDeleteConfirm(true)}
          onImport={handleImport}
          onExport={handleExport}
          onAddEvent={handleOpenAddModal}
          viewMode={viewMode}
          entries={entries}
          selectedIds={selectedIds}
          onToggleSelection={handleToggleSelection}
          onEditEvent={handleOpenEditModal}
          onDeleteEvent={handleDeleteClick}
          rawEditorText={rawEditorText}
          rawEditorError={rawEditorError}
          rawEditorSkippedLines={rawEditorSkippedLines}
          isRawEditorDirty={isRawEditorDirty}
          onChangeRawEditorText={handleRawEditorChange}
          onApplyRawEditor={handleParseRawEditor}
          onResetRawEditor={handleResetRawEditor}
        />
      )}

      {viewMode === "stats" && (
        <div role="region" aria-label={m.timeoff_vacation_stats()}>
          <TimeOffStatsView entries={entries} />
        </div>
      )}

      {viewMode === "team" && (
        <div role="region" aria-label={m.timeoff_team_schedule_viewer_aria()}>
          <TeamScheduleView />
        </div>
      )}

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".hday,text/plain"
        className="d-none"
        aria-label={m.timeoff_import_file_aria()}
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
        typeFlagOptions={getTypeFlagOptions()}
        timeLocationFlagOptions={getTimeLocationFlagOptions()}
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
        title={m.timeoff_reset_form_title()}
        message={m.timeoff_reset_form_message()}
        confirmLabel={m.timeoff_reset_btn()}
        cancelLabel={m.timeoff_keep_editing()}
        variant="warning"
        onConfirm={handleConfirmResetForm}
        onCancel={() => setShowResetConfirm(false)}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showBulkDeleteConfirm}
        title={m.timeoff_delete_selected_title()}
        message={m.timeoff_delete_selected_message({ count: selectedIds.size })}
        confirmLabel={m.delete()}
        cancelLabel={m.cancel()}
        variant="danger"
        onConfirm={handleBulkDeleteConfirm}
        onCancel={() => setShowBulkDeleteConfirm(false)}
      />
    </div>
  );
}
