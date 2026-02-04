import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Card from "react-bootstrap/Card";
import { VIEW_MODE_HELP_TEXT, type TimeOffViewMode } from "../../data/timeoffConstants";

type TimeOffToolbarProps = {
  // Undo/Redo
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;

  // Selection
  eventCount: number;
  selectedCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkDelete: () => void;

  // Import/Export
  onImport: () => void;
  onExport: () => void;

  // Add event
  onAddEvent: () => void;

  // View mode
  viewMode: TimeOffViewMode;
  onViewModeChange: (mode: TimeOffViewMode) => void;
  isRawEditorDirty: boolean;
};

/**
 * Toolbar component for Time Off Management view.
 * Contains all action buttons, view mode toggle, and help text.
 */
export function TimeOffToolbar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  eventCount,
  selectedCount,
  onSelectAll,
  onClearSelection,
  onBulkDelete,
  onImport,
  onExport,
  onAddEvent,
  viewMode,
  onViewModeChange,
  isRawEditorDirty,
}: TimeOffToolbarProps) {
  return (
    <Card.Header>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
        <h5 className="mb-0">
          <i className="bi bi-calendar-check me-2" aria-hidden="true"></i>
          Time Off Management
        </h5>
        <div className="d-flex flex-wrap gap-2">
          <Button variant="outline-primary" size="sm" onClick={onImport} aria-label="Import events">
            <i className="bi bi-download me-1" aria-hidden="true"></i>
            Import
          </Button>
          <Button variant="outline-primary" size="sm" onClick={onExport} aria-label="Export events">
            <i className="bi bi-upload me-1" aria-hidden="true"></i>
            Export
          </Button>
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Undo last change"
          >
            <i className="bi bi-arrow-counterclockwise me-1" aria-hidden="true"></i>
            Undo
          </Button>
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label="Redo last change"
          >
            <i className="bi bi-arrow-clockwise me-1" aria-hidden="true"></i>
            Redo
          </Button>
        </div>
      </div>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <ButtonGroup aria-label="Toggle time off view">
          <Button
            variant={viewMode === "table" ? "primary" : "outline-primary"}
            size="sm"
            onClick={() => onViewModeChange("table")}
          >
            <i className="bi bi-table me-1" aria-hidden="true"></i>
            Table
          </Button>
          <Button
            variant={viewMode === "stats" ? "primary" : "outline-primary"}
            size="sm"
            onClick={() => onViewModeChange("stats")}
          >
            <i className="bi bi-bar-chart-line me-1" aria-hidden="true"></i>
            Statistics
          </Button>
          <Button
            variant={viewMode === "raw" ? "primary" : "outline-primary"}
            size="sm"
            onClick={() => onViewModeChange("raw")}
          >
            Raw .hday
            {isRawEditorDirty && viewMode !== "raw" && (
              <span className="badge bg-warning text-dark ms-1">•</span>
            )}
          </Button>
        </ButtonGroup>
        <span className="text-muted small">{VIEW_MODE_HELP_TEXT[viewMode]}</span>
      </div>
      <div className="d-flex flex-wrap gap-2">
        {viewMode === "table" && (
          <>
            <Button variant="primary" size="sm" onClick={onAddEvent} aria-label="Add event">
              <i className="bi bi-plus-lg me-1" aria-hidden="true"></i>
              Add Event
            </Button>
            <Button
              variant="outline-danger"
              size="sm"
              onClick={onBulkDelete}
              disabled={selectedCount === 0}
              aria-label="Delete selected events"
            >
              <i className="bi bi-trash me-1" aria-hidden="true"></i>
              Delete Selected
            </Button>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={onSelectAll}
              disabled={eventCount === 0 || selectedCount === eventCount}
              aria-label="Select all events"
            >
              Select All
            </Button>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={onClearSelection}
              disabled={selectedCount === 0}
              aria-label="Clear selection"
            >
              Clear Selection
            </Button>
          </>
        )}
      </div>
    </Card.Header>
  );
}
