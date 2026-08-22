import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { dayjs } from "@/utils/dateTimeUtils";
import { DEVELOPER_OPTIONS_STORAGE_KEY } from "@/constants/storageKeys";
import { logger } from "@/utils/logger";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface DeveloperOptions {
  enabled: boolean;
  /** Same-origin Worktime backend health status; unrelated to the local .hday helper. */
  connectionStatus: ConnectionStatus;
  lastConnectionTest: number | null; // timestamp
  autoConnect: boolean;
  isDevMode: boolean; // Persist dev mode visibility
  hdayHelperUrl: string | null; // URL of the local .hday helper server
}

interface DeveloperOptionsContextType {
  options: DeveloperOptions;
  isDevMode: boolean;
  helperConnectionStatus: ConnectionStatus;
  updateAutoConnect: (autoConnect: boolean) => void;
  updateHdayHelperUrl: (url: string | null) => void;
  testHdayHelperConnection: (url: string) => Promise<boolean>;
  toggleDevMode: () => void;
  testConnection: () => Promise<boolean>;
  disconnect: () => void;
}

const defaultOptions: DeveloperOptions = {
  enabled: false,
  connectionStatus: "disconnected",
  lastConnectionTest: null,
  autoConnect: false,
  isDevMode: false,
  hdayHelperUrl: null,
};

const DeveloperOptionsContext = createContext<DeveloperOptionsContextType | null>(null);
const HELPER_CONNECTION_TIMEOUT_MS = 5000;
const HELPER_HEALTH_POLL_MS = 30000;

export function useDeveloperOptions(): DeveloperOptionsContextType {
  const context = useContext(DeveloperOptionsContext);
  if (!context) {
    throw new Error("useDeveloperOptions must be used within a DeveloperOptionsProvider");
  }
  return context;
}

interface DeveloperOptionsProviderProps {
  children: ReactNode;
}

export function DeveloperOptionsProvider({ children }: DeveloperOptionsProviderProps) {
  const [options, setOptions] = useLocalStorage<DeveloperOptions>(
    DEVELOPER_OPTIONS_STORAGE_KEY,
    defaultOptions,
  );
  const normalizedOptions: DeveloperOptions = useMemo(
    () => ({
      ...defaultOptions,
      ...options,
    }),
    [options],
  );

  // Use persisted isDevMode from options
  const [isDevMode, setIsDevMode] = useState(normalizedOptions.isDevMode);
  const [helperConnectionStatus, setHelperConnectionStatus] =
    useState<ConnectionStatus>("disconnected");

  // Sync isDevMode changes to localStorage
  useEffect(() => {
    setOptions((prev) => ({
      ...prev,
      isDevMode,
    }));
  }, [isDevMode, setOptions]);

  // Reset connectionStatus to disconnected on mount to avoid stale status
  useEffect(() => {
    setOptions((prev) => ({
      ...prev,
      connectionStatus: "disconnected",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (normalizedOptions.enabled && normalizedOptions.autoConnect) {
      testConnection();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount

  const updateAutoConnect = useCallback(
    (autoConnect: boolean) => {
      setOptions((prev) => ({ ...prev, autoConnect }));
    },
    [setOptions],
  );

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

  const toggleDevMode = useCallback(() => {
    setIsDevMode((prev) => !prev);
  }, []);

  const testConnection = useCallback(
    async (): Promise<boolean> => {
      setOptions((prev) => ({ ...prev, connectionStatus: "connecting" }));

      let timeoutId: number | undefined;
      try {
        const controller = new AbortController();
        timeoutId = window.setTimeout(() => controller.abort(), 5000); // 5 second timeout

        const response = await fetch("/api/health", {
          method: "GET",
          signal: controller.signal,
          headers: {
            Accept: "application/json",
          },
        });

        if (response.ok) {
          setOptions((prev) => ({
            ...prev,
            enabled: true,
            connectionStatus: "connected",
            lastConnectionTest: dayjs().valueOf(),
          }));
          return true;
        } else {
          setOptions((prev) => ({
            ...prev,
            connectionStatus: "error",
            lastConnectionTest: dayjs().valueOf(),
          }));
          return false;
        }
      } catch (error) {
        logger.error("Backend connection test failed:", error);
        setOptions((prev) => ({
          ...prev,
          connectionStatus: "error",
          lastConnectionTest: dayjs().valueOf(),
        }));
        return false;
      } finally {
        // Always clear the timeout
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
      }
    },
    [setOptions],
  );

  const disconnect = useCallback(() => {
    setOptions((prev) => ({
      ...prev,
      enabled: false,
      connectionStatus: "disconnected",
    }));
  }, [setOptions]);

  const contextValue = useMemo(
    () => ({
      options: normalizedOptions,
      isDevMode,
      helperConnectionStatus,
      updateAutoConnect,
      updateHdayHelperUrl,
      testHdayHelperConnection,
      toggleDevMode,
      testConnection,
      disconnect,
    }),
    [
      normalizedOptions,
      isDevMode,
      helperConnectionStatus,
      updateAutoConnect,
      updateHdayHelperUrl,
      testHdayHelperConnection,
      toggleDevMode,
      testConnection,
      disconnect,
    ],
  );

  return (
    <DeveloperOptionsContext.Provider value={contextValue}>{children}</DeveloperOptionsContext.Provider>
  );
}
