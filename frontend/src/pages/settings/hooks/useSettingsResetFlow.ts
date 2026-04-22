import { useState } from "react";
import { labelsCollection, tasksCollection, templatesCollection } from "@/db/collections";
import { getLocale } from "@/paraglide/runtime.js";
import * as m from "@/paraglide/messages.js";

interface CollectionWithIds {
  toArray: Array<{ id: string }>;
  has: (id: string) => boolean;
  delete: (id: string) => void;
}

interface ToastLike {
  showSuccess: (message: string, icon?: string) => void;
  showWarning: (message: string, icon?: string) => void;
}

interface UseSettingsResetFlowParams {
  clearTimeOffEvents: () => void;
  onHide: () => void;
  resetSettings: () => void;
  toast: ToastLike;
}

function clearCollectionById(collection: CollectionWithIds): void {
  for (const item of [...collection.toArray]) {
    if (collection.has(item.id)) {
      collection.delete(item.id);
    }
  }
}

export function useSettingsResetFlow({
  clearTimeOffEvents,
  onHide,
  resetSettings,
  toast,
}: UseSettingsResetFlowParams) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [clearTimeTrackingData, setClearTimeTrackingData] = useState(false);
  const [clearTimeOffData, setClearTimeOffData] = useState(false);

  const handleOpenResetConfirm = () => {
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
      console.error("Failed to reset settings:", error);
      errors.push(m.reset_item_settings());
    }

    if (clearTimeTrackingData) {
      try {
        clearCollectionById(tasksCollection);
        clearCollectionById(templatesCollection);
        clearCollectionById(labelsCollection);
        timeTrackingCleared = true;
      } catch (error) {
        console.error("Failed to clear time tracking data:", error);
        errors.push(m.reset_item_time_tracking_data());
      }
    }

    if (clearTimeOffData) {
      try {
        clearTimeOffEvents();
        timeOffCleared = true;
      } catch (error) {
        console.error("Failed to clear time off data:", error);
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
      toast.showSuccess(m.data_cleared({ items: listFormat.format(parts) }), "bi-trash");
    } else if (!anythingSucceeded && somethingFailed) {
      toast.showWarning(m.failed_to_clear({ items: listFormat.format(errors) }));
    } else if (anythingSucceeded && somethingFailed) {
      const successParts: string[] = [];
      if (settingsCleared) successParts.push(m.reset_item_settings());
      if (timeTrackingCleared) successParts.push(m.reset_item_time_tracking_data());
      if (timeOffCleared) successParts.push(m.reset_item_time_off_data());
      toast.showWarning(
        m.cleared_but_failed_to_clear({
          clearedItems: listFormat.format(successParts),
          failedItems: listFormat.format(errors),
        }),
      );
    }
  };

  return {
    clearTimeOffData,
    clearTimeTrackingData,
    handleCloseResetModal,
    handleConfirmReset,
    handleOpenResetConfirm,
    setClearTimeOffData,
    setClearTimeTrackingData,
    showResetConfirm,
  };
}
