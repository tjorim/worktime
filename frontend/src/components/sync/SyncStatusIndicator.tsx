import { useMemo } from "react";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import { useId } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useOngoingSyncContext } from "@/contexts/OngoingSyncContext";
import { useAuth } from "@/contexts/AuthContext";
import * as m from "@/paraglide/messages.js";

dayjs.extend(relativeTime);

/**
 * Compact sync status indicator shown in the application header.
 *
 * Renders only when the user is authenticated and there is something meaningful
 * to show (active sync, queued changes, errors, conflicts, or a last-sync
 * timestamp).
 *
 * Priority order (highest wins):
 *  1. Error — last flush-and-pull failed
 *  2. Conflicts — last push had records reverted to server version
 *  3. Syncing — a network operation is in flight
 *  4. Pending — outbox has queued changes
 *  5. Synced — normal idle state with a known last-sync time
 */
export function SyncStatusIndicator() {
  const tooltipId = useId();
  const { isAuthenticated } = useAuth();
  const { isSyncing, lastSyncedAt, outboxCount, hasSyncError, conflictCount } =
    useOngoingSyncContext();

  const isVisible =
    isAuthenticated &&
    (isSyncing || outboxCount > 0 || hasSyncError || conflictCount > 0 || lastSyncedAt !== null);

  const { icon, label, variant, tooltipText } = useMemo(() => {
    if (hasSyncError) {
      return {
        icon: "bi-cloud-slash",
        label: m.sync_indicator_error(),
        variant: "danger",
        tooltipText: m.sync_indicator_tooltip_error(),
      };
    }
    if (conflictCount > 0) {
      return {
        icon: "bi-exclamation-triangle",
        label: m.sync_indicator_conflicts({ count: String(conflictCount) }),
        variant: "warning",
        tooltipText: m.sync_indicator_tooltip_conflicts({ count: String(conflictCount) }),
      };
    }
    if (isSyncing) {
      return {
        icon: "bi-arrow-repeat",
        label: m.sync_indicator_syncing(),
        variant: "info",
        tooltipText: null,
      };
    }
    if (outboxCount > 0) {
      return {
        icon: "bi-cloud-upload",
        label: m.sync_indicator_pending({ count: String(outboxCount) }),
        variant: "warning",
        tooltipText: m.sync_indicator_tooltip_pending({ count: String(outboxCount) }),
      };
    }
    if (lastSyncedAt) {
      const timeAgo = dayjs(lastSyncedAt).fromNow();
      return {
        icon: "bi-cloud-check",
        label: m.sync_indicator_synced(),
        variant: "success",
        tooltipText: m.sync_indicator_tooltip_synced_at({ time: timeAgo }),
      };
    }
    return { icon: "bi-cloud", label: "", variant: "secondary", tooltipText: null };
  }, [hasSyncError, conflictCount, isSyncing, outboxCount, lastSyncedAt]);

  if (!isVisible) return null;

  // Spin only when actively syncing with no error, conflict, or pending items.
  const shouldSpin = isSyncing && !hasSyncError && conflictCount === 0 && outboxCount === 0;

  const indicator = (
    <span
      className={`d-flex align-items-center gap-1 text-${variant} small`}
      aria-label={`${m.sync_indicator_aria_label()}: ${label}`}
      aria-live="polite"
      aria-atomic="true"
    >
      <i
        className={`bi ${icon}${shouldSpin ? " sync-spin" : ""}`}
        aria-hidden="true"
      />
      <span className="d-none d-sm-inline">{label}</span>
    </span>
  );

  if (!tooltipText) return indicator;

  return (
    <OverlayTrigger
      placement="bottom"
      overlay={<Tooltip id={tooltipId}>{tooltipText}</Tooltip>}
    >
      {indicator}
    </OverlayTrigger>
  );
}
