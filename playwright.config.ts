import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  expect: { timeout: 5000 },
  fullyParallel: false,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  reporter: "list",
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "bun apps/server/src/test/e2e-server.ts",
    reuseExistingServer: false,
    timeout: 30_000,
    url: "http://127.0.0.1:4173/api/health",
  },
});
