import { beforeEach } from "vitest";
import "@testing-library/jest-dom";
import * as React from "react";

// Make React available globally for JSX in tests
globalThis.React = React;

// Type augmentation for jest-dom matchers
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

declare module "vitest" {
  interface Assertion<T = any> extends TestingLibraryMatchers<T, void> {} // oxlint-disable-line typescript/no-explicit-any -- Required for generic type parameter defaults
  interface AsymmetricMatchersContaining<T = any> extends TestingLibraryMatchers<T, void> {} // oxlint-disable-line typescript/no-explicit-any -- Required for generic type parameter defaults
}

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

// Set up DOM environment
beforeEach(() => {
  // Clear document body
  document.body.innerHTML = "";

  // Reset localStorage
  localStorage.clear();
});

// Note: dayjs plugins are handled by actual imports in components for better compatibility
