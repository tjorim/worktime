import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocalStorage } from "../hooks/useLocalStorage";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface DeveloperOptions {
  enabled: boolean;
  apiUrl: string;
  connectionStatus: ConnectionStatus;
  lastConnectionTest: number | null; // timestamp
  autoConnect: boolean;
  isDevMode: boolean; // Persist dev mode visibility
}

interface DeveloperOptionsContextType {
  options: DeveloperOptions;
  isDevMode: boolean;
  updateApiUrl: (url: string) => void;
  updateAutoConnect: (autoConnect: boolean) => void;
  toggleDevMode: () => void;
  testConnection: (url?: string) => Promise<boolean>;
  disconnect: () => void;
}

const defaultOptions: DeveloperOptions = {
  enabled: false,
  apiUrl: "http://localhost:8000",
  connectionStatus: "disconnected",
  lastConnectionTest: null,
  autoConnect: false,
  isDevMode: false,
};

const STORAGE_KEY = "worktime_developer_options";

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
  const [options, setOptions] = useLocalStorage<DeveloperOptions>(STORAGE_KEY, defaultOptions);

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

  const updateApiUrl = useCallback(
    (url: string) => {
      setOptions((prev) => ({
        ...prev,
        apiUrl: url,
        connectionStatus: "disconnected",
        enabled: false,
        lastConnectionTest: null,
      }));
    },
    [setOptions],
  );

  const updateAutoConnect = useCallback(
    (autoConnect: boolean) => {
      setOptions((prev) => ({ ...prev, autoConnect }));
    },
    [setOptions],
  );

  const toggleDevMode = useCallback(() => {
    setIsDevMode((prev) => !prev);
  }, []);

  const testConnection = useCallback(
    async (url?: string): Promise<boolean> => {
      const testUrl = url || options.apiUrl;
      if (!testUrl) {
        return false;
      }

      setOptions((prev) => ({ ...prev, connectionStatus: "connecting" }));

      let timeoutId: number | undefined;
      try {
        const controller = new AbortController();
        timeoutId = window.setTimeout(() => controller.abort(), 5000); // 5 second timeout

        const response = await fetch(`${testUrl}/v1/health`, {
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
            lastConnectionTest: Date.now(),
          }));
          return true;
        } else {
          setOptions((prev) => ({
            ...prev,
            connectionStatus: "error",
            lastConnectionTest: Date.now(),
          }));
          return false;
        }
      } catch (error) {
        console.error("Backend connection test failed:", error);
        setOptions((prev) => ({
          ...prev,
          connectionStatus: "error",
          lastConnectionTest: Date.now(),
        }));
        return false;
      } finally {
        // Always clear the timeout
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
      }
    },
    [options.apiUrl, setOptions],
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
      updateApiUrl,
      updateAutoConnect,
      toggleDevMode,
      testConnection,
      disconnect,
    }),
    [
      options,
      isDevMode,
      updateApiUrl,
      updateAutoConnect,
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
