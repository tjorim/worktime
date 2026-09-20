import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:8000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /\.authenticated\.spec\.ts/,
    },
    // Specs matching *.authenticated.spec.ts run pre-logged-in and past
    // onboarding (see e2e/auth.setup.ts) instead of hitting the real Keycloak
    // login flow and the first-run wizard.
    {
      name: "chromium-authenticated",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
      testMatch: /\.authenticated\.spec\.ts/,
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "pnpm exec vite --no-open",
    url: "http://localhost:8000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_MSW: "true",
    },
  },
});
