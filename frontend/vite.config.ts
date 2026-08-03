import { paraglideVitePlugin } from "@inlang/paraglide-js";
import reactPlugin from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Read version from package.json for injection
import * as packageJson from "./package.json";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
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
        globIgnores: [
          // MSW's mock worker is dev-only tooling; it has no place in the production precache.
          "mockServiceWorker.js",
          // The OPFS persistence worker carries the WA-SQLite WASM inlined as
          // base64 — ~1.7 MB, two thirds of the precache on its own. Precaching
          // it would make every install pay for it up front. It is fetched on
          // the first page load anyway (persistence starts at app startup, which
          // is necessarily online), so the CacheFirst rule below has it cached
          // well before any offline launch. Its filename is content-hashed, so
          // a new build fetches a new URL rather than serving a stale worker.
          "assets/js/opfs-worker-*.js",
        ],
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
          {
            // Content-hashed and immutable, so CacheFirst is safe: a changed
            // worker arrives under a different URL.
            urlPattern: ({ url }) => /^\/assets\/js\/opfs-worker-/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "opfs-worker-cache",
              // Two, so a deploy can keep the outgoing worker alive for tabs
              // still running the previous build.
              expiration: { maxEntries: 2 },
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
