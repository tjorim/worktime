import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useToast } from "@/contexts/ToastContext";
import * as m from "@/paraglide/messages.js";
import { logger } from "@/utils/logger";

/**
 * Registers the app's service worker and, once a new version has been
 * precached in the background, shows a persistent toast with a "Reload"
 * action to activate it. Renders nothing itself.
 */
export function PwaUpdateToast() {
  const { addToast, removeToast } = useToast();

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      logger.error("Service worker registration failed:", error);
    },
  });

  useEffect(() => {
    if (!needRefresh) return;

    const toastId = addToast({
      message: m.pwa_update_available(),
      variant: "info",
      icon: "bi-arrow-clockwise",
      autohide: false,
      action: {
        label: m.pwa_update_reload(),
        onClick: () => {
          void updateServiceWorker(true);
        },
      },
    });

    return () => {
      removeToast(toastId);
    };
  }, [needRefresh, addToast, removeToast, updateServiceWorker]);

  return null;
}
