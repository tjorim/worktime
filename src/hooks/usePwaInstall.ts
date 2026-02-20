import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../contexts/ToastContext";
import { useLocalStorage } from "./useLocalStorage";
import type { BeforeInstallPromptEvent, InstallPromptResult } from "../types/pwa";

const INSTALL_STATE_KEY = "worktime_pwa_install_state";
const MS_PER_MINUTE = 60 * 1000;
const DISMISS_COOLDOWN_DAYS = 7;

type InstallState = {
  visits: number;
  totalUsageMs: number;
  lastVisitAt: number | null;
  lastDismissedAt: number | null;
  hasInstalled: boolean;
};

const defaultInstallState: InstallState = {
  visits: 0,
  totalUsageMs: 0,
  lastVisitAt: null,
  lastDismissedAt: null,
  hasInstalled: false,
};

const sanitizeInstallState = (state: unknown): InstallState => {
  const parsed = typeof state === "object" && state !== null ? (state as Partial<InstallState>) : {};

  return {
    visits: Number.isFinite(parsed.visits) ? Math.max(0, Number(parsed.visits)) : 0,
    totalUsageMs: Number.isFinite(parsed.totalUsageMs) ? Math.max(0, Number(parsed.totalUsageMs)) : 0,
    lastVisitAt: Number.isFinite(parsed.lastVisitAt) ? Number(parsed.lastVisitAt) : null,
    lastDismissedAt: Number.isFinite(parsed.lastDismissedAt) ? Number(parsed.lastDismissedAt) : null,
    hasInstalled: parsed.hasInstalled === true,
  };
};

const hasMetEngagementThreshold = (state: InstallState) =>
  state.visits >= 3 || state.totalUsageMs >= 2 * MS_PER_MINUTE;

const hasDismissCooldownElapsed = (state: InstallState) => {
  if (!state.lastDismissedAt) return true;
  const cooldownEndsAt = state.lastDismissedAt + DISMISS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  return dayjs().valueOf() >= cooldownEndsAt;
};

export function usePwaInstall() {
  const toast = useToast();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [storedInstallState, setStoredInstallState] = useLocalStorage<InstallState>(
    INSTALL_STATE_KEY,
    defaultInstallState,
  );
  const installState = useMemo(() => sanitizeInstallState(storedInstallState), [storedInstallState]);
  const installStateRef = useRef(installState);

  useEffect(() => {
    installStateRef.current = installState;
  }, [installState]);

  const updateInstallState = useCallback(
    (updater: (prev: InstallState) => InstallState) => {
      setStoredInstallState((prevRaw) => {
        const previous = sanitizeInstallState(prevRaw);
        const next = sanitizeInstallState(updater(previous));
        installStateRef.current = next;
        return next;
      });
    },
    [setStoredInstallState],
  );

  const refreshInstallState = useCallback(() => {
    const sanitized = sanitizeInstallState(installStateRef.current);
    installStateRef.current = sanitized;
    setStoredInstallState(sanitized);
  }, [setStoredInstallState]);

  useEffect(() => {
    const now = dayjs().valueOf();
    const state = installStateRef.current;
    const visitCounted = !state.lastVisitAt || now - state.lastVisitAt > 12 * 60 * 60 * 1000;

    updateInstallState((current) => ({
      ...current,
      visits: visitCounted ? current.visits + 1 : current.visits,
      lastVisitAt: now,
    }));

    let usageStartTime = now;
    const usageInterval = window.setInterval(() => {
      const increment = dayjs().valueOf() - usageStartTime;
      usageStartTime = dayjs().valueOf();
      updateInstallState((current) => ({
        ...current,
        totalUsageMs: current.totalUsageMs + increment,
      }));
    }, MS_PER_MINUTE);

    return () => {
      clearInterval(usageInterval);
      const finalIncrement = dayjs().valueOf() - usageStartTime;
      updateInstallState((current) => ({
        ...current,
        totalUsageMs: current.totalUsageMs + Math.max(0, finalIncrement),
      }));
    };
  }, [updateInstallState]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      updateInstallState((current) => ({
        ...current,
        hasInstalled: true,
      }));
      setDeferredPrompt(null);
      toast.showSuccess("Worktime installed successfully.", "bi-phone");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, [toast, updateInstallState]);

  const canAutoPrompt = useMemo(() => {
    return (
      !!deferredPrompt &&
      !installState.hasInstalled &&
      hasMetEngagementThreshold(installState) &&
      hasDismissCooldownElapsed(installState)
    );
  }, [deferredPrompt, installState]);

  const promptInstall = useCallback(
    async (source: "auto" | "manual"): Promise<InstallPromptResult> => {
      if (!deferredPrompt) {
        if (source === "manual") {
          toast.showInfo("Install prompt is unavailable right now in this browser.", "bi-download");
        }
        return "unavailable";
      }

      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;

        if (choice.outcome === "accepted") {
          updateInstallState((current) => ({
            ...current,
            hasInstalled: true,
          }));
          setDeferredPrompt(null);
          toast.showSuccess("Installing Worktime…", "bi-download");
          return "accepted";
        }

        updateInstallState((current) => ({
          ...current,
          lastDismissedAt: dayjs().valueOf(),
        }));
        setDeferredPrompt(null);
        toast.showInfo("Install dismissed. We will remind you again in a week.", "bi-clock");
        return "dismissed";
      } catch (error) {
        console.error("PWA install prompt failed:", error);
        toast.showError("Could not open install prompt.", "bi-x-circle");
        return "error";
      }
    },
    [deferredPrompt, toast, updateInstallState],
  );

  return {
    canAutoPrompt,
    hasDeferredPrompt: deferredPrompt !== null,
    isInstallSupported: typeof window !== "undefined" && "BeforeInstallPromptEvent" in window,
    promptInstall,
    refreshInstallState,
  };
}
