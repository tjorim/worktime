// @ts-nocheck -- workaround for TypeScript 5.9.x internal crash (TS Debug Failure) with vite-plus alpha's deeply-nested defineConfig overloads
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import reactPlugin from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

// Read version from package.json for injection
import * as packageJson from "./package.json" with { type: "json" };

export default defineConfig({
  fmt: {
    "ignorePatterns": [
      "**/node_modules",
      "**/dist",
      "**/build",
      "**/coverage",
      "NextShift/**",
      "HdayPlanner/**"
    ]
  },
  lint: {
    "plugins": [
      "react"
    ],
    "ignorePatterns": [
      "dist/**",
      "build/**",
      "coverage/**",
      "node_modules/**",
      "NextShift/**",
      "HdayPlanner/**"
    ],
    "options": {
      "typeAware": true
    }
  },
  base: "/worktime/",
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/paraglide",
      strategy: ["localStorage", "preferredLanguage", "baseLocale"],
    }),
    reactPlugin(),
  ],
  css: {
    transformer: "lightningcss",
    preprocessorOptions: {
      scss: {
        quietDeps: true,
      },
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    minify: "terser",
    cssMinify: "lightningcss",
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ["console.log", "console.info", "console.debug"],
      },
      mangle: {
        toplevel: true,
      },
    },
    rollupOptions: {
      output: {
        chunkFileNames: "assets/js/[name]-[hash].js",
        entryFileNames: "assets/js/[name]-[hash].js",
        assetFileNames: "assets/[ext]/[name]-[hash].[ext]",
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react") || id.includes("react-dom")) {
              return "vendor-react";
            }
            if (id.includes("react-bootstrap") || id.includes("bootstrap")) {
              return "vendor-ui";
            }
            if (id.includes("dayjs")) {
              return "vendor-utils";
            }
            if (id.includes("frappe-gantt")) {
              return "vendor-gantt";
            }
          }
        },
      },
    },
  },
  server: {
    port: 8000,
    open: true,
    cors: true,
  },
});
