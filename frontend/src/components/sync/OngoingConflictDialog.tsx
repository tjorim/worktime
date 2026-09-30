import {
  CircleCheck as CircleCheckIcon,
  CloudDownload as CloudDownloadIcon,
  HardDrive as HardDriveIcon,
  TriangleAlert as TriangleAlertIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { useId, useState } from "react";
import Button from "react-bootstrap/Button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
 *   - Dismiss → treated as accepting the server version (equivalent to
 *     "Keep server version").
 */
export function OngoingConflictDialog({
  show,
  conflictCount,
  conflictedPayload,
  onResolve,
}: OngoingConflictDialogProps) {
  const bodyId = useId();
  const [selected, setSelected] = useState<ConflictChoice | null>(null);

  // Reset selection when the dialog is closed programmatically (show → false).
  // React-Bootstrap's onHide only fires on user-driven closes (backdrop/Escape),
  // not when the parent flips show={false} directly. Handled as a same-render
  // response rather than a follow-up effect.
  const [prevShow, setPrevShow] = useState(show);
  if (prevShow !== show) {
    setPrevShow(show);
    if (!show) {
      setSelected(null);
    }
  }

  const handleConfirm = () => {
    if (!selected) return;
    onResolve(selected);
    setSelected(null);
  };

  // Backdrop and Escape are disabled below, so this only runs if react-bootstrap
  // closes the modal some other way. It deliberately does *not* resolve the
  // conflict: dismissal used to be mapped to "keep-server", which meant a stray
  // Escape keypress silently discarded the user's local edits for every
  // conflicted record. Discarding data has to be something the user picked.
  const handleHide = () => {
    setSelected(null);
  };

  // Map each entity key to a localized display label.
  const entityLabels: Record<string, () => string> = {
    labels: m.ongoing_conflict_entity_labels,
    tasks: m.ongoing_conflict_entity_tasks,
    templates: m.ongoing_conflict_entity_templates,
    work_locations: m.ongoing_conflict_entity_work_locations,
    time_off_entries: m.ongoing_conflict_entity_time_off_entries,
    gantt_tasks: m.ongoing_conflict_entity_gantt_tasks,
  };
  const getEntityLabel = (entity: string) =>
    (entityLabels[entity] ?? (() => entity.replace(/_/g, " ")))();

  // Compute per-entity-type conflict counts for the detail section.
  const entityCounts = conflictedPayload
    ? (
        [
          ["labels", conflictedPayload.labels.length],
          ["tasks", conflictedPayload.tasks.length],
          ["templates", conflictedPayload.templates.length],
          ["work_locations", conflictedPayload.work_locations.length],
          ["time_off_entries", conflictedPayload.time_off_entries.length],
          ["gantt_tasks", conflictedPayload.gantt_tasks.length],
        ] as const
      ).filter(([, count]) => count > 0)
    : [];

  return (
    <Dialog
      open={show}
      onOpenChange={(open, details) => {
        if (!open && details.reason !== "escape-key") handleHide();
      }}
      disablePointerDismissal
    >
      <DialogContent aria-describedby={bodyId} showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            <Icon icon={TriangleAlertIcon} className="text-warning me-2" />
            {conflictCount === 1
              ? m.ongoing_conflict_title_one({ count: String(conflictCount) })
              : m.ongoing_conflict_title_other({ count: String(conflictCount) })}
          </DialogTitle>
        </DialogHeader>
        <div className="modal-body" id={bodyId}>
          <p className="text-muted small mb-3">
            {conflictCount === 1
              ? m.ongoing_conflict_body_one({ count: String(conflictCount) })
              : m.ongoing_conflict_body_other({ count: String(conflictCount) })}
          </p>

          {entityCounts.length > 0 && (
            <ul className="small text-muted mb-4 ps-3">
              {entityCounts.map(([entity, count]) => (
                <li key={entity}>
                  {count} {getEntityLabel(entity)}
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
                <Icon
                  icon={CloudDownloadIcon}
                  className={`fs-5 flex-shrink-0 mt-1 ${selected === "keep-server" ? "text-primary" : "text-secondary"}`}
                />
                <div>
                  <div className="fw-semibold">{m.ongoing_conflict_keep_server()}</div>
                  <div className="text-muted small">{m.ongoing_conflict_keep_server_desc()}</div>
                </div>
                {selected === "keep-server" && (
                  <Icon
                    icon={CircleCheckIcon}
                    className="text-primary ms-auto flex-shrink-0 mt-1"
                  />
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
                <Icon
                  icon={HardDriveIcon}
                  className={`fs-5 flex-shrink-0 mt-1 ${selected === "keep-mine" ? "text-primary" : "text-secondary"}`}
                />
                <div>
                  <div className="fw-semibold">{m.ongoing_conflict_keep_mine()}</div>
                  <div className="text-muted small">{m.ongoing_conflict_keep_mine_desc()}</div>
                </div>
                {selected === "keep-mine" && (
                  <Icon
                    icon={CircleCheckIcon}
                    className="text-primary ms-auto flex-shrink-0 mt-1"
                  />
                )}
              </div>
            </button>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => {
              onResolve("keep-server");
              setSelected(null);
            }}
          >
            {m.ongoing_conflict_dismiss()}
          </Button>
          <Button variant="primary" onClick={handleConfirm} disabled={!selected}>
            {m.ongoing_conflict_confirm()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
