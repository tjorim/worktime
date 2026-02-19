import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "../contexts/ToastContext";
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

const readState = (): InstallState => {
  try {
    const raw = localStorage.getItem(INSTALL_STATE_KEY);
    if (!raw) return defaultInstallState;
    const parsed = JSON.parse(raw) as Partial<InstallState>;
    return {
      visits: Number.isFinite(parsed.visits) ? Math.max(0, Number(parsed.visits)) : 0,
      totalUsageMs: Number.isFinite(parsed.totalUsageMs)
        ? Math.max(0, Number(parsed.totalUsageMs))
        : 0,
      lastVisitAt: Number.isFinite(parsed.lastVisitAt) ? Number(parsed.lastVisitAt) : null,
      lastDismissedAt: Number.isFinite(parsed.lastDismissedAt)
        ? Number(parsed.lastDismissedAt)
        : null,
      hasInstalled: parsed.hasInstalled === true,
    };
  } catch {
    return defaultInstallState;
  }
};

const writeState = (state: InstallState) => {
  localStorage.setItem(INSTALL_STATE_KEY, JSON.stringify(state));
};

const hasMetEngagementThreshold = (state: InstallState) =>
  state.visits >= 3 || state.totalUsageMs >= 2 * MS_PER_MINUTE;

const hasDismissCooldownElapsed = (state: InstallState) => {
  if (!state.lastDismissedAt) return true;
  const cooldownEndsAt = state.lastDismissedAt + DISMISS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() >= cooldownEndsAt;
};

export function usePwaInstall() {
  const toast = useToast();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installState, setInstallState] = useState<InstallState>(defaultInstallState);

  const refreshInstallState = useCallback(() => {
    setInstallState(readState());
  }, []);

  useEffect(() => {
    const now = Date.now();
    const state = readState();
    const visitCounted = !state.lastVisitAt || now - state.lastVisitAt > 12 * 60 * 60 * 1000;
    const updatedState = {
      ...state,
      visits: visitCounted ? state.visits + 1 : state.visits,
      lastVisitAt: now,
    };

    writeState(updatedState);
    setInstallState(updatedState);

    let usageStartTime = now;
    const usageInterval = window.setInterval(() => {
      const current = readState();
      const increment = Date.now() - usageStartTime;
      usageStartTime = Date.now();
      const next = {
        ...current,
        totalUsageMs: current.totalUsageMs + increment,
      };
      writeState(next);
      setInstallState(next);
    }, MS_PER_MINUTE);

    return () => {
      clearInterval(usageInterval);
      const current = readState();
      const finalIncrement = Date.now() - usageStartTime;
      const next = {
        ...current,
        totalUsageMs: current.totalUsageMs + Math.max(0, finalIncrement),
      };
      writeState(next);
      setInstallState(next);
    };
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      const current = readState();
      const next = {
        ...current,
        hasInstalled: true,
      };
      writeState(next);
      setInstallState(next);
      setDeferredPrompt(null);
      toast.showSuccess("Worktime installed successfully.", "bi-phone");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, [toast]);

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
        const current = readState();

        if (choice.outcome === "accepted") {
          const next = {
            ...current,
            hasInstalled: true,
          };
          writeState(next);
          setInstallState(next);
          setDeferredPrompt(null);
          toast.showSuccess("Installing Worktime…", "bi-download");
          return "accepted";
        }

        const next = {
          ...current,
          lastDismissedAt: Date.now(),
        };
        writeState(next);
        setInstallState(next);
        setDeferredPrompt(null);
        toast.showInfo("Install dismissed. We will remind you again in a week.", "bi-clock");
        return "dismissed";
      } catch (error) {
        console.error("PWA install prompt failed:", error);
        toast.showError("Could not open install prompt.", "bi-x-circle");
        return "error";
      }
    },
    [deferredPrompt, toast],
  );

  return {
    canAutoPrompt,
    hasDeferredPrompt: deferredPrompt !== null,
    isInstallSupported: typeof window !== "undefined" && "BeforeInstallPromptEvent" in window,
    promptInstall,
    refreshInstallState,
  };
}
