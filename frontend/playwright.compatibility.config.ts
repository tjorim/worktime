import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  workers: 1,
  projects: ["firefox", "webkit"].flatMap((browser) => {
    const use = {
      ...devices[browser === "firefox" ? "Desktop Firefox" : "Desktop Safari"],
      ...(browser === "firefox" && process.env.REMOTE_FIREFOX_WS_ENDPOINT
        ? { connectOptions: { wsEndpoint: process.env.REMOTE_FIREFOX_WS_ENDPOINT } }
        : {}),
      ...(browser === "webkit" && process.env.REMOTE_WEBKIT_WS_ENDPOINT
        ? { connectOptions: { wsEndpoint: process.env.REMOTE_WEBKIT_WS_ENDPOINT } }
        : {}),
    };
    return [
      {
        name: browser,
        testMatch: [
          "**/calendar-dnd.spec.ts",
          "**/dialog-pickers.spec.ts",
          "**/sync-status.spec.ts",
        ],
        use,
      },
      {
        name: browser + "-pwa",
        testMatch: "**/pwa-offline.pwa.spec.ts",
        use: { ...use, baseURL: "http://localhost:4174" },
      },
    ];
  }),
});
