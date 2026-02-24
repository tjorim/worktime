import { memo } from "react";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Dropdown from "react-bootstrap/Dropdown";
import type { TimeOffViewMode } from "../../data/timeoffConstants";

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
  onExportYear: (year: number | "all") => void;
  availableYears: number[];

  // Add event
  onAddEvent: () => void;

  // View mode
  viewMode: TimeOffViewMode;
};

/**
 * Toolbar component for Time Off Management view.
 * Contains all action buttons and table-only controls.
 * Memoized to prevent unnecessary re-renders from parent prop changes.
 */
function TimeOffToolbarComponent({
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
  onExportYear,
  availableYears,
  onAddEvent,
  viewMode,
}: TimeOffToolbarProps) {
  return (
    <Card.Header>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
        <span className="fw-semibold">
          <i className="bi bi-calendar-check me-2" aria-hidden="true"></i>
          Time Off Management
        </span>
        <div className="d-flex flex-wrap gap-2">
          <Button variant="outline-primary" size="sm" onClick={onImport} aria-label="Import events">
            <i className="bi bi-download me-1" aria-hidden="true"></i>
            Import
          </Button>
          <Dropdown as="span">
            <Dropdown.Toggle
              variant="outline-primary"
              size="sm"
              aria-label="Export events"
              id="export-dropdown"
            >
              <i className="bi bi-upload me-1" aria-hidden="true"></i>
              Export
            </Dropdown.Toggle>
            <Dropdown.Menu>
              <Dropdown.Item onClick={() => onExportYear("all")}>All years</Dropdown.Item>
              {availableYears.length > 0 && <Dropdown.Divider />}
              {availableYears.map((year) => (
                <Dropdown.Item key={year} onClick={() => onExportYear(year)}>
                  {year}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>
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

export const TimeOffToolbar = memo(TimeOffToolbarComponent);
TimeOffToolbar.displayName = "TimeOffToolbar";
