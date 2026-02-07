import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/get_tasks": "http://127.0.0.1:8876",
      "/add_task": "http://127.0.0.1:8876",
      "/remove_task": "http://127.0.0.1:8876",
      "/update_task_times": "http://127.0.0.1:8876",
      "/get_tasks_range": "http://127.0.0.1:8876",
      "/get_templates": "http://127.0.0.1:8876",
      "/add_template": "http://127.0.0.1:8876",
      "/update_template": "http://127.0.0.1:8876",
      "/delete_template": "http://127.0.0.1:8876",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
