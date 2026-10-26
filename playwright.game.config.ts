import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/game.spec.ts",
  timeout: 300000,
  workers: 1,
  expect: { timeout: 15000 },
  use: {
    baseURL: "http://127.0.0.1:5176",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    },
  },
  webServer: {
    command: "VITE_USE_EMULATORS=true npm run dev -- --port 5176",
    url: "http://127.0.0.1:5176",
    reuseExistingServer: !process.env.CI,
  },
});
