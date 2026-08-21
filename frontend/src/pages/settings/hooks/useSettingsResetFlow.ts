import { useState } from "react";
import { labelsCollection, tasksCollection, templatesCollection } from "@/db/collections";
import { getLocale } from "@/paraglide/runtime.js";
import * as m from "@/paraglide/messages.js";
import { logger } from "@/utils/logger";
import { applyPreferencesPull, fetchPreferences, type FetchFn } from "@/utils/syncClient";

interface UseSettingsResetFlowParams {
  resetSettings: () => void;
  clearTimeOffEvents: () => void;
  onHide: () => void;
  showSuccessToast: (message: string, icon?: string) => void;
  showWarningToast: (message: string) => void;
  /** When true and `fetchFn` is provided, a successful reset re-pulls the
   * account's saved preferences afterward — see the comment on the pull call
   * below for why this matters for a signed-in user. */
  isAuthenticated?: boolean;
  fetchFn?: FetchFn | null;
}

function clearCollectionById(collection: {
  toArray: Array<{ id: string }>;
  has: (id: string) => boolean;
  delete: (id: string) => void;
}): void {
  for (const item of [...collection.toArray]) {
    if (collection.has(item.id)) {
      collection.delete(item.id);
    }
  }
}

export function useSettingsResetFlow({
  resetSettings,
  clearTimeOffEvents,
  onHide,
  showSuccessToast,
  showWarningToast,
  isAuthenticated = false,
  fetchFn = null,
}: UseSettingsResetFlowParams) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [clearTimeTrackingData, setClearTimeTrackingData] = useState(false);
  const [clearTimeOffData, setClearTimeOffData] = useState(false);

  const handleClearData = () => {
    setShowResetConfirm(true);
  };

  const handleCloseResetModal = () => {
    setShowResetConfirm(false);
    setClearTimeTrackingData(false);
    setClearTimeOffData(false);
  };

  const handleConfirmReset = () => {
    const listFormat = new Intl.ListFormat(getLocale(), { style: "long", type: "conjunction" });
    let settingsCleared = false;
    let timeTrackingCleared = false;
    let timeOffCleared = false;
    const errors: string[] = [];

    try {
      resetSettings();
      settingsCleared = true;
    } catch (error) {
      logger.error("Failed to reset settings:", error);
      errors.push(m.reset_item_settings());
    }

    // Reset only clears this device's local preferences — it never signs the
    // user out, and it never touches the sync cursor (this device is already
    // established as synced for this account, so useFirstSyncFlow won't run
    // again on its own). Without this, a signed-in user who resets settings
    // gets walked through onboarding from scratch even though their real
    // schedule/team/settings are still saved on the account. Pull them back
    // in the background rather than leaving the device looking unconfigured.
    if (settingsCleared && isAuthenticated && fetchFn) {
      const fetch = fetchFn;
      void fetchPreferences(fetch)
        .then((prefs) => {
          if (prefs) applyPreferencesPull(prefs.data);
        })
        .catch((error: unknown) => {
          logger.error("Failed to restore preferences from account after reset:", error);
        });
    }

    if (clearTimeTrackingData) {
      try {
        clearCollectionById(tasksCollection);
        clearCollectionById(templatesCollection);
        clearCollectionById(labelsCollection);
        timeTrackingCleared = true;
      } catch (error) {
        logger.error("Failed to clear time tracking data:", error);
        errors.push(m.reset_item_time_tracking_data());
      }
    }

    if (clearTimeOffData) {
      try {
        clearTimeOffEvents();
        timeOffCleared = true;
      } catch (error) {
        logger.error("Failed to clear time off data:", error);
        errors.push(m.reset_item_time_off_data());
      }
    }

    handleCloseResetModal();
    onHide();

    const anythingSucceeded = settingsCleared || timeTrackingCleared || timeOffCleared;
    const somethingFailed = errors.length > 0;

    if (anythingSucceeded && !somethingFailed) {
      const parts: string[] = [];
      if (settingsCleared) parts.push(m.reset_item_settings());
      if (timeTrackingCleared) parts.push(m.reset_item_time_tracking_data());
      if (timeOffCleared) parts.push(m.reset_item_time_off_data());
      showSuccessToast(m.data_cleared({ items: listFormat.format(parts) }), "bi-trash");
    } else if (!anythingSucceeded && somethingFailed) {
      showWarningToast(m.failed_to_clear({ items: listFormat.format(errors) }));
    } else if (anythingSucceeded && somethingFailed) {
      const successParts: string[] = [];
      if (settingsCleared) successParts.push(m.reset_item_settings());
      if (timeTrackingCleared) successParts.push(m.reset_item_time_tracking_data());
      if (timeOffCleared) successParts.push(m.reset_item_time_off_data());
      showWarningToast(
        m.cleared_but_failed_to_clear({
          clearedItems: listFormat.format(successParts),
          failedItems: listFormat.format(errors),
        }),
      );
    }
  };

  return {
    showResetConfirm,
    clearTimeTrackingData,
    setClearTimeTrackingData,
    clearTimeOffData,
    setClearTimeOffData,
    handleClearData,
    handleCloseResetModal,
    handleConfirmReset,
  };
}


