import { fileURLToPath } from "node:url";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import reactPlugin from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Read version from package.json for injection in tests
import * as packageJson from "./package.json";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- paraglide plugin types don't match vitest's plugin type
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/paraglide",
      strategy: ["localStorage", "preferredLanguage", "baseLocale"],
    }) as any,
    reactPlugin() as ReturnType<typeof reactPlugin>,
  ],
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
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/paraglide/**", "src/main.tsx", "src/assets/**"],
      reporter: ["text", "lcov"],
    },
  },
});
