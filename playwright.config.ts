import { defineConfig } from "@playwright/test";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:4173${basePath}/`,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    launchOptions: {
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
      // Ignore SSH-forwarded displays: headless ANGLE must use its own surface.
      env: { ...process.env, DISPLAY: "" },
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: "npm run serve",
    url: `http://127.0.0.1:4173${basePath}/`,
    reuseExistingServer: !process.env.CI,
  },
});
