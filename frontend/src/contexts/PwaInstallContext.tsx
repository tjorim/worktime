import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { PWA_INSTALL_STATE_STORAGE_KEY } from "@/constants/storageKeys";
import { logger } from "@/utils/logger";

/** Not yet part of TypeScript's DOM lib. */
interface BeforeInstallPromptEvent extends Event {
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

interface PwaInstallState {
  visitCount: number;
  installed: boolean;
  lastPromptedAt: string | null;
}

const defaultPwaInstallState: PwaInstallState = {
  visitCount: 0,
  installed: false,
  lastPromptedAt: null,
};

export type PwaInstallOutcome = "accepted" | "dismissed" | "unavailable";

interface PwaInstallContextType {
  /** A beforeinstallprompt event is available and the app isn't already installed. */
  canInstall: boolean;
  isInstalled: boolean;
  visitCount: number;
  lastPromptedAt: string | null;
  /** Triggers the native install prompt. Resolves with the outcome. */
  promptInstall: () => Promise<PwaInstallOutcome>;
  /** Records that an automatic prompt was shown, starting the re-prompt cooldown. */
  recordAutoPromptShown: () => void;
}

const PwaInstallContext = createContext<PwaInstallContextType | undefined>(undefined);

function isRunningStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari never fires beforeinstallprompt/appinstalled; it exposes this instead.
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

interface PwaInstallProviderProps {
  children: ReactNode;
}

/**
 * Captures the browser's `beforeinstallprompt` event so it can be replayed later —
 * either automatically, once the user has shown enough engagement, or manually from
 * Settings — and tracks whether the app is already installed.
 */
export function PwaInstallProvider({ children }: PwaInstallProviderProps) {
  const [state, setState] = useLocalStorage<PwaInstallState>(
    PWA_INSTALL_STATE_STORAGE_KEY,
    defaultPwaInstallState,
  );
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [hasDeferredPrompt, setHasDeferredPrompt] = useState(false);
  const hasCountedVisitRef = useRef(false);

  // Some browsers let the user install without ever firing beforeinstallprompt/appinstalled
  // (e.g. an existing installed session). Detect that directly so we never show install UI.
  useEffect(() => {
    if (isRunningStandalone() && !state.installed) {
      setState((prev) => ({ ...prev, installed: true }));
    }
    // Only needs to run once per mount; state.installed is read, not depended on, to avoid
    // re-running every time this same effect sets it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hasCountedVisitRef.current) return;
    hasCountedVisitRef.current = true;
    setState((prev) => ({ ...prev, visitCount: prev.visitCount + 1 }));
  }, [setState]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
      setHasDeferredPrompt(true);
    };
    const handleAppInstalled = () => {
      deferredPromptRef.current = null;
      setHasDeferredPrompt(false);
      setState((prev) => ({ ...prev, installed: true }));
      logger.info("PWA installed");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [setState]);

  const promptInstall = useCallback(async (): Promise<PwaInstallOutcome> => {
    const deferred = deferredPromptRef.current;
    if (!deferred) return "unavailable";

    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferredPromptRef.current = null;
    setHasDeferredPrompt(false);
    if (outcome === "accepted") {
      setState((prev) => ({ ...prev, installed: true }));
      logger.info("PWA install accepted");
    } else {
      logger.info("PWA install dismissed");
    }
    return outcome;
  }, [setState]);

  const recordAutoPromptShown = useCallback(() => {
    setState((prev) => ({ ...prev, lastPromptedAt: new Date().toISOString() }));
  }, [setState]);

  const contextValue = useMemo<PwaInstallContextType>(
    () => ({
      canInstall: hasDeferredPrompt && !state.installed,
      isInstalled: state.installed,
      visitCount: state.visitCount,
      lastPromptedAt: state.lastPromptedAt,
      promptInstall,
      recordAutoPromptShown,
    }),
    [
      hasDeferredPrompt,
      state.installed,
      state.visitCount,
      state.lastPromptedAt,
      promptInstall,
      recordAutoPromptShown,
    ],
  );

  return <PwaInstallContext.Provider value={contextValue}>{children}</PwaInstallContext.Provider>;
}

/**
 * Accesses the PWA install context.
 *
 * @throws {Error} If used outside a PwaInstallProvider.
 */
export function usePwaInstall(): PwaInstallContextType {
  const context = useContext(PwaInstallContext);
  if (context === undefined) {
    throw new Error("usePwaInstall must be used within a PwaInstallProvider");
  }
  return context;
}
