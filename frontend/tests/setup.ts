import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import * as React from "react";
import {
  ganttTasksCollection,
  labelsCollection,
  tasksCollection,
  templatesCollection,
  timeOffCollection,
  workLocationsCollection,
} from "@/db/collections";
import { server } from "@/mocks/server";
import { sseEmitter } from "@/mocks/data/sseEmitter";
import { resetMockScenario } from "@/mocks/scenarios/state";

// Make React available globally for JSX in tests
globalThis.React = React;

// ---------------------------------------------------------------------------
// Global react-oidc-context mocks — default no-session state.
//
// Individual test files (e.g. AuthContext.test.tsx) can override with their
// own vi.mock() calls for custom session behavior.
// ---------------------------------------------------------------------------
vi.mock("react-oidc-context", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    isAuthenticated: false,
    isLoading: false,
    user: null,
    signinRedirect: vi.fn().mockResolvedValue(undefined),
    signoutRedirect: vi.fn().mockResolvedValue(undefined),
    removeUser: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock localStorage (force override for compatibility)
if (typeof window !== "undefined") {
  const storage: Record<string, string> = {};
  Object.defineProperty(window, "localStorage", {
    writable: true,
    value: {
      getItem: (key: string) => storage[key] || null,
      setItem: (key: string, value: string) => {
        storage[key] = value;
      },
      removeItem: (key: string) => {
        delete storage[key];
      },
      clear: () => {
        Object.keys(storage).forEach((key) => delete storage[key]);
      },
      get length() {
        return Object.keys(storage).length;
      },
      key: (index: number) => Object.keys(storage)[index] || null,
    },
  });
}

// Mock window.matchMedia (for responsive design components)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// ---------------------------------------------------------------------------
// TanStack DB collection cleanup helper
//
// QueryCollection-backed collections are module-level singletons. Unlike
// localStorage, they are NOT reset by localStorage.clear(). We must explicitly
// delete every row before each test to prevent state from bleeding between tests.
//
// We use `collection.delete(id)` directly rather than `utils.writeBatch` +
// `utils.writeDelete` because the latter requires an active sync context, which
// may not be present when the cleanup runs outside a React component tree.
// The regular `delete` works without a sync context. Its `onDelete` push handler
// fires but is a no-op in tests because `_currentUserId` is null.
// ---------------------------------------------------------------------------

async function resetTestState(): Promise<void> {
  document.body.innerHTML = "";
  localStorage.clear();

  await Promise.all([
    ganttTasksCollection.cleanup(),
    tasksCollection.cleanup(),
    labelsCollection.cleanup(),
    templatesCollection.cleanup(),
    timeOffCollection.cleanup(),
    workLocationsCollection.cleanup(),
  ]);
}

// ---------------------------------------------------------------------------
// MSW server lifecycle
// ---------------------------------------------------------------------------

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

// Set up DOM environment
beforeEach(async () => {
  await resetTestState();
  resetMockScenario();
});

afterEach(async () => {
  cleanup();
  server.resetHandlers();
  sseEmitter.reset();
  await resetTestState();
});

afterAll(() => {
  server.close();
});

// Note: dayjs plugins are handled by actual imports in components for better compatibility
