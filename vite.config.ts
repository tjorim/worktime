import reactPlugin from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Read version from package.json for injection
import * as packageJson from "./package.json";

export default defineConfig(() => ({
  base: "/worktime/",
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [reactPlugin()],
  css: {
    transformer: "lightningcss",
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
        // Better file organization
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
}));
