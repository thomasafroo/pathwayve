import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    env: {
      DATA_MODE: "demo",
      MAPS_DATA_MODE: "demo",
      // Keep tests offline even when a developer's .env enables live weather.
      WEATHER_DATA_MODE: "off",
      MAPS_GROUNDING: "off",
      NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "",
      NEXT_DIST_DIR: ".next-e2e",
      DATABASE_URL: "",
      TIGER_DATABASE_URL: "",
      PGLITE_DATA_DIR: `.pathwayve/e2e-${process.pid}`,
    },
    timeout: 120_000,
  },
});
