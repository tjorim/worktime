import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDevicePreferences } from "@/hooks/useDevicePreferences";

export type HdayHelperStatus = "disconnected" | "connecting" | "connected" | "error";

export interface HdayHelperOptions {
  hdayHelperUrl: string | null; // URL of the local .hday helper server
}

interface HdayHelperContextType {
  options: HdayHelperOptions;
  helperConnectionStatus: HdayHelperStatus;
  updateHdayHelperUrl: (url: string | null) => void;
  testHdayHelperConnection: (url: string) => Promise<boolean>;
}

const HdayHelperContext = createContext<HdayHelperContextType | null>(null);
const HELPER_CONNECTION_TIMEOUT_MS = 5000;
const HELPER_HEALTH_POLL_MS = 30000;

export function useHdayHelper(): HdayHelperContextType {
  const context = useContext(HdayHelperContext);
  if (!context) {
    throw new Error("useHdayHelper must be used within a HdayHelperProvider");
  }
  return context;
}

interface HdayHelperProviderProps {
  children: ReactNode;
}

export function HdayHelperProvider({ children }: HdayHelperProviderProps) {
  const { preferences, setPreferences } = useDevicePreferences();
  const normalizedOptions: HdayHelperOptions = useMemo(
    () => ({ hdayHelperUrl: preferences?.hdayHelper?.url ?? null }),
    [preferences?.hdayHelper?.url],
  );
  const setHelperUrl = useCallback(
    (url: string | null) => {
      setPreferences((current) => ({ ...current, hdayHelper: { url } }));
    },
    [setPreferences],
  );

  const [helperConnectionStatus, setHelperConnectionStatus] =
    useState<HdayHelperStatus>("disconnected");
  const probeIdRef = useRef(0);
  const probeControllerRef = useRef<AbortController | null>(null);

  const updateHdayHelperUrl = useCallback(
    (url: string | null) => {
      probeIdRef.current += 1;
      probeControllerRef.current?.abort();
      probeControllerRef.current = null;
      setHelperUrl(url || null);
      setHelperConnectionStatus("disconnected");
    },
    [setHelperUrl],
  );

  const testHdayHelperConnection = useCallback(
    async (url: string): Promise<boolean> => {
      const normalizedUrl = url.trim().replace(/\/+$/, "");
      const probeId = ++probeIdRef.current;
      probeControllerRef.current?.abort();
      if (!normalizedUrl) {
        setHelperConnectionStatus("disconnected");
        return false;
      }

      setHelperConnectionStatus((current) => (current === "connected" ? current : "connecting"));
      const controller = new AbortController();
      probeControllerRef.current = controller;
      const timeoutId = window.setTimeout(() => controller.abort(), HELPER_CONNECTION_TIMEOUT_MS);
      try {
        const response = await fetch(`${normalizedUrl}/health`, {
          method: "GET",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (probeId !== probeIdRef.current) return false;
        if (!response.ok) {
          setHelperConnectionStatus("error");
          return false;
        }
        if (normalizedOptions.hdayHelperUrl !== normalizedUrl) setHelperUrl(normalizedUrl);
        setHelperConnectionStatus("connected");
        return true;
      } catch {
        if (probeId !== probeIdRef.current) return false;
        setHelperConnectionStatus("error");
        return false;
      } finally {
        clearTimeout(timeoutId);
        if (probeId === probeIdRef.current) probeControllerRef.current = null;
      }
    },
    [normalizedOptions.hdayHelperUrl, setHelperUrl],
  );

  // A saved URL is only configuration, not proof that the helper is still up.
  // Probe immediately and periodically while configured; Team disappears if
  // the helper later becomes unhealthy and returns after a successful probe.
  useEffect(() => {
    const helperUrl = normalizedOptions.hdayHelperUrl;
    if (!helperUrl) {
      setHelperConnectionStatus("disconnected");
      return;
    }

    void testHdayHelperConnection(helperUrl);
    const intervalId = window.setInterval(
      () => void testHdayHelperConnection(helperUrl),
      HELPER_HEALTH_POLL_MS,
    );
    return () => {
      clearInterval(intervalId);
      probeIdRef.current += 1;
      probeControllerRef.current?.abort();
      probeControllerRef.current = null;
    };
  }, [normalizedOptions.hdayHelperUrl, testHdayHelperConnection]);

  const contextValue = useMemo(
    () => ({
      options: normalizedOptions,
      helperConnectionStatus,
      updateHdayHelperUrl,
      testHdayHelperConnection,
    }),
    [normalizedOptions, helperConnectionStatus, updateHdayHelperUrl, testHdayHelperConnection],
  );

  return <HdayHelperContext.Provider value={contextValue}>{children}</HdayHelperContext.Provider>;
}
