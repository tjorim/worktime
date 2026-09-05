import { paraglideVitePlugin } from "@inlang/paraglide-js";
import reactPlugin from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Read version from package.json for injection
import packageJson from "./package.json" with { type: "json" };

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },
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
    VitePWA({
      // "prompt" (not "autoUpdate") so the app controls when the new SW activates,
      // via the "new version available" toast (see src/components/PwaUpdateToast.tsx).
      registerType: "prompt",
      // We call registerSW ourselves from PwaUpdateToast instead of the
      // plugin's auto-injected <script>, so it can drive the toast UI.
      injectRegister: false,
      manifest: {
        name: "Worktime - Schedule & Time Off",
        short_name: "Worktime",
        description:
          "Work schedule tracker and time-off manager supporting multiple roster patterns",
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: "#0d6efd",
        background_color: "#ffffff",
        icons: [
          { src: "/assets/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/assets/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/assets/icons/icon-192-maskable.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/assets/icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // App-shell precache: build output plus static assets copied from public/.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        // MSW's mock worker is dev-only tooling; it has no place in the production precache.
        // push-sw.js is imported as code below, not precached content.
        // The manifest.icons entries below are already added to the precache (with their
        // own `?__WB_REVISION__=` query) by vite-plugin-pwa's manifest-icon injection, so
        // also matching them via globPatterns registers the same URL twice with two
        // different revisioning schemes — workbox rejects that as a conflicting entry and
        // the SW fails to install. Excluding them here leaves the manifest-icon injection
        // as the only source, which still guarantees they're precached.
        globIgnores: [
          "mockServiceWorker.js",
          "push-sw.js",
          "assets/icons/icon-192.png",
          "assets/icons/icon-512.png",
          "assets/icons/icon-192-maskable.png",
          "assets/icons/icon-512-maskable.png",
        ],
        // Adds the push/notificationclick handlers (public/push-sw.js) to the generated
        // service worker via importScripts, rather than switching to injectManifest —
        // keeps the existing precaching/update-toast behavior completely untouched.
        importScripts: ["push-sw.js"],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 10,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      // Keep the SW inactive in dev so it never fights with the MSW mock worker
      // (which registers its own worker at the same "/" scope under VITE_MSW=true).
      devOptions: {
        enabled: false,
      },
    }),
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
          const normalizedId = id.replaceAll("\\", "/");
          if (normalizedId.includes("/node_modules/")) {
            if (
              normalizedId.includes("/react-bootstrap/") ||
              normalizedId.includes("/bootstrap/")
            ) {
              return "vendor-ui";
            }
            if (/\/node_modules\/(react|react-dom|scheduler)\//.test(normalizedId)) {
              return "vendor-react";
            }
            if (
              normalizedId.includes("/node_modules/@tanstack/react-table/") ||
              normalizedId.includes("/node_modules/@tanstack/table-core/")
            ) {
              return "vendor-table";
            }
            if (
              normalizedId.includes("/node_modules/@tanstack/react-db/") ||
              normalizedId.includes("/node_modules/@tanstack/db/") ||
              normalizedId.includes("/node_modules/@tanstack/query-db-collection/")
            ) {
              return "vendor-db";
            }
            if (
              normalizedId.includes("/node_modules/@tanstack/react-query/") ||
              normalizedId.includes("/node_modules/@tanstack/query-core/")
            ) {
              return "vendor-query";
            }
            if (normalizedId.includes("/node_modules/@schedule-x/")) {
              return "vendor-calendar";
            }
            if (
              normalizedId.includes("/node_modules/temporal-polyfill/") ||
              normalizedId.includes("/node_modules/temporal-spec/") ||
              normalizedId.includes("/node_modules/temporal-utils/")
            ) {
              return "vendor-temporal";
            }
            if (
              normalizedId.includes("/node_modules/react-select/") ||
              normalizedId.includes("/node_modules/@emotion/")
            ) {
              return "vendor-select";
            }
            if (normalizedId.includes("/dayjs/")) {
              return "vendor-utils";
            }
            if (normalizedId.includes("/frappe-gantt/")) {
              return "vendor-gantt";
            }
            return "vendor";
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
