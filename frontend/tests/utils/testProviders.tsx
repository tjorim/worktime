/**
 * Shared React test provider utilities.
 *
 * Provides a canonical QueryClient factory and a TestProviders wrapper that
 * mirrors the App provider composition (without SuperTokensWrapper / AuthProvider
 * which carry network side effects). Import these in component/integration tests
 * that need QueryClient, Settings, Toast, or EventStore context.
 */
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DeveloperOptionsProvider } from "../../src/contexts/DeveloperOptionsContext";
import { EventStoreProvider } from "../../src/contexts/EventStoreContext";
import { SettingsProvider } from "../../src/contexts/SettingsContext";
import { ToastProvider } from "../../src/contexts/ToastContext";

/**
 * Create an isolated QueryClient with retries disabled so test assertions
 * aren't delayed by React Query's built-in retry logic.
 */
export function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/**
 * Full provider wrapper for component tests. Includes:
 * QueryClientProvider → SettingsProvider → EventStoreProvider →
 * DeveloperOptionsProvider → ToastProvider
 *
 * Each call creates a fresh QueryClient so tests are fully isolated.
 */
export function TestProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      <SettingsProvider>
        <EventStoreProvider>
          <DeveloperOptionsProvider>
            <ToastProvider>{children}</ToastProvider>
          </DeveloperOptionsProvider>
        </EventStoreProvider>
      </SettingsProvider>
    </QueryClientProvider>
  );
}
