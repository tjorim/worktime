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
            <Icon icon={ArrowLeftRightIcon} className="tw:me-2" />
            {m.first_sync_conflict_title()}
          </DialogTitle>
        </DialogHeader>
        <div className="tw:min-h-0 tw:overflow-y-auto tw:p-4" id={bodyId}>
          <p className="tw:text-muted-foreground tw:text-sm tw:mb-2">
            {m.first_sync_conflict_body()}
          </p>

          {counts && (
            <p className="tw:text-sm tw:mb-6">
              {m.first_sync_conflict_counts({
                local: String(counts.local),
                server: String(counts.server),
              })}
            </p>
          )}

          <div className="tw:grid tw:gap-2">
            {/* Keep both option — the only non-destructive choice, so it leads */}
            <button
              type="button"
              className={`tw:rounded-lg tw:border tw:p-4 tw:text-left tw:focus-visible:ring-3 tw:focus-visible:ring-ring/50 ${selected === "keep-both" ? "tw:border-primary tw:bg-primary/5" : "tw:border-border tw:bg-background tw:hover:bg-muted"}`}
              onClick={() => setSelected("keep-both")}
              aria-pressed={selected === "keep-both"}
            >
              <div className="tw:flex tw:items-start tw:gap-4">
                <Icon
                  icon={CombineIcon}
                  className={`tw:text-lg tw:shrink-0 tw:mt-1 ${selected === "keep-both" ? "tw:text-primary" : "tw:text-muted-foreground"}`}
                />
                <div>
                  <div className="tw:font-semibold">{m.first_sync_conflict_keep_both()}</div>
                  <div className="tw:text-muted-foreground tw:text-sm">
                    {m.first_sync_conflict_keep_both_desc()}
                  </div>
                </div>
                {selected === "keep-both" && (
                  <Icon
                    icon={CircleCheckIcon}
                    className="tw:text-primary tw:ms-auto tw:shrink-0 tw:mt-1"
                  />
                )}
              </div>
            </button>

            {/* Keep local option */}
            <button
              type="button"
              className={`tw:rounded-lg tw:border tw:p-4 tw:text-left tw:focus-visible:ring-3 tw:focus-visible:ring-ring/50 ${selected === "keep-local" ? "tw:border-primary tw:bg-primary/5" : "tw:border-border tw:bg-background tw:hover:bg-muted"}`}
              onClick={() => setSelected("keep-local")}
              aria-pressed={selected === "keep-local"}
            >
              <div className="tw:flex tw:items-start tw:gap-4">
                <Icon
                  icon={HardDriveIcon}
                  className={`tw:text-lg tw:shrink-0 tw:mt-1 ${selected === "keep-local" ? "tw:text-primary" : "tw:text-muted-foreground"}`}
                />
                <div>
                  <div className="tw:font-semibold">{m.first_sync_conflict_keep_local()}</div>
                  <div className="tw:text-muted-foreground tw:text-sm">
                    {m.first_sync_conflict_keep_local_desc()}
                  </div>
                </div>
                {selected === "keep-local" && (
                  <Icon
                    icon={CircleCheckIcon}
                    className="tw:text-primary tw:ms-auto tw:shrink-0 tw:mt-1"
                  />
                )}
              </div>
            </button>

            {/* Use server option */}
            <button
              type="button"
              className={`tw:rounded-lg tw:border tw:p-4 tw:text-left tw:focus-visible:ring-3 tw:focus-visible:ring-ring/50 ${selected === "use-server" ? "tw:border-primary tw:bg-primary/5" : "tw:border-border tw:bg-background tw:hover:bg-muted"}`}
              onClick={() => setSelected("use-server")}
              aria-pressed={selected === "use-server"}
            >
              <div className="tw:flex tw:items-start tw:gap-4">
                <Icon
                  icon={CloudDownloadIcon}
                  className={`tw:text-lg tw:shrink-0 tw:mt-1 ${selected === "use-server" ? "tw:text-primary" : "tw:text-muted-foreground"}`}
                />
                <div>
                  <div className="tw:font-semibold">{m.first_sync_conflict_use_server()}</div>
                  <div className="tw:text-muted-foreground tw:text-sm">
                    {m.first_sync_conflict_use_server_desc()}
                  </div>
                </div>
                {selected === "use-server" && (
                  <Icon
                    icon={CircleCheckIcon}
                    className="tw:text-primary tw:ms-auto tw:shrink-0 tw:mt-1"
                  />
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
