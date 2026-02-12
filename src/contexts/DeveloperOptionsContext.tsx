import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useLocalStorage } from "../hooks/useLocalStorage";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface DeveloperOptions {
  enabled: boolean;
  apiUrl: string;
  connectionStatus: ConnectionStatus;
  lastConnectionTest: number | null; // timestamp
  autoConnect: boolean;
}

interface DeveloperOptionsContextType {
  options: DeveloperOptions;
  isDevMode: boolean;
  updateApiUrl: (url: string) => void;
  updateAutoConnect: (autoConnect: boolean) => void;
  toggleDevMode: () => void;
  testConnection: () => Promise<boolean>;
  disconnect: () => void;
}

const defaultOptions: DeveloperOptions = {
  enabled: false,
  apiUrl: "http://localhost:8000",
  connectionStatus: "disconnected",
  lastConnectionTest: null,
  autoConnect: false,
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
  const [isDevMode, setIsDevMode] = useState(false);

  // Check URL parameter for dev mode on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("dev") === "true") {
        setIsDevMode(true);
      }
    }
  }, []);

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (options.enabled && options.autoConnect && options.connectionStatus === "disconnected") {
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

  const testConnection = useCallback(async (): Promise<boolean> => {
    if (!options.apiUrl) {
      return false;
    }

    setOptions((prev) => ({ ...prev, connectionStatus: "connecting" }));

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch(`${options.apiUrl}/v1/health`, {
        method: "GET",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
      });

      clearTimeout(timeoutId);

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
    }
  }, [options.apiUrl, setOptions]);

  const disconnect = useCallback(() => {
    setOptions((prev) => ({
      ...prev,
      enabled: false,
      connectionStatus: "disconnected",
    }));
  }, [setOptions]);

  return (
    <DeveloperOptionsContext.Provider
      value={{
        options,
        isDevMode,
        updateApiUrl,
        updateAutoConnect,
        toggleDevMode,
        testConnection,
        disconnect,
      }}
    >
      {children}
    </DeveloperOptionsContext.Provider>
  );
}
