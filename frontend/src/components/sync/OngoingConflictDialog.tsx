import { useId, useState } from "react";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import type { SyncPushPayload } from "@/utils/syncClient";
import * as m from "@/paraglide/messages.js";

type ConflictChoice = "keep-server" | "keep-mine";

interface OngoingConflictDialogProps {
  show: boolean;
  conflictCount: number;
  conflictedPayload: SyncPushPayload | null;
  onResolve: (choice: ConflictChoice) => void;
}

/**
 * Modal dialog shown during ongoing sync when one or more records were
 * overwritten by a newer server version (last-write-wins conflict).
 *
 * The user can:
 *   - Accept the server version → conflict state is cleared, no re-push.
 *   - Keep their own version → conflicted items are re-pushed with a fresh
 *     `client_updated_at` timestamp so they win the next push.
 *
 * The dialog is non-dismissible without a choice to prevent accidental data
 * loss by ambiguous dismissal.
 */
export function OngoingConflictDialog({
  show,
  conflictCount,
  conflictedPayload,
  onResolve,
}: OngoingConflictDialogProps) {
  const bodyId = useId();
  const [selected, setSelected] = useState<ConflictChoice | null>(null);

  const handleConfirm = () => {
    if (!selected) return;
    onResolve(selected);
    setSelected(null);
  };

  // Reset selection when the dialog closes (e.g. via programmatic show toggle).
  const handleHide = () => {
    setSelected(null);
  };

  // Compute per-entity-type conflict counts for the detail section.
  const entityCounts = conflictedPayload
    ? ([
        ["labels", conflictedPayload.labels.length],
        ["tasks", conflictedPayload.tasks.length],
        ["templates", conflictedPayload.templates.length],
        ["work_locations", conflictedPayload.work_locations.length],
        ["time_off_entries", conflictedPayload.time_off_entries.length],
        ["gantt_tasks", conflictedPayload.gantt_tasks.length],
      ] as const).filter(([, count]) => count > 0)
    : [];

  return (
    <Modal show={show} onHide={handleHide} centered aria-describedby={bodyId}>
      <Modal.Header>
        <Modal.Title>
          <i className="bi bi-exclamation-triangle-fill text-warning me-2" aria-hidden="true"></i>
          {m.ongoing_conflict_title({ count: String(conflictCount) })}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body id={bodyId}>
        <p className="text-muted small mb-3">
          {m.ongoing_conflict_body({ count: String(conflictCount) })}
        </p>

        {entityCounts.length > 0 && (
          <ul className="small text-muted mb-4 ps-3">
            {entityCounts.map(([entity, count]) => (
              <li key={entity}>
                {count} {entity.replace(/_/g, " ")}
              </li>
            ))}
          </ul>
        )}

        <div className="d-grid gap-2">
          {/* Keep server version */}
          <button
            type="button"
            className={`btn btn-outline-${selected === "keep-server" ? "primary" : "secondary"} text-start p-3`}
            onClick={() => setSelected("keep-server")}
            aria-pressed={selected === "keep-server"}
          >
            <div className="d-flex align-items-start gap-3">
              <i
                className={`bi bi-cloud-download-fill fs-5 flex-shrink-0 mt-1 ${selected === "keep-server" ? "text-primary" : "text-secondary"}`}
                aria-hidden="true"
              ></i>
              <div>
                <div className="fw-semibold">{m.ongoing_conflict_keep_server()}</div>
                <div className="text-muted small">{m.ongoing_conflict_keep_server_desc()}</div>
              </div>
              {selected === "keep-server" && (
                <i
                  className="bi bi-check-circle-fill text-primary ms-auto flex-shrink-0 mt-1"
                  aria-hidden="true"
                ></i>
              )}
            </div>
          </button>

          {/* Keep my version */}
          <button
            type="button"
            className={`btn btn-outline-${selected === "keep-mine" ? "primary" : "secondary"} text-start p-3`}
            onClick={() => setSelected("keep-mine")}
            aria-pressed={selected === "keep-mine"}
          >
            <div className="d-flex align-items-start gap-3">
              <i
                className={`bi bi-hdd-fill fs-5 flex-shrink-0 mt-1 ${selected === "keep-mine" ? "text-primary" : "text-secondary"}`}
                aria-hidden="true"
              ></i>
              <div>
                <div className="fw-semibold">{m.ongoing_conflict_keep_mine()}</div>
                <div className="text-muted small">{m.ongoing_conflict_keep_mine_desc()}</div>
              </div>
              {selected === "keep-mine" && (
                <i
                  className="bi bi-check-circle-fill text-primary ms-auto flex-shrink-0 mt-1"
                  aria-hidden="true"
                ></i>
              )}
            </div>
          </button>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={() => { onResolve("keep-server"); setSelected(null); }}>
          {m.ongoing_conflict_dismiss()}
        </Button>
        <Button variant="primary" onClick={handleConfirm} disabled={!selected}>
          {m.ongoing_conflict_confirm()}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
