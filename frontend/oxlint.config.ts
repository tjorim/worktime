import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["react"],
  ignorePatterns: [
    "dist/**",
    "build/**",
    "coverage/**",
    "node_modules/**",
    "NextShift/**",
    "HdayPlanner/**",
  ],
  jsPlugins: ["@shadcn/lint"],
  rules: {
    "no-console": "error",
    "shadcn/no-arbitrary-values": "error",
    "shadcn/no-raw-colors": "error",
    "shadcn/no-inline-styles": "error",
    "shadcn/no-unknown-classes": "error",
  },
});
