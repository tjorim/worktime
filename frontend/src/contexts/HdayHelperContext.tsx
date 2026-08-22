import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import {
  HDAY_HELPER_SETTINGS_STORAGE_KEY,
  LEGACY_DEVELOPER_OPTIONS_STORAGE_KEY,
} from "@/constants/storageKeys";

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

const defaultOptions: HdayHelperOptions = {
  hdayHelperUrl: null,
};

const HdayHelperContext = createContext<HdayHelperContextType | null>(null);
const HELPER_CONNECTION_TIMEOUT_MS = 5000;
const HELPER_HEALTH_POLL_MS = 30000;

function readLegacyOptions(): HdayHelperOptions {
  if (typeof window === "undefined" || localStorage.getItem(HDAY_HELPER_SETTINGS_STORAGE_KEY)) {
    return defaultOptions;
  }
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_DEVELOPER_OPTIONS_STORAGE_KEY) ?? "null");
    return {
      hdayHelperUrl:
        legacy && typeof legacy.hdayHelperUrl === "string" ? legacy.hdayHelperUrl : null,
    };
  } catch {
    return defaultOptions;
  }
}

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
  const initialOptions = useMemo(readLegacyOptions, []);
  const [options, setOptions] = useLocalStorage<HdayHelperOptions>(
    HDAY_HELPER_SETTINGS_STORAGE_KEY,
    initialOptions,
  );
  const normalizedOptions: HdayHelperOptions = useMemo(
    () => ({ hdayHelperUrl: options.hdayHelperUrl ?? null }),
    [options.hdayHelperUrl],
  );

  const [helperConnectionStatus, setHelperConnectionStatus] =
    useState<HdayHelperStatus>("disconnected");

  useEffect(() => {
    if (initialOptions.hdayHelperUrl && !localStorage.getItem(HDAY_HELPER_SETTINGS_STORAGE_KEY)) {
      setOptions(initialOptions);
      localStorage.removeItem(LEGACY_DEVELOPER_OPTIONS_STORAGE_KEY);
    }
  }, [initialOptions, setOptions]);

  const updateHdayHelperUrl = useCallback(
    (url: string | null) => {
      setOptions((prev) => ({ ...prev, hdayHelperUrl: url || null }));
      setHelperConnectionStatus("disconnected");
    },
    [setOptions],
  );

  const testHdayHelperConnection = useCallback(
    async (url: string): Promise<boolean> => {
      const normalizedUrl = url.trim().replace(/\/+$/, "");
      if (!normalizedUrl) {
        setHelperConnectionStatus("disconnected");
        return false;
      }

      setHelperConnectionStatus((current) => (current === "connected" ? current : "connecting"));
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), HELPER_CONNECTION_TIMEOUT_MS);
      try {
        const response = await fetch(`${normalizedUrl}/health`, {
          method: "GET",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          setHelperConnectionStatus("error");
          return false;
        }
        setOptions((prev) =>
          prev.hdayHelperUrl === normalizedUrl ? prev : { ...prev, hdayHelperUrl: normalizedUrl },
        );
        setHelperConnectionStatus("connected");
        return true;
      } catch {
        setHelperConnectionStatus("error");
        return false;
      } finally {
        clearTimeout(timeoutId);
      }
    },
    [setOptions],
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
    return () => clearInterval(intervalId);
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
