import {
  ArrowLeftRight as ArrowLeftRightIcon,
  CircleCheck as CircleCheckIcon,
  CloudDownload as CloudDownloadIcon,
  Combine as CombineIcon,
  HardDrive as HardDriveIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) handleDismiss();
      }}
    >
      <DialogContent aria-describedby={bodyId}>
        <DialogHeader>
          <DialogTitle>
            <Icon icon={ArrowLeftRightIcon} className="me-2" />
            {m.first_sync_conflict_title()}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto p-4" id={bodyId}>
          <p className="text-muted-foreground text-sm mb-2">{m.first_sync_conflict_body()}</p>

          {counts && (
            <p className="text-sm mb-6">
              {m.first_sync_conflict_counts({
                local: String(counts.local),
                server: String(counts.server),
              })}
            </p>
          )}

          <div className="grid gap-2">
            {/* Keep both option — the only non-destructive choice, so it leads */}
            <button
              type="button"
              className={`rounded-lg border p-4 text-left focus-visible:ring-3 focus-visible:ring-ring/50 ${selected === "keep-both" ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-muted"}`}
              onClick={() => setSelected("keep-both")}
              aria-pressed={selected === "keep-both"}
            >
              <div className="flex items-start gap-4">
                <Icon
                  icon={CombineIcon}
                  className={`text-lg shrink-0 mt-1 ${selected === "keep-both" ? "text-primary" : "text-muted-foreground"}`}
                />
                <div>
                  <div className="font-semibold">{m.first_sync_conflict_keep_both()}</div>
                  <div className="text-muted-foreground text-sm">
                    {m.first_sync_conflict_keep_both_desc()}
                  </div>
                </div>
                {selected === "keep-both" && (
                  <Icon icon={CircleCheckIcon} className="text-primary ms-auto shrink-0 mt-1" />
                )}
              </div>
            </button>

            {/* Keep local option */}
            <button
              type="button"
              className={`rounded-lg border p-4 text-left focus-visible:ring-3 focus-visible:ring-ring/50 ${selected === "keep-local" ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-muted"}`}
              onClick={() => setSelected("keep-local")}
              aria-pressed={selected === "keep-local"}
            >
              <div className="flex items-start gap-4">
                <Icon
                  icon={HardDriveIcon}
                  className={`text-lg shrink-0 mt-1 ${selected === "keep-local" ? "text-primary" : "text-muted-foreground"}`}
                />
                <div>
                  <div className="font-semibold">{m.first_sync_conflict_keep_local()}</div>
                  <div className="text-muted-foreground text-sm">
                    {m.first_sync_conflict_keep_local_desc()}
                  </div>
                </div>
                {selected === "keep-local" && (
                  <Icon icon={CircleCheckIcon} className="text-primary ms-auto shrink-0 mt-1" />
                )}
              </div>
            </button>

            {/* Use server option */}
            <button
              type="button"
              className={`rounded-lg border p-4 text-left focus-visible:ring-3 focus-visible:ring-ring/50 ${selected === "use-server" ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-muted"}`}
              onClick={() => setSelected("use-server")}
              aria-pressed={selected === "use-server"}
            >
              <div className="flex items-start gap-4">
                <Icon
                  icon={CloudDownloadIcon}
                  className={`text-lg shrink-0 mt-1 ${selected === "use-server" ? "text-primary" : "text-muted-foreground"}`}
                />
                <div>
                  <div className="font-semibold">{m.first_sync_conflict_use_server()}</div>
                  <div className="text-muted-foreground text-sm">
                    {m.first_sync_conflict_use_server_desc()}
                  </div>
                </div>
                {selected === "use-server" && (
                  <Icon icon={CircleCheckIcon} className="text-primary ms-auto shrink-0 mt-1" />
                )}
              </div>
            </button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={handleDismiss}>
            {m.first_sync_conflict_cancel()}
          </Button>
          <Button variant="default" onClick={handleConfirm} disabled={!selected}>
            {m.first_sync_conflict_confirm()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
