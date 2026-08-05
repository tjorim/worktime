import { useId, useState } from "react";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import type { ConflictChoice, FirstSyncConflictCounts } from "@/hooks/useFirstSyncFlow";
import * as m from "@/paraglide/messages.js";

interface FirstSyncConflictDialogProps {
  show: boolean;
  onResolve: (choice: ConflictChoice) => void;
  onDismiss: () => void;
  /** Record counts for each side, shown so the choice is not made blind. */
  counts?: FirstSyncConflictCounts | null;
}

/**
 * Modal dialog shown during the first-sync flow when the device has local
 * syncable data and the account already has data on the server.
 *
 * Three options:
 *   - Keep everything → merge both sides, deleting nothing (default)
 *   - Keep local data → upload local records, tombstoning server-only ones
 *   - Use server data → download server records, replacing the local copy
 *
 * "Keep everything" is pre-selected because it is the only option that cannot
 * lose data, and because this dialog appears at most once per device — at the
 * moment the user has the least context for judging what the other two would
 * throw away.  The record counts are shown for the same reason.
 */
export function FirstSyncConflictDialog({
  show,
  onResolve,
  onDismiss,
  counts,
}: FirstSyncConflictDialogProps) {
  const bodyId = useId();
  const [selected, setSelected] = useState<ConflictChoice | null>("keep-both");

  const handleConfirm = () => {
    // Guard is redundant with the disabled button state, but kept for safety.
    if (!selected) return;
    onResolve(selected);
    setSelected("keep-both");
  };

  const handleDismiss = () => {
    setSelected("keep-both");
    onDismiss();
  };

  return (
    <Modal show={show} onHide={handleDismiss} centered aria-describedby={bodyId}>
      <Modal.Header closeButton>
        <Modal.Title>
          <i className="bi bi-arrow-left-right me-2" aria-hidden="true"></i>
          {m.first_sync_conflict_title()}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body id={bodyId}>
        <p className="text-muted small mb-2">{m.first_sync_conflict_body()}</p>

        {counts && (
          <p className="small mb-4">
            {m.first_sync_conflict_counts({
              local: String(counts.local),
              server: String(counts.server),
            })}
          </p>
        )}

        <div className="d-grid gap-2">
          {/* Keep both option — the only non-destructive choice, so it leads */}
          <button
            type="button"
            className={`btn btn-outline-${selected === "keep-both" ? "primary" : "secondary"} text-start p-3`}
            onClick={() => setSelected("keep-both")}
            aria-pressed={selected === "keep-both"}
          >
            <div className="d-flex align-items-start gap-3">
              <i
                className={`bi bi-union fs-5 flex-shrink-0 mt-1 ${selected === "keep-both" ? "text-primary" : "text-secondary"}`}
                aria-hidden="true"
              ></i>
              <div>
                <div className="fw-semibold">{m.first_sync_conflict_keep_both()}</div>
                <div className="text-muted small">{m.first_sync_conflict_keep_both_desc()}</div>
              </div>
              {selected === "keep-both" && (
                <i
                  className="bi bi-check-circle-fill text-primary ms-auto flex-shrink-0 mt-1"
                  aria-hidden="true"
                ></i>
              )}
            </div>
          </button>

          {/* Keep local option */}
          <button
            type="button"
            className={`btn btn-outline-${selected === "keep-local" ? "primary" : "secondary"} text-start p-3`}
            onClick={() => setSelected("keep-local")}
            aria-pressed={selected === "keep-local"}
          >
            <div className="d-flex align-items-start gap-3">
              <i
                className={`bi bi-hdd-fill fs-5 flex-shrink-0 mt-1 ${selected === "keep-local" ? "text-primary" : "text-secondary"}`}
                aria-hidden="true"
              ></i>
              <div>
                <div className="fw-semibold">{m.first_sync_conflict_keep_local()}</div>
                <div className="text-muted small">{m.first_sync_conflict_keep_local_desc()}</div>
              </div>
              {selected === "keep-local" && (
                <i
                  className="bi bi-check-circle-fill text-primary ms-auto flex-shrink-0 mt-1"
                  aria-hidden="true"
                ></i>
              )}
            </div>
          </button>

          {/* Use server option */}
          <button
            type="button"
            className={`btn btn-outline-${selected === "use-server" ? "primary" : "secondary"} text-start p-3`}
            onClick={() => setSelected("use-server")}
            aria-pressed={selected === "use-server"}
          >
            <div className="d-flex align-items-start gap-3">
              <i
                className={`bi bi-cloud-download-fill fs-5 flex-shrink-0 mt-1 ${selected === "use-server" ? "text-primary" : "text-secondary"}`}
                aria-hidden="true"
              ></i>
              <div>
                <div className="fw-semibold">{m.first_sync_conflict_use_server()}</div>
                <div className="text-muted small">{m.first_sync_conflict_use_server_desc()}</div>
              </div>
              {selected === "use-server" && (
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
        <Button variant="secondary" onClick={handleDismiss}>
          {m.first_sync_conflict_cancel()}
        </Button>
        <Button variant="primary" onClick={handleConfirm} disabled={!selected}>
          {m.first_sync_conflict_confirm()}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
