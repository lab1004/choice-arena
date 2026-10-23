import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/auth.spec.ts",
  use: {
    baseURL: "http://127.0.0.1:5175",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    },
  },
  webServer: {
    command: "VITE_USE_EMULATORS=true npm run dev -- --port 5175",
    url: "http://127.0.0.1:5175",
    reuseExistingServer: !process.env.CI,
  },
});
