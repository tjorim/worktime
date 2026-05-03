import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { dayjs } from "@/utils/dateTimeUtils";
import { DEVELOPER_OPTIONS_STORAGE_KEY } from "@/constants/storageKeys";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface DeveloperOptions {
  enabled: boolean;
  connectionStatus: ConnectionStatus;
  lastConnectionTest: number | null; // timestamp
  autoConnect: boolean;
  isDevMode: boolean; // Persist dev mode visibility
  hdayHelperUrl: string | null; // URL of the local .hday helper server
}

interface DeveloperOptionsContextType {
  options: DeveloperOptions;
  isDevMode: boolean;
  updateAutoConnect: (autoConnect: boolean) => void;
  updateHdayHelperUrl: (url: string | null) => void;
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

  // Use persisted isDevMode from options
  const [isDevMode, setIsDevMode] = useState(options.isDevMode);

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
    if (options.enabled && options.autoConnect) {
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
    },
    [setOptions],
  );

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
        console.error("Backend connection test failed:", error);
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
      options,
      isDevMode,
      updateAutoConnect,
      updateHdayHelperUrl,
      toggleDevMode,
      testConnection,
      disconnect,
    }),
    [
      options,
      isDevMode,
      updateAutoConnect,
      updateHdayHelperUrl,
      toggleDevMode,
      testConnection,
      disconnect,
    ],
  );

  return (
    <DeveloperOptionsContext.Provider value={contextValue}>
      {children}
    </DeveloperOptionsContext.Provider>
  );
}
