import { useEffect, useId, useMemo, useState } from "react";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import { useOngoingSyncContext } from "@/contexts/OngoingSyncContext";
import { useAuth } from "@/contexts/AuthContext";
import * as m from "@/paraglide/messages.js";
import { dayjs } from "@/utils/dateTimeUtils";

const MS_PER_SECOND = 1_000;

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
  const { isSyncing, lastSyncedAt, outboxCount, hasSyncError, conflictCount, retryAfter } =
    useOngoingSyncContext();

  const isVisible =
    isAuthenticated &&
    (isSyncing || outboxCount > 0 || hasSyncError || conflictCount > 0 || lastSyncedAt !== null);

  // Tick every minute so the "last synced" relative time stays fresh.
  const [, setMinuteTick] = useState(0);
  useEffect(() => {
    if (!lastSyncedAt) return;
    const id = setInterval(() => setMinuteTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [lastSyncedAt]);

  // Tick every second while a back-off window is active so the countdown stays accurate.
  const [, setSecondTick] = useState(0);
  useEffect(() => {
    if (!hasSyncError || retryAfter === null || Date.now() >= retryAfter) return;
    const id = setInterval(() => {
      if (Date.now() >= retryAfter) {
        clearInterval(id);
      }
      setSecondTick((t) => t + 1);
    }, MS_PER_SECOND);
    return () => clearInterval(id);
  }, [hasSyncError, retryAfter]);

  // Icon, label, and variant are stable between minute ticks — memoize them.
  const { icon, label, variant } = useMemo(() => {
    if (hasSyncError) return { icon: "bi-cloud-slash", label: m.sync_indicator_error(), variant: "danger" };
    if (conflictCount > 0) return { icon: "bi-exclamation-triangle", label: m.sync_indicator_conflicts({ count: String(conflictCount) }), variant: "warning" };
    if (isSyncing) return { icon: "bi-arrow-repeat", label: m.sync_indicator_syncing(), variant: "info" };
    if (outboxCount > 0) return { icon: "bi-cloud-upload", label: m.sync_indicator_pending({ count: String(outboxCount) }), variant: "warning" };
    if (lastSyncedAt) return { icon: "bi-cloud-check", label: m.sync_indicator_synced(), variant: "success" };
    return { icon: "bi-cloud", label: "", variant: "secondary" };
  }, [hasSyncError, conflictCount, isSyncing, outboxCount, lastSyncedAt]);

  // Tooltip text is computed fresh every render so fromNow() stays accurate
  // (the minute ticker above drives re-renders for the "synced" state).
  const tooltipText = (() => {
    if (hasSyncError) {
      if (retryAfter !== null) {
        const seconds = Math.max(0, Math.ceil((retryAfter - Date.now()) / MS_PER_SECOND));
        if (seconds > 0) return m.sync_indicator_tooltip_retry_in({ seconds: String(seconds) });
      }
      return m.sync_indicator_tooltip_error();
    }
    if (conflictCount > 0) return m.sync_indicator_tooltip_conflicts({ count: String(conflictCount) });
    if (isSyncing) return null;
    if (outboxCount > 0) return m.sync_indicator_tooltip_pending({ count: String(outboxCount) });
    if (lastSyncedAt) return m.sync_indicator_tooltip_synced_at({ time: dayjs(lastSyncedAt).fromNow() });
    return null;
  })();

  if (!isVisible) return null;

  // Spin only when actively syncing with no error, conflict, or pending items.
  const shouldSpin = isSyncing && !hasSyncError && conflictCount === 0 && outboxCount === 0;

  const indicator = (
    <span
      className={`d-flex align-items-center gap-1 text-${variant} small`}
      aria-label={`${m.sync_indicator_aria_label()}: ${label}`}
      aria-live="polite"
      aria-atomic="true"
      tabIndex={tooltipText ? 0 : undefined}
      aria-describedby={tooltipText ? tooltipId : undefined}
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
      trigger={["hover", "focus", "click"]}
      overlay={<Tooltip id={tooltipId}>{tooltipText}</Tooltip>}
    >
      {indicator}
    </OverlayTrigger>
  );
}
