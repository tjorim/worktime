import { useEffect, useId, useState } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import type { HdayEvent } from "../../lib/hday/types";

export type ExportGroup = {
  id: string;
  label: string;
  count: number;
  events: HdayEvent[];
};

interface ExportDialogProps {
  show: boolean;
  onHide: () => void;
  groups: ExportGroup[];
  onExport: (selectedGroups: ExportGroup[]) => void;
}

/**
 * Dialog for selecting which event groups to include when exporting .hday data.
 * Groups are derived from the available event data (years, recurring, unknown).
 * All groups are pre-selected when the dialog opens.
 */
export function ExportDialog({ show, onHide, groups, onExport }: ExportDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const titleId = useId();

  // Pre-select all groups whenever the dialog opens
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
