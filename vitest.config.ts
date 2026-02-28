import reactPlugin from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Read version from package.json for injection in tests
import * as packageJson from "./package.json";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [reactPlugin()] as any,
  resolve: {
    alias: {
      "frappe-gantt": fileURLToPath(new URL("tests/__mocks__/frappe-gantt.ts", import.meta.url)),
      "react-select": fileURLToPath(new URL("tests/__mocks__/react-select.tsx", import.meta.url)),
    },
  },
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/NextShift/**",
      "**/HdayPlanner/**",
    ],
    typecheck: {
      tsconfig: "./tsconfig.test.json",
    },
    coverage: {
      reporter: ["text", "lcov"],
    },
  },
});
