import { memo } from "react";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Spinner from "react-bootstrap/Spinner";
import type { TimeOffViewMode } from "@/data/timeoffConstants";
import * as m from "@/paraglide/messages.js";

type TimeOffToolbarProps = {
  // Selection
  eventCount: number;
  selectedCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkDelete: () => void;

  // Import/Export
  onImport: () => void;
  onExport: () => void;
  onPullFromHelper?: () => void;
  isPullingFromHelper: boolean;
  onPushToHelper?: () => void;
  isPushingToHelper: boolean;

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
  eventCount,
  selectedCount,
  onSelectAll,
  onClearSelection,
  onBulkDelete,
  onImport,
  onExport,
  onPullFromHelper,
  isPullingFromHelper,
  onPushToHelper,
  isPushingToHelper,
  onAddEvent,
  viewMode,
}: TimeOffToolbarProps) {
  return (
    <Card.Header>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
        <span className="fw-semibold">
          <i className="bi bi-calendar-check me-2" aria-hidden="true"></i>
          {m.timeoff_management_heading()}
        </span>
        <div className="d-flex flex-wrap gap-2">
          {viewMode === "table" && (
            <Button
              variant="primary"
              size="sm"
              onClick={onAddEvent}
              aria-label={m.timeoff_add_event_aria()}
            >
              <i className="bi bi-plus-lg me-1" aria-hidden="true"></i>
              {m.timeoff_add_event_btn()}
            </Button>
          )}
          <Button
            variant="outline-primary"
            size="sm"
            onClick={onImport}
            aria-label={m.timeoff_import_events_aria()}
          >
            <i className="bi bi-download me-1" aria-hidden="true"></i>
            {m.timeoff_import_btn()}
          </Button>
          {onPullFromHelper && (
            <Button
              variant="outline-primary"
              size="sm"
              onClick={onPullFromHelper}
              disabled={isPullingFromHelper}
              aria-label={m.timeoff_pull_events_aria()}
            >
              {isPullingFromHelper ? (
                <Spinner animation="border" size="sm" className="me-1" />
              ) : (
                <i className="bi bi-cloud-download me-1" aria-hidden="true"></i>
              )}
              {m.timeoff_pull_btn()}
            </Button>
          )}
          {onPushToHelper && (
            <Button
              variant="outline-primary"
              size="sm"
              onClick={onPushToHelper}
              disabled={isPushingToHelper}
              aria-label={m.timeoff_push_events_aria()}
            >
              {isPushingToHelper ? (
                <Spinner animation="border" size="sm" className="me-1" />
              ) : (
                <i className="bi bi-cloud-upload me-1" aria-hidden="true"></i>
              )}
              {m.timeoff_push_btn()}
            </Button>
          )}
          {eventCount > 0 && (
            <Button
              variant="outline-primary"
              size="sm"
              onClick={onExport}
              aria-label={m.timeoff_export_events_aria()}
            >
              <i className="bi bi-upload me-1" aria-hidden="true"></i>
              {m.timeoff_export_btn()}
            </Button>
          )}
        </div>
      </div>
      {viewMode === "table" && selectedCount > 0 && (
        <div className="d-flex flex-wrap gap-2">
          <Button
            variant="outline-danger"
            size="sm"
            onClick={onBulkDelete}
            aria-label={m.timeoff_delete_selected_events_aria()}
          >
            <i className="bi bi-trash me-1" aria-hidden="true"></i>
            {m.timeoff_delete_selected_btn()}
          </Button>
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={onSelectAll}
            disabled={selectedCount === eventCount}
            aria-label={m.timeoff_select_all_events_aria()}
          >
            {m.timeoff_select_all_btn()}
          </Button>
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={onClearSelection}
            aria-label={m.timeoff_clear_selection_aria()}
          >
            {m.timeoff_clear_selection_btn()}
          </Button>
        </div>
      )}
    </Card.Header>
  );
}

export const TimeOffToolbar = memo(TimeOffToolbarComponent);
TimeOffToolbar.displayName = "TimeOffToolbar";
