import { beforeEach, vi } from "vitest";
import "@testing-library/jest-dom";
import * as React from "react";
import {
  ganttTasksCollection,
  labelsCollection,
  tasksCollection,
  templatesCollection,
  timeOffCollection,
  workLocationsCollection,
} from "@/db/collections";

// Make React available globally for JSX in tests
globalThis.React = React;

// Type augmentation for jest-dom matchers
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

declare module "vitest" {
  interface Assertion<T = any> extends TestingLibraryMatchers<T, void> {} // oxlint-disable-line typescript/no-explicit-any -- Required for generic type parameter defaults
  interface AsymmetricMatchersContaining<T = any> extends TestingLibraryMatchers<T, void> {} // oxlint-disable-line typescript/no-explicit-any -- Required for generic type parameter defaults
}

// ---------------------------------------------------------------------------
// Global SuperTokens mocks — default no-session state.
//
// Individual test files (e.g. AuthContext.test.tsx) can override with their
// own vi.mock() calls for custom session behavior.
// ---------------------------------------------------------------------------
vi.mock("supertokens-auth-react", () => ({
  redirectToAuth: vi.fn().mockResolvedValue(undefined),
  SuperTokensWrapper: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("supertokens-auth-react/recipe/session", () => ({
  default: {
    signOut: vi.fn().mockResolvedValue(undefined),
  },
  useSessionContext: () => ({
    loading: false,
    doesSessionExist: false,
    userId: "",
    accessTokenPayload: {},
    invalidClaims: [],
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

function clearTanStackCollection(
  collection: { toArray: unknown[]; has: (id: string) => boolean; delete: (id: string) => void },
  getKey: (item: unknown) => string,
): void {
  const items = [...(collection.toArray as unknown[])];
  for (const item of items) {
    const id = getKey(item);
    try {
      if (collection.has(id)) collection.delete(id);
    } catch {
      // Ignore if the item was already removed
    }
  }
}

// Set up DOM environment
beforeEach(() => {
  // Clear document body
  document.body.innerHTML = "";

  // Reset localStorage
  localStorage.clear();

  // Clear all TanStack DB collections so tests start with a clean slate.
  // queryCollectionOptions-backed collections are module-level singletons and
  // are not affected by localStorage.clear().
  clearTanStackCollection(ganttTasksCollection, (item) => (item as { id: string }).id);
  clearTanStackCollection(tasksCollection, (item) => (item as { id: string }).id);
  clearTanStackCollection(labelsCollection, (item) => (item as { id: string }).id);
  clearTanStackCollection(templatesCollection, (item) => (item as { id: string }).id);
  clearTanStackCollection(timeOffCollection, (item) => (item as { id: string }).id);
  clearTanStackCollection(workLocationsCollection, (item) => (item as { date: string }).date);
});

// Note: dayjs plugins are handled by actual imports in components for better compatibility
