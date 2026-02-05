import Card from "react-bootstrap/Card";
import type { HdayEvent } from "../../lib/hday/types";
import { EventTable } from "./EventTable";
import { TimeOffToolbar } from "./TimeOffToolbar";
import type { TimeOffViewMode } from "../../data/timeoffConstants";

type TimeOffTablePanelProps = {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  eventCount: number;
  selectedCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkDelete: () => void;
  onImport: () => void;
  onExport: () => void;
  onAddEvent: () => void;
  viewMode: TimeOffViewMode;
  events: HdayEvent[];
  selectedIndices: Set<number>;
  onToggleSelection: (index: number) => void;
  onEditEvent: (index: number) => void;
  onDeleteEvent: (index: number) => void;
};

export function TimeOffTablePanel({
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
  events,
  selectedIndices,
  onToggleSelection,
  onEditEvent,
  onDeleteEvent,
}: TimeOffTablePanelProps) {
  return (
    <Card>
      <TimeOffToolbar
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={onUndo}
        onRedo={onRedo}
        eventCount={eventCount}
        selectedCount={selectedCount}
        onSelectAll={onSelectAll}
        onClearSelection={onClearSelection}
        onBulkDelete={onBulkDelete}
        onImport={onImport}
        onExport={onExport}
        onAddEvent={onAddEvent}
        viewMode={viewMode}
      />
      <Card.Body>
        {events.length === 0 ? (
          <div className="text-center text-muted py-5">
            <i className="bi bi-calendar-x display-4 d-block mb-3" aria-hidden="true"></i>
            <p>No time-off events yet.</p>
            <p className="small">
              Click "Add Event" to create your first event, or "Import" to load an existing .hday
              file.
            </p>
          </div>
        ) : (
          <EventTable
            events={events}
            selectedIndices={selectedIndices}
            onToggleSelection={onToggleSelection}
            onSelectAll={onSelectAll}
            onClearSelection={onClearSelection}
            onEditEvent={onEditEvent}
            onDeleteEvent={onDeleteEvent}
          />
        )}
      </Card.Body>
    </Card>
  );
}
