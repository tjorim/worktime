import { useEffect, useRef } from "react";
import { usePwaInstall } from "@/contexts/PwaInstallContext";
import { useToast } from "@/contexts/ToastContext";
import * as m from "@/paraglide/messages.js";

const ENGAGEMENT_VISIT_THRESHOLD = 3;
const IN_SESSION_DELAY_MS = 20_000;
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function isPastCooldown(lastPromptedAt: string | null): boolean {
  if (!lastPromptedAt) return true;
  return Date.now() - new Date(lastPromptedAt).getTime() >= COOLDOWN_MS;
}

/**
 * Shows a dismissible toast offering to install the app, but only once the user
 * has shown enough engagement (a few visits, a little time in the current one) and
 * only after the browser has actually offered an install prompt to replay. Skips
 * silently — no toast, ever — when the browser doesn't support installation, the
 * app is already installed, or a previous prompt is still within its cooldown.
 * Renders nothing itself.
 */
export function PwaInstallPrompt() {
  const { canInstall, visitCount, lastPromptedAt, promptInstall, recordAutoPromptShown } =
    usePwaInstall();
  const { addToast, removeToast } = useToast();
  const hasShownRef = useRef(false);

  useEffect(() => {
    if (hasShownRef.current) return;
    if (!canInstall) return;
    if (visitCount < ENGAGEMENT_VISIT_THRESHOLD) return;
    if (!isPastCooldown(lastPromptedAt)) return;

    const timerId = window.setTimeout(() => {
      hasShownRef.current = true;
      recordAutoPromptShown();
      const toastId = addToast({
        message: m.pwa_install_prompt_message(),
        variant: "info",
        icon: "bi-download",
        autohide: false,
        action: {
          label: m.pwa_install_now(),
          onClick: () => {
            void promptInstall();
            removeToast(toastId);
          },
        },
      });
    }, IN_SESSION_DELAY_MS);

    return () => window.clearTimeout(timerId);
  }, [
    canInstall,
    visitCount,
    lastPromptedAt,
    addToast,
    removeToast,
    promptInstall,
    recordAutoPromptShown,
  ]);

  return null;
}
