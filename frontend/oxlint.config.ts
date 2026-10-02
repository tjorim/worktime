import { defineConfig } from "oxlint";
import legacyInlineStyles from "./legacy-inline-styles.json" with { type: "json" };
import legacyClasses from "./legacy-classes.json" with { type: "json" };

// DOM hooks used by tests/integrations; these intentionally have no CSS.
const legacyHooks = [
  "time-tracking-view",
  "hover-highlight",
  "month-calendar-work-location",
  "schedule-tab-view",
  "team-schedule-view",
];

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
  overrides: Object.entries(legacyInlineStyles).map(([file, allow]) => ({
    files: [file],
    rules: { "shadcn/no-inline-styles": ["error", { allow }] },
  })),
  rules: {
    "no-console": "error",
    "shadcn/no-arbitrary-values": "error",
    "shadcn/no-raw-colors": [
      "error",
      {
        allow: legacyClasses.filter((name) =>
          /^(bg|text|border|ring|outline|fill|stroke|decoration|shadow|divide|accent|caret|from|via|to)-/.test(
            name,
          ),
        ),
      },
    ],
    "shadcn/no-inline-styles": "error",
    "shadcn/no-unknown-classes": ["error", { allow: [...legacyClasses, ...legacyHooks] }],
  },
});
